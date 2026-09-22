"use client";

import { useSyncExternalStore } from "react";
import type { DiffTheme, Theme } from "@/lib/uiSettingsRules";

/**
 * 把三態的 `Theme` 解析成實際的 dark / light。
 *
 * `system` 只有瀏覽器知道答案（server 上解不出來），所以要問 `matchMedia`。
 * 用 `useSyncExternalStore` 而不是 `useEffect` + `useState`：後者第一幀一定是
 * 預設值，切到深色時會閃一下 —— 這個 app 之前就為了 media query 踩過這件事。
 *
 * ⚠️ 這支**只給需要「現在到底是深是淺」的邏輯用**（例如 diff 的 `follow`、
 * 換 highlight.js 樣式表）。畫面的顏色不要靠它 —— 那是 CSS token 的事，
 * 走 JS 就會回到「第一幀不對」的老問題。
 */
export function useResolvedTheme(theme: Theme): DiffTheme {
  const prefersDark = useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined") return () => {};
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    // server 端沒有 matchMedia。回 false（淺色）跟 CSS 的預設同一邊，
    // 所以 hydrate 前後不會互相矛盾。
    () => false
  );
  if (theme === "dark") return "dark";
  if (theme === "light") return "light";
  return prefersDark ? "dark" : "light";
}
