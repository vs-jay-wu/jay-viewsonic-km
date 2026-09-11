/**
 * VB Bug 總覽的純規則。
 *
 * 跟 lib/vbBugs.ts 分開的理由跟 sessionRules 一樣：那支 import `fs/promises`，
 * 客戶端元件一旦拉進去整頁就編不起來。
 */

/** 產品欄位沒填的票會被歸到這一類（值由 scripts/vb-bugs.py 產生） */
export const UNCATEGORISED = "（未分類）";

/**
 * pin 住的排前面（依 pin 的順序），其餘照總數由多到少，
 * 「（未分類）」永遠墊底 —— 那是資料沒填，不是一個產品。
 */
export function sortProducts<T extends { name: string; total: number }>(
  products: T[],
  pinned: string[]
): T[] {
  const tierOf = (p: T) => {
    if (pinned.includes(p.name)) return 0;
    return p.name === UNCATEGORISED ? 2 : 1;
  };
  return [...products].sort((a, b) => {
    const ta = tierOf(a), tb = tierOf(b);
    if (ta !== tb) return ta - tb;
    if (ta === 0) return pinned.indexOf(a.name) - pinned.indexOf(b.name);
    return b.total - a.total;
  });
}
