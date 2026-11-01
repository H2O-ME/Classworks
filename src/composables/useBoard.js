import { computed, reactive, ref, shallowRef } from "vue";
import { getBoard, retryDelay, RETRY_MAX_TRIES, saveSubject as postSubject } from "@/api/board";
import { boardFromApi, formatDateKey } from "@/utils/board";
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

export function useBoard() {
  const { token, boardToken, revokeBoardToken } = useAuth();

  const currentDate = ref(formatDateKey(new Date()));
  const boardData = shallowRef({});
  const updatedAtMap = shallowRef({});
  const syncState = ref("idle");
  const forbidden = ref("");

  // 重试队列按学科去重：同一科反复保存只保留最后一次内容
  const pending = reactive(new Map());
  let timer = null;
  let tries = 0;

  const hasPending = computed(() => pending.size > 0);

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
        token: token.value,
        boardToken: boardToken.value,
      });
      if (entry.date === currentDate.value) {
        boardData.value = { ...boardData.value, [entry.subject]: result?.content ?? entry.content };
        updatedAtMap.value = {
          ...updatedAtMap.value,
          [entry.subject]: Number(result?.updatedAt) || Date.now(),
        };
        persistCache();
      }
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
        // 白板口令被服务端否掉：立刻降级只读，别让 UI 继续假装能改
        revokeBoardToken();
        return { ok: false, unauthorized: true, message: error.message };
      }
      // 网络错误/5xx/429：留在队列里退避重试，内容不丢
      syncState.value = "offline";
      return { ok: false, retry: true, message: error.message };
    }
  }

  function enqueue(entry) {
    pending.set(entry.subject, entry);
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
          pending.set(entry.subject, entry);
          stillFailing = true;
        }
      }
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

  function dispose() {
    clearTimeout(timer);
    timer = null;
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
    dispose,
  };
}
