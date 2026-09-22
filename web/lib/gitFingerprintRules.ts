/**
 * 「本機有沒有變」的指紋 —— 純規則的部分（沒有 I/O，兩側都能用）。
 *
 * 為什麼要指紋：自動更新不能直接輪詢重資料（repo 清單全掃 2.6 秒、`/changes`
 * 全掃 3 秒）。改成先問一個很便宜的值，**沒變就什麼都不做** ——
 * 連 `setState` 都不會發生，所以捲動位置與展開狀態是結構上安全的，
 * 不是靠每個頁面各自小心維護。
 *
 * 實測成本（2026-09-22，147 個 repo）：
 * - 全域（讀 `.git/HEAD` ＋ stat `.git/index`）：**9–15ms**
 * - 單一 repo 完整（`rev-parse HEAD` ＋ `status --porcelain`）：km 14ms、mvbf 64–126ms
 */

/**
 * 把一串片段壓成一個短字串。
 *
 * 用 djb2 而不是 sha1，是為了讓這個檔**不碰 node crypto** —— 純規則檔會被
 * 客戶端元件 import，一沾到 node 內建模組整頁就編不起來（見 `web/AGENTS.md`）。
 * 這裡不需要抗碰撞：兩份不同的狀態剛好撞到，最糟也只是少更新一次，
 * 下一次有任何變動就會再對不上。
 */
export function combine(parts: readonly string[]): string {
  let h = 5381;
  for (const p of parts) {
    for (let i = 0; i < p.length; i++) h = ((h * 33) ^ p.charCodeAt(i)) >>> 0;
    h = ((h * 33) ^ 0x1f) >>> 0; // 片段之間放分隔，避免 ["ab","c"] 與 ["a","bc"] 同值
  }
  return h.toString(36);
}

/**
 * 要不要重抓重資料。
 *
 * **第一次拿到指紋不算變動** —— 那時畫面上的資料本來就是跟著它一起來的，
 * 當成「變了」會在每次進頁面時多打一次全掃。
 */
export function shouldRefetch(seen: string | null, latest: string): boolean {
  return seen !== null && seen !== latest;
}
