/**
 * 工作台上次看的是哪個視圖。
 *
 * 側邊欄只有一個「Repo」入口，點它一律回 repo 清單，但**視圖是偏好**，
 * 應該跟著你走（Jay 2026-09-23）。存 localStorage：這是「這台機器上的習慣」，
 * 不值得為它開一支 API。
 */

export type RepoView = "code" | "git";

export const LAST_VIEW_KEY = "km.repo.view";

export function readLastView(): RepoView {
  try {
    return localStorage.getItem(LAST_VIEW_KEY) === "git" ? "git" : "code";
  } catch {
    // 私密視窗／關掉 site data 時會丟例外 —— 退回預設就好
    return "code";
  }
}

export function rememberView(v: RepoView): void {
  try {
    localStorage.setItem(LAST_VIEW_KEY, v);
  } catch {
    /* 存不了就算了，下次還是回到預設 */
  }
}
