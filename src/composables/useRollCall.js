import { ref } from "vue";
import { getDefaultRoster, pickRandomIndex } from "@/utils/roster";

const ROLL_DURATION_MS = 1100;
const LAND_SETTLE_MS = 450;

export function useRollCall() {
  const visible = ref(false);
  const roster = ref(getDefaultRoster());
  const step = ref("list");
  const name = ref("");
  const rolling = ref(false);
  const landed = ref(false);
  let index = -1;
  let rafId = null;
  let timer = null;

  function stop() {
    cancelAnimationFrame(rafId);
    clearTimeout(timer);
    rafId = null;
    timer = null;
    rolling.value = false;
  }

  function open() {
    stop();
    step.value = "list";
    visible.value = true;
  }

  // 滚动阶段用 rAF 高频换名，到时间定格；定格后补一个弹跳收尾
  function roll() {
    if (rolling.value) return;
    stop();
    step.value = "pick";
    rolling.value = true;
    landed.value = false;
    const start = performance.now();
    const frame = (now) => {
      index = pickRandomIndex(roster.value, index);
      name.value = index >= 0 ? roster.value[index] : "";
      if (now - start < ROLL_DURATION_MS) {
        rafId = requestAnimationFrame(frame);
        return;
      }
      rafId = null;
      landed.value = true;
      timer = setTimeout(() => {
        timer = null;
        rolling.value = false;
      }, LAND_SETTLE_MS);
    };
    rafId = requestAnimationFrame(frame);
  }

  function close() {
    stop();
    visible.value = false;
    landed.value = false;
  }

  return { visible, roster, step, name, rolling, landed, open, roll, close };
}
