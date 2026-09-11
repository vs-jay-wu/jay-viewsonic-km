/**
 * Repo 同步（`scripts/sync-org-repos.sh`）的純規則：夜間窗口的判斷、以及把腳本
 * 的輸出解析成摘要。
 *
 * 放這裡（不放 repoSync.ts）的理由跟 vbBugsRules 一樣：客戶端元件要用，不能
 * 帶到 `fs/promises`；而且這兩條判準都會變，要有測試守著。
 */

/** 窗口＝台北時間 20:00（含）→ 隔天 07:00（不含），跟 Jira 全同步同一套 */
export const WINDOW_START_HOUR = 20;
export const WINDOW_END_HOUR = 7;

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 台北時間的小時。固定 UTC+8，不跟機器的 TZ 走（台灣沒有日光節約）。 */
export function taipeiHour(now: Date): number {
  return new Date(now.getTime() + TAIPEI_OFFSET_MS).getUTCHours();
}

/**
 * `now` 落在哪一個夜間窗口裡；不在窗口內回 null。
 *
 * 窗口跨午夜，所以凌晨那幾個小時屬於**前一天**開始的窗口 —— 這是「一個晚上只跑
 * 一次」能成立的關鍵：23:50 跑過之後，00:10 算出來的窗口起點跟它同一個。
 */
export function windowStart(now: Date): Date | null {
  const local = new Date(now.getTime() + TAIPEI_OFFSET_MS);
  const hour = local.getUTCHours();
  if (hour < WINDOW_END_HOUR) local.setUTCDate(local.getUTCDate() - 1);
  else if (hour < WINDOW_START_HOUR) return null;
  local.setUTCHours(WINDOW_START_HOUR, 0, 0, 0);
  return new Date(local.getTime() - TAIPEI_OFFSET_MS);
}

/**
 * 這一刻該不該跑。
 *
 * **不補做**：窗口外一律 false，即使從來沒跑過（Jay 2026-09-11 指定 —— 白天
 * 跑一次全 org 的 git fetch 會卡住他正在用的網路與磁碟）。
 */
export function shouldRun(now: Date, lastRunAt: string | null): boolean {
  const start = windowStart(now);
  if (!start) return false;
  if (!lastRunAt) return true;
  const last = Date.parse(lastRunAt);
  return !Number.isFinite(last) || last < start.getTime();
}

/** 下一個窗口的開始時間（給 UI 顯示「下次大約什麼時候」用） */
export function nextWindowStart(now: Date): Date {
  const current = windowStart(now);
  if (current) {
    // 已經在窗口裡 → 下一個是明天晚上
    return new Date(current.getTime() + 24 * 60 * 60 * 1000);
  }
  const local = new Date(now.getTime() + TAIPEI_OFFSET_MS);
  local.setUTCHours(WINDOW_START_HOUR, 0, 0, 0);
  return new Date(local.getTime() - TAIPEI_OFFSET_MS);
}

// ─── 解析腳本輸出 ────────────────────────────────────────────────────────────

export interface SyncSummary {
  total: number;
  cloned: number;
  pulled: number;
  /** 工作區有未提交的改動，只 fetch 沒 pull */
  fetchedDirty: number;
  offloadedSkipped: number;
  /** 有掛外接時，從外接同步成功的數量；沒掛外接時腳本不印這行 */
  offloadedSynced: number | null;
  failed: number;
  dirtyRepos: string[];
  /** 這次有沒有把外接上的 offloaded repo 一起同步 */
  externalAvailable: boolean;
}

const NUM = (s: string, label: string): number => {
  const m = s.match(new RegExp(`^${label}:\\s*(\\d+)\\s*$`, "m"));
  return m ? Number(m[1]) : 0;
};

/**
 * 把腳本結尾的統計解析出來。解析不到就回 0 —— 這裡只是給 UI 看的摘要，
 * 成敗一律以離開碼為準，不靠字串比對。
 */
export function parseSummary(stdout: string): SyncSummary {
  const syncedLine = stdout.match(/^Offloaded \(synced on external\):\s*(\d+)\s*$/m);
  const dirtyRepos: string[] = [];
  const dirtySection = stdout.split("Dirty repos (fetched only")[1];
  if (dirtySection) {
    for (const line of dirtySection.split("\n")) {
      const m = line.match(/^\s+-\s+(\S+)\s*$/);
      if (m) dirtyRepos.push(m[1]);
    }
  }
  return {
    total: NUM(stdout, "Total"),
    cloned: NUM(stdout, "Cloned"),
    pulled: NUM(stdout, "Pulled"),
    fetchedDirty: NUM(stdout, "Fetched-only \\(dirty working tree\\)"),
    offloadedSkipped: NUM(stdout, "Offloaded \\(skipped\\)"),
    offloadedSynced: syncedLine ? Number(syncedLine[1]) : null,
    failed: NUM(stdout, "Failed"),
    dirtyRepos,
    externalAvailable: !!syncedLine,
  };
}

// ─── UI 也要用的型別 ─────────────────────────────────────────────────────────
// 放在純規則檔，客戶端 `import type` 才不會有人不小心改成值匯入而把
// `fs/promises` 拖進 bundle（那個坑踩過兩次，見 web/AGENTS.md）。

export interface RepoSyncConfig {
  enabled: boolean;
  /** 要同步哪個 org；腳本的預設值也是這個 */
  org: string;
  updatedAt: string;
}

export interface RepoSyncRun {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  ok: boolean;
  /** scheduled = 夜間窗口自動跑的；manual = 在網頁上按的 */
  trigger: "scheduled" | "manual";
  org: string;
  summary: SyncSummary | null;
  error: string | null;
  /** 腳本輸出的尾巴（給人看發生什麼事，不拿來判斷成敗） */
  logTail: string;
}

export interface RepoSyncState {
  lastRunAt: string | null;
  runs: RepoSyncRun[];
}

export interface RepoSyncSchedulerState {
  timerOn: boolean;
  syncing: boolean;
  /** 這一輪是什麼時候開始的（UI 拿來顯示「已經跑了幾分鐘」） */
  startedAt: string | null;
  tickSeconds: number;
}
