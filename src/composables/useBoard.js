import { computed, reactive, ref, shallowRef } from "vue";
import { getBoard, retryDelay, RETRY_MAX_TRIES, saveSubject as postSubject } from "@/api/board";
import { boardFromApi, formatDateKey, mergeRemote } from "@/utils/board";
import { useAuth } from "./useAuth";

const CACHE_PREFIX = "classworks:board:";

// SWR 缓存：localStorage 存「某天」最后一版快照，刷新/断网时先上屏
function readCache(date) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(`${CACHE_PREFIX}${date}`) || "null");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(date, state) {
  try {
    window.localStorage.setItem(`${CACHE_PREFIX}${date}`, JSON.stringify(state));
  } catch (error) {
    // 配额满不该影响看板：内存里已是准的，跳过持久化
    console.warn("写入本地缓存失败:", error);
  }
}

// 待发队列落盘：只存内存的话，切页/刷新就把「已暂存」的改动弄丢
const PENDING_KEY = "classworks:pending";

const pendingKey = (entry) => `${entry.date}|${entry.subject}`;

function readPendingQueue() {
  try {
    const list = JSON.parse(window.localStorage.getItem(PENDING_KEY) || "[]");
    if (!Array.isArray(list)) return [];
    return list.filter(
      (entry) => entry && typeof entry.date === "string" && typeof entry.subject === "string" && typeof entry.content === "string",
    );
  } catch {
    return [];
  }
}

function writePendingQueue(entries) {
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(entries));
  } catch (error) {
    // 配额满：队列留在内存里继续重试，只是刷新后会丢（与旧行为一致）
    console.warn("保存待发队列失败:", error);
  }
}

