import { changesAskedWithin, scanChangesCached, warmUntrackedCache } from "@/lib/changes";

/**
 * 「未提交的改動」快照的預熱。
 *
 * 全掃要 3 秒（159 個 repo 的長尾，沒有熱點可修），所以開頁時不掃、只給快照。
 * 這支排程負責讓那份快照**通常是新的**。
 *
 * **沒人看就不要跑**：這頁不像 PR 巡邏那樣需要背景常駐，它的價值只在你正在看。
 * 判準是「最近 `IDLE_AFTER_MS` 內有人問過這份資料」—— 開著分頁時每 30 秒一次，
 * 關掉之後最多再跑一輪就停。
 *
 * ⚠️ timer 掛在 `globalThis`：dev 的 HMR 會重載模組，掛模組變數上會留下孤兒
 * interval（`web/AGENTS.md` 記過這個坑）。
 */

const EVERY_MS = 30_000;
/** 超過這段時間沒人看就停下來 */
const IDLE_AFTER_MS = 3 * 60_000;

const g = globalThis as typeof globalThis & { __kmChangesWarmTimer?: NodeJS.Timeout };

export async function initScheduler(): Promise<void> {
  clearInterval(g.__kmChangesWarmTimer);

  // 開機先做兩件一次性的事：打開 git 自己的未追蹤檔快取（每個 repo 快一倍），
  // 然後暖一次快照 —— 這樣第一次開頁就有東西可以給
  void warmUntrackedCache().catch(() => undefined);
  void scanChangesCached(true).catch(() => undefined);

  g.__kmChangesWarmTimer = setInterval(() => {
    if (!changesAskedWithin(IDLE_AFTER_MS)) return;
    void scanChangesCached(true).catch(() => undefined);
  }, EVERY_MS);
}
