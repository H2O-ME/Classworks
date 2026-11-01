import { computed, reactive, ref, shallowRef } from "vue";
import {
  getBoard,
  getHistory,
  normalizeHistory,
  readConflictBody,
  retryDelay,
  RETRY_MAX_TRIES,
  saveSubject as postSubject,
} from "@/api/board";
import { boardFromApi, formatDateKey } from "@/utils/board";
import { useAuth } from "./useAuth";

const CACHE_PREFIX = "classworks:board:";

function cacheKey(room, date) {
  return `${CACHE_PREFIX}${room}:${date}`;
}

// SWR 缓存：localStorage 存「某房间某天」最后一版快照，刷新/断网时先上屏
function readCache(room, date) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(cacheKey(room, date)) || "null");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(room, date, state) {
  try {
    window.localStorage.setItem(cacheKey(room, date), JSON.stringify(state));
  } catch (error) {
    // 配额满不该影响看板：内存里已是准的，跳过持久化
    console.warn("写入本地缓存失败:", error);
  }
}

export function useBoard() {
  const { room, writeKey, isWritable } = useAuth();

  const currentDate = ref(formatDateKey(new Date()));
  const boardData = shallowRef({});
  const updatedAtMap = shallowRef({});
  const syncState = ref("idle");
  const conflict = ref(null);
  const history = ref([]);

  // 重试队列按「日期|学科」去重：同一科反复保存只保留最后一次内容
  const pending = reactive(new Map());
  let timer = null;
  let tries = 0;

  // Map 的 size 是响应式的：有任何未落库的改动就允许 UI 提示「已暂存」
  const hasPending = computed(() => pending.size > 0);

  function replaceState(next) {
    boardData.value = next.board;
    updatedAtMap.value = next.updatedAtMap;
  }

  function persistCache() {
    writeCache(room.value, currentDate.value, {
      subjects: Object.fromEntries(
        Object.entries(boardData.value).map(([subject, content]) => [
          subject,
          { content, updatedAt: updatedAtMap.value[subject] || 0 },
        ]),
      ),
    });
  }

  async function load(date = currentDate.value) {
    currentDate.value = date;
    conflict.value = null;

    // SWR 的关键：缓存同步读出，函数返回前就已上屏；下面的 GET 只做静默校正
    const cached = readCache(room.value, date);
    if (cached) replaceState(boardFromApi(cached.subjects));

    syncState.value = "syncing";
    try {
      const data = await getBoard(room.value, date);
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
        room: room.value,
        date: entry.date,
        subject: entry.subject,
        content: entry.content,
        baseUpdatedAt: entry.baseUpdatedAt,
        writeKey: writeKey.value,
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
      return { ok: true };
    } catch (error) {
      if (error.status === 409) {
        const cloud = readConflictBody(error.body);
        conflict.value = {
          date: entry.date,
          subject: entry.subject,
          baseUpdatedAt: entry.baseUpdatedAt,
          localContent: entry.content,
          cloudContent: cloud.content,
          cloudUpdatedAt: cloud.updatedAt,
        };
        syncState.value = "idle";
        return { ok: false, conflict: true };
      }
      if (error.status === 401) {
        syncState.value = "error";
        return { ok: false, unauthorized: true, message: error.message };
      }
      // 网络错误/5xx：留在队列里退避重试，内容不丢
      syncState.value = "offline";
      return { ok: false, retry: true, message: error.message };
    }
  }

  function enqueue(entry) {
    pending.set(`${entry.date}|${entry.subject}`, entry);
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
        // 已进冲突态的不自动重试，等用户在界面里裁决
        if (conflict.value?.subject === entry.subject) continue;
        const result = await submit(entry);
        if (result.retry) {
          pending.set(`${entry.date}|${entry.subject}`, entry);
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
    const date = currentDate.value;
    const entry = {
      date,
      subject,
      content: text,
      baseUpdatedAt: updatedAtMap.value[subject] || 0,
    };

    // 乐观更新：先改本地立即上屏，再谈同步
    boardData.value = { ...boardData.value, [subject]: text };
    persistCache();

    const result = await submit(entry);
    if (result.retry) enqueue(entry);
    return result;
  }

  // 用户裁决：用本地内容强制覆盖云端（基线换成云端时间戳，服务端才放行）
  async function resolveConflictKeepLocal() {
    const current = conflict.value;
    if (!current) return { ok: false };
    conflict.value = null;
    const entry = {
      date: current.date,
      subject: current.subject,
      content: current.localContent,
      baseUpdatedAt: current.cloudUpdatedAt,
    };
    const result = await submit(entry);
    if (result.retry) enqueue(entry);
    return result;
  }

  // 用户裁决：接受云端内容，放弃本地这一次编辑
  function resolveConflictTakeCloud() {
    const current = conflict.value;
    if (!current) return;
    const nextBoard = { ...boardData.value };
    if (current.cloudContent.trim()) nextBoard[current.subject] = current.cloudContent;
    else delete nextBoard[current.subject];
    boardData.value = nextBoard;
    updatedAtMap.value = { ...updatedAtMap.value, [current.subject]: current.cloudUpdatedAt };
    persistCache();
    conflict.value = null;
  }

  async function loadHistory() {
    try {
      history.value = normalizeHistory(await getHistory(room.value, currentDate.value));
    } catch (error) {
      history.value = [];
      console.warn("读取历史失败:", error.message);
    }
    return history.value;
  }

  // 历史回填：把某条流水的内容当作一次普通单科保存提交，走同一套冲突/重试逻辑
  async function restoreFromHistory(item) {
    if (!item?.subject) return { ok: false };
    const result = await saveSubject(item.subject, item.content || "");
    if (result.ok) await loadHistory();
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
    room,
    isWritable,
    currentDate,
    boardData,
    updatedAtMap,
    conflict,
    history,
    syncState,
    hasPending,
    load,
    saveSubject,
    resolveConflictKeepLocal,
    resolveConflictTakeCloud,
    loadHistory,
    restoreFromHistory,
    retryNow,
    dispose,
  };
}
