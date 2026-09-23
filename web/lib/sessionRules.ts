/**
 * session 的純判斷規則。
 *
 * 刻意跟 lib/sessions.ts 分開：那支會 import `fs/promises`，客戶端元件一旦
 * 拉進去整頁就編不起來（實際踩過）。這裡只放不碰檔案系統的東西，兩側共用。
 */

/**
 * 「久沒用」的門檻（天）。UI 用它挑出可以整批清掉的 session。
 * 只是**挑出來**，不自動刪 —— 刪 session 不可逆。
 */
export const STALE_DAYS = 30;

/**
 * 這個 session 算不算「久沒用、可以清」。
 * pin 住的永遠不算 —— pin 在這裡的意思就是「別動它」。
 */
export function isStale(
  s: { pinned: boolean; modifiedAt: string },
  days = STALE_DAYS,
  now = Date.now()
): boolean {
  if (s.pinned) return false;
  const t = Date.parse(s.modifiedAt);
  if (!Number.isFinite(t)) return false; // 時間讀不到就不要歸類成可刪
  return now - t > days * 86_400_000;
}

/**
 * 這個 session 的「工作環境」是不是**日常的那個**（km 的主 checkout ＋ master）。
 *
 * 是的話清單上不必顯示 repo 與分支：Jay 幾乎都在那裡做事，每一列都寫一次
 * 只是雜訊 —— 值得被看到的是**例外**（在別的 repo、或在某條 feature 分支上）。
 *
 * 比對的是 cwd 的最後一段，不是整條路徑：worktree（`jay-viewsonic-km-xxx`）
 * 與別的 clone 都不算日常，那些要顯示。
 */
export function isDefaultWorkContext(cwd: string, branch: string | null): boolean {
  return cwd.split("/").filter(Boolean).pop() === "jay-viewsonic-km" && branch === "master";
}
