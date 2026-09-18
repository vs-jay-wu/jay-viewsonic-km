/** km web 的使用者偏好。純規則（客戶端要用） */

export type DiffTheme = "dark" | "light";

/** `/review-local` 交叉驗證要用哪個 CLI。預設 codex（Jay 2026-09-18 改的） */
export type ReviewEngine = "codex" | "claude";

export const REVIEW_ENGINES: ReviewEngine[] = ["codex", "claude"];

export interface UiSettings {
  /** 看 diff 用深色還是淺色。預設深色（Jay 2026-09-14） */
  diffTheme: DiffTheme;
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
  diffTheme: "dark",
  reviewEngine: "codex",
  updatedAt: "",
};

/** 只認得的值才收，其餘一律退回預設 —— 設定檔是手改得到的 */
export function normalizeUiSettings(input: unknown): UiSettings {
  const o = (input ?? {}) as Partial<UiSettings>;
  return {
    diffTheme: o.diffTheme === "light" ? "light" : "dark",
    reviewEngine: o.reviewEngine === "claude" ? "claude" : "codex",
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
  };
}

/** highlight.js 的樣式表（複製在 public/hljs/，不走 CDN） */
export function hljsHref(theme: DiffTheme): string {
  return theme === "light" ? "/hljs/light.css" : "/hljs/dark.css";
}
