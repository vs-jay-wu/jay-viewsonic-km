/**
 * 「repo 一行摘要」那份快取的判準（純規則，沒有 I/O）。
 *
 * 為什麼要快取：`listRepos()` 要對 148 個 repo 各跑 5 個 git 指令，實測 **2.6 秒**，
 * 而 `/code`、`/git`、`/changes` 一進頁就各打一次 —— 切三次分頁就是三次全掃。
 *
 * 策略是 **stale-while-revalidate**：過期了還是先把舊的給出去（畫面立刻有東西），
 * 同時在背景重算，下一次就是新的。這裡的資料**天生就會過期**（別的 session
 * 隨時在 commit），所以「等 2.6 秒換一份也已經過期的資料」是最差的取捨。
 */

/** 幾秒內算新鮮。抓一次要 2.6 秒，所以這個值要明顯大於它，否則等於沒有快取 */
export const REPO_CACHE_TTL_MS = 30_000;

export type CacheState = "missing" | "fresh" | "stale";

export function cacheState(
  computedAt: number | null,
  now: number,
  ttlMs: number = REPO_CACHE_TTL_MS
): CacheState {
  if (computedAt === null) return "missing";
  // 時鐘倒退（睡眠喚醒、改系統時間）時 now - computedAt 會是負的。
  // 當成過期而不是「超新鮮」—— 前者最多多掃一次，後者會卡住不更新。
  const age = now - computedAt;
  if (age < 0) return "stale";
  return age < ttlMs ? "fresh" : "stale";
}

/** 這次要不要真的去掃？stale 也要掃，只是掃之前先把舊的回出去 */
export function shouldRescan(state: CacheState, force: boolean): boolean {
  return force || state !== "fresh";
}

/** 這次能不能直接用手上的舊資料回應（不必等掃完） */
export function canServeCached(state: CacheState, force: boolean): boolean {
  return !force && state !== "missing";
}