export function useBoard() {
  const { token, revokeBoardToken } = useAuth();

  const currentDate = ref(formatDateKey(new Date()));
  const boardData = shallowRef({});
  const updatedAtMap = shallowRef({});
  const syncState = ref("idle");
  const forbidden = ref("");

  // 重试队列按「日期|学科」去重：同科跨日期是两条不同改动，不能互相覆盖
  const pending = reactive(new Map());
  let timer = null;
  let tries = 0;

  const hasPending = computed(() => pending.size > 0);

  // 上次会话遗留的待发改动捞回来继续重试，别静默丢
  for (const entry of readPendingQueue()) pending.set(pendingKey(entry), entry);
  if (pending.size) scheduleRetry();

  function replaceState(next) {
    boardData.value = next.board;
    updatedAtMap.value = next.updatedAtMap;
  }

  function persistCache() {
    writeCache(
      currentDate.value,
      Object.fromEntries(
        Object.entries(boardData.value).map(([subject, content]) => [
          subject,
          { content, updatedAt: updatedAtMap.value[subject] || 0 },
        ]),
      ),
    );
  }

  async function load(date = currentDate.value) {
    currentDate.value = date;
    forbidden.value = "";

    // SWR 的关键：缓存同步读出，函数返回前就已上屏；下面的 GET 只做静默校正
    const cached = readCache(date);
    if (cached) replaceState(boardFromApi(cached));

    syncState.value = "syncing";
    try {
      const data = await getBoard(date);
      // 期间用户切了日期，晚到的响应不能覆盖当前视图
      if (date !== currentDate.value) return;
      replaceState(boardFromApi(data?.subjects));
      persistCache();
      syncState.value = "idle";
    } catch (error) {
      syncState.value = error.status === 0 ? "offline" : "error";
      if (error.status === 0) console.warn("拉取作业失败，使用本地缓存:", error.message);
    }
  }

  async function submit(entry) {
    syncState.value = "syncing";
    try {
      const result = await postSubject({
        date: entry.date,
        subject: entry.subject,
        content: entry.content,
        boardToken: token.value,
      });
      if (entry.date === currentDate.value) {
        boardData.value = { ...boardData.value, [entry.subject]: result?.content ?? entry.content };
        updatedAtMap.value = {
          ...updatedAtMap.value,
          [entry.subject]: Number(result?.updatedAt) || Date.now(),
        };
        persistCache();
      }
      // 同步成功就撤掉队列里的同一条：别让恢复出来的旧稿把刚保存的内容盖回去
      if (pending.delete(pendingKey(entry))) writePendingQueue([...pending.values()]);
      syncState.value = "idle";
      forbidden.value = "";
      return { ok: true };
    } catch (error) {
      // 403 是权限问题，重试多少次都一样：直接告诉用户，别进队列
      if (error.status === 403) {
        syncState.value = "idle";
        forbidden.value = error.message;
        return { ok: false, forbidden: true, message: error.message };
      }
      if (error.status === 401) {
        syncState.value = "error";
        // 口令被服务端否掉：立刻降级只读，别让 UI 继续假装能改
        revokeBoardToken();
        return { ok: false, unauthorized: true, message: error.message };
      }
      // 网络错误/5xx/429：留在队列里退避重试，内容不丢
      syncState.value = "offline";
      return { ok: false, retry: true, message: error.message };
    }
  }

  function enqueue(entry) {
    pending.set(pendingKey(entry), entry);
    writePendingQueue([...pending.values()]);
    scheduleRetry();
  }

  function scheduleRetry() {
    if (timer || !pending.size) return;
    tries += 1;
    timer = setTimeout(async () => {
      timer = null;
      const entries = [...pending.values()];
      pending.clear();
      let stillFailing = false;
      for (const entry of entries) {
        const result = await submit(entry);
        if (result.retry) {
          pending.set(pendingKey(entry), entry);
          stillFailing = true;
        }
      }
      writePendingQueue([...pending.values()]);
      if (!stillFailing) {
        tries = 0;
        return;
      }
      if (tries >= RETRY_MAX_TRIES) {
        // 放弃自动重试：内容仍在队列与本地缓存里，页面提示后由用户手动重试
        syncState.value = "error";
        return;
      }
      scheduleRetry();
    }, retryDelay(tries));
  }

  async function saveSubject(subject, content) {
    const text = String(content ?? "");
    const entry = { date: currentDate.value, subject, content: text };
    const before = boardData.value[subject] ?? "";

    // 乐观更新：先改本地立即上屏，再谈同步
    boardData.value = { ...boardData.value, [subject]: text };
    persistCache();

    const result = await submit(entry);
    if (result.retry) {
      enqueue(entry);
      return result;
    }
    // 权限被拒：画面必须退回原内容。否则用户看到字变了，以为存上了，其实一个字都没落库。
    if (!result.ok) {
      boardData.value = { ...boardData.value, [subject]: before };
      persistCache();
    }
    return result;
  }

  function retryNow() {
    clearTimeout(timer);
    timer = null;
    tries = 0;
    if (pending.size) scheduleRetry();
  }

  // ── 多设备同步：定时静默拉取当前日期，远端更新了就换上 ──
  // EdgeOne 时代 sync.js 的能力（60s 定时拉取 + 切回页面立即同步）在架构迁移时丢了，这里按新后端补回。
  // 合并语义：学科级 updatedAt 比对，只接受远端更新的科；本地有待发改动的科一律不动（内容还没落库）。
  const POLL_MS = 30000;
  let pollTimer = null;
  let onRemoteChange = null;

  function setOnRemoteChange(fn) {
    onRemoteChange = fn;
  }

  function startPolling() {
    if (pollTimer || typeof document === "undefined") return;
    // 后台标签页 setInterval 会被浏览器节流：切回页面时立即补一次
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    pollTimer = setInterval(poll, POLL_MS);
  }

  function stopPolling() {
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
    if (typeof window !== "undefined") window.removeEventListener("focus", onVisibility);
    clearInterval(pollTimer);
    pollTimer = null;
  }

  function onVisibility() {
    if (document.visibilityState === "visible") poll();
  }

  async function poll() {
    if (document.visibilityState !== "visible") return;
    const date = currentDate.value;
    try {
      const data = await getBoard(date);
      // 期间切了日期，晚到的响应不覆盖当前视图
      if (date !== currentDate.value) return;
      const next = boardFromApi(data?.subjects);
      const merged = mergeRemote({
        local: boardData.value,
        localAt: updatedAtMap.value,
        remote: next.board,
        remoteAt: next.updatedAtMap,
        pendingKeys: [...pending.keys()],
        dateKey: pendingKey({ date, subject: "" }),
      });
      if (merged) {
        boardData.value = merged.board;
        updatedAtMap.value = merged.updatedAtMap;
        persistCache();
        onRemoteChange?.();
      }
    } catch {
      // 轮询失败静默：离线提示由 load/submit 链路负责，不该每次失败都弹 toast
    }
  }

  function dispose() {
    clearTimeout(timer);
    timer = null;
    stopPolling();
  }

  return {
    currentDate,
    boardData,
    syncState,
    hasPending,
    forbidden,
    load,
    saveSubject,
    retryNow,
    startPolling,
    stopPolling,
    setOnRemoteChange,
    dispose,
  };
}
