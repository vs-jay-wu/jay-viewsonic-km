/** km web 的使用者偏好。純規則（客戶端要用） */

export type DiffTheme = "dark" | "light";

export interface UiSettings {
  /** 看 diff 用深色還是淺色。預設深色（Jay 2026-09-14） */
  diffTheme: DiffTheme;
  updatedAt: string;
}

export const DEFAULT_UI_SETTINGS: UiSettings = {
  diffTheme: "dark",
  updatedAt: "",
};

/** 只認得的值才收，其餘一律退回預設 —— 設定檔是手改得到的 */
export function normalizeUiSettings(input: unknown): UiSettings {
  const o = (input ?? {}) as Partial<UiSettings>;
  return {
    diffTheme: o.diffTheme === "light" ? "light" : "dark",
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
  };
}

/** highlight.js 的樣式表（複製在 public/hljs/，不走 CDN） */
export function hljsHref(theme: DiffTheme): string {
  return theme === "light" ? "/hljs/light.css" : "/hljs/dark.css";
}
