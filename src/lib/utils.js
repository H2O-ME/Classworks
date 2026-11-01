import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// shadcn-vue 约定：类名合并（后写的 Tailwind 类覆盖冲突的旧类）
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
