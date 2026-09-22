/** km web 的使用者偏好。純規則（客戶端要用） */

export type DiffTheme = "dark" | "light";

/**
 * 整個 app 的配色。三態（Jay 2026-09-22）：
 *   system  跟作業系統走 —— **純靠 CSS `@media`，不需要 JS**，所以結構上不可能閃
 *   light / dark  明確指定；由 server 從設定檔 SSR 成 `<html data-theme>`，也不會閃
 *
 * ⚠️ 三個值都要真的寫進 `data-theme`（包含 `system`）。不能用「沒有屬性＝跟隨系統」
 * —— 未轉換的頁面外層包著 `data-theme="light"` 的鎖，在那底下把屬性拿掉並不會讓
 * `@media` 重新生效，只會繼承到鎖的淺色。
 */
export type Theme = "system" | "light" | "dark";

export const THEMES: Theme[] = ["system", "light", "dark"];

/**
 * diff 檢視的配色。`follow` ＝ 跟著全域走。
 *
 * 保留獨立設定是刻意的（Jay 2026-09-22）：淺色頁面配深色 diff 是真的有人這樣用。
 * `follow` 只當**新安裝**的預設；已經明確選過 dark／light 的不動它。
 */
export type DiffThemePref = DiffTheme | "follow";

/** `/review-local` 交叉驗證要用哪個 CLI。預設 codex（Jay 2026-09-18 改的） */
export type ReviewEngine = "codex" | "claude";

export const REVIEW_ENGINES: ReviewEngine[] = ["codex", "claude"];

export interface UiSettings {
  /** 整個 app 的配色。預設跟隨系統 */
  theme: Theme;
  /** 看 diff 用深色還是淺色，或跟隨全域。既有安裝是 `dark`（Jay 2026-09-14） */
  diffTheme: DiffThemePref;
  /**
   * `scripts/review-local.sh` 預設用哪個引擎。
   *
   * 腳本會自己讀這個檔（`jq -r '.reviewEngine'`），所以在 web 上改完，
   * 之後在終端機打 `/review-local` 也會跟著換 —— 兩邊不會各記一套。
   */
  reviewEngine: ReviewEngine;
  updatedAt: string;
}

export const DEFAULT_UI_SETTINGS: UiSettings = {
  theme: "system",
  diffTheme: "dark",
  reviewEngine: "codex",
  updatedAt: "",
};

/** 只認得的值才收，其餘一律退回預設 —— 設定檔是手改得到的 */
export function normalizeUiSettings(input: unknown): UiSettings {
  const o = (input ?? {}) as Partial<UiSettings>;
  return {
    theme: o.theme === "light" || o.theme === "dark" ? o.theme : "system",
    // 舊設定檔沒有這一欄時是 `undefined` → 退回 `dark`，維持既有安裝的行為；
    // 新安裝拿到的是 DEFAULT_UI_SETTINGS，那裡也是 dark。改成 follow 要自己去設定頁選。
    diffTheme:
      o.diffTheme === "light" ? "light" : o.diffTheme === "follow" ? "follow" : "dark",
    reviewEngine: o.reviewEngine === "claude" ? "claude" : "codex",
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
  };
}

/** highlight.js 的樣式表（複製在 public/hljs/，不走 CDN） */
export function hljsHref(theme: DiffTheme): string {
  return theme === "light" ? "/hljs/light.css" : "/hljs/dark.css";
}

/**
 * diff 實際要用哪個配色。
 *
 * `follow` 時要看**解析後**的全域配色 —— `system` 是瀏覽器才知道的事，所以呼叫端
 * 得先把它解析成 dark/light 再傳進來（server 上解不出來）。
 */
export function resolveDiffTheme(pref: DiffThemePref, resolvedAppTheme: DiffTheme): DiffTheme {
  return pref === "follow" ? resolvedAppTheme : pref;
}
