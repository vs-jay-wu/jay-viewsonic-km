import { readFile, mkdir, writeFile } from "fs/promises";
import path from "path";
import { repoPath, run } from "@/lib/repo";

const STATE_DIR = "data/local-state";
const SNAPSHOT_FILE = repoPath(STATE_DIR, "vb-bugs.json");
const CONFIG_FILE = repoPath(STATE_DIR, "vb-bugs-config.json");

const MIN_INTERVAL_SECONDS = 300;
const DEFAULT_INTERVAL_SECONDS = 1800; // bug 數不會分鐘級變動，半小時夠了

// ─── 型別（跟 scripts/vb-bugs.py 的輸出對齊）────────────────────────────────

// 矩陣的型別與聚合規則在 vbBugsRules.ts（純函式，有測試）
export type { BugIssue, BugCell, BugProduct, PriorityCol, StatusGroup } from "@/lib/vbBugsRules";
import type { BugIssue } from "@/lib/vbBugsRules";

export interface BugSnapshot {
  fetchedAt: string;
  fetchedAs: string;
  project: string;
  /** full = 全抓；incremental = 只抓 cursor 之後有更新的 */
  mode: "full" | "incremental";
  jql: string;
  /** 下次增量的起點：這批看到的最大 updated */
  cursor: string;
  /** 上次全同步的時間。超過 24 小時就會再全抓一次（處理被硬刪／搬走的幽靈票） */
  lastFullSyncAt: string | null;
  /** 這一輪實際跟 Jira 要了幾筆（增量時通常是個位數） */
  fetchedCount: number;
  /** 這一輪因為變成 Done 而從表上移除的票 */
  removedKeys: string[];
  issueCount: number;
  issues: BugIssue[];
  lastError?: string | null;
}

export interface VbBugsConfig {
  enabled: boolean;
  intervalSeconds: number;
  /** Production Ready 那一列預設收起來 —— 對 Jay 意義不大，但保留功能 */
  showProductionReady: boolean;
  /** pin 住的產品排在前面，順序就是這個陣列的順序 */
  pinnedProducts: string[];
  updatedAt: string;
}

const DEFAULT_CONFIG: VbBugsConfig = {
  enabled: true,
  intervalSeconds: DEFAULT_INTERVAL_SECONDS,
  showProductionReady: false,
  pinnedProducts: [],
  updatedAt: "",
};

// ─── 讀寫 ────────────────────────────────────────────────────────────────────

async function readJson<T>(file: string, fallback: T): Promise<T> {
  const raw = await readFile(file, "utf8").catch(() => null);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function clampInterval(seconds: unknown): number {
  const n = Math.floor(Number(seconds));
  if (!Number.isFinite(n)) return DEFAULT_INTERVAL_SECONDS;
  return Math.max(MIN_INTERVAL_SECONDS, n);
}

export async function readConfig(): Promise<VbBugsConfig> {
  const c = await readJson<Partial<VbBugsConfig>>(CONFIG_FILE, {});
  return {
    enabled: c.enabled ?? DEFAULT_CONFIG.enabled,
    intervalSeconds: clampInterval(c.intervalSeconds ?? DEFAULT_CONFIG.intervalSeconds),
    // 布林值不能用 ?? 之外的短路寫法，false 是有效值（jq 的 // 就是這樣出事的）
    showProductionReady: c.showProductionReady ?? DEFAULT_CONFIG.showProductionReady,
    pinnedProducts: Array.isArray(c.pinnedProducts)
      ? c.pinnedProducts.filter((p): p is string => typeof p === "string")
      : [],
    updatedAt: c.updatedAt ?? "",
  };
}

export async function readSnapshot(): Promise<BugSnapshot | null> {
  const s = await readJson<BugSnapshot | null>(SNAPSHOT_FILE, null);
  return s && Array.isArray(s.issues) ? s : null;
}

export async function setConfig(input: Partial<VbBugsConfig>): Promise<VbBugsConfig> {
  const current = await readConfig();
  const config: VbBugsConfig = {
    enabled: input.enabled ?? current.enabled,
    intervalSeconds: clampInterval(input.intervalSeconds ?? current.intervalSeconds),
    showProductionReady: input.showProductionReady ?? current.showProductionReady,
    pinnedProducts: input.pinnedProducts ?? current.pinnedProducts,
    updatedAt: new Date().toISOString(),
  };
  await writeJson(CONFIG_FILE, config);
  if (config.enabled) startTimer(config.intervalSeconds);
  else stopTimer();
  return config;
}

/** pin／取消 pin 一個產品。pin 的順序＝加入的順序。 */
export async function togglePin(product: string): Promise<VbBugsConfig> {
  const current = await readConfig();
  const pinned = current.pinnedProducts.includes(product)
    ? current.pinnedProducts.filter((p) => p !== product)
    : [...current.pinnedProducts, product];
  return setConfig({ pinnedProducts: pinned });
}

// ─── 抓取 ────────────────────────────────────────────────────────────────────

export interface RefreshResult {
  ok: boolean;
  error?: string;
  snapshot?: BugSnapshot;
}

/**
 * 抓一次。有既有快照就走增量 —— 全 BU 的單之後都會搬進 VB，票數會長到幾千，
 * 每半小時全抓一次不划算（5000 筆 ≈ 50 次 API 呼叫 × 48 次/天）。
 * 腳本自己會判斷：沒有快照、或上次全同步超過 24 小時，就改成全抓。
 */
export async function refresh(opts: { full?: boolean } = {}): Promise<RefreshResult> {
  const prev = await readSnapshot();
  const args = [repoPath("scripts/vb-bugs.py"), "--state", SNAPSHOT_FILE];
  if (opts.full) args.push("--full");

  const { stdout, stderr, code } = await run("python3", args, { timeoutMs: 180_000 });

  if (code !== 0) {
    const error = (stderr || stdout || `vb-bugs.py exit ${code}`).trim().slice(0, 2000);
    if (prev) await writeJson(SNAPSHOT_FILE, { ...prev, lastError: error });
    return { ok: false, error };
  }
  try {
    const snapshot = JSON.parse(stdout) as BugSnapshot;
    await writeJson(SNAPSHOT_FILE, { ...snapshot, lastError: null });
    return { ok: true, snapshot };
  } catch (e) {
    return { ok: false, error: `解析 vb-bugs.py 輸出失敗：${(e as Error).message}` };
  }
}

// ─── 排程（跟其他兩個一樣掛在 web server 裡）────────────────────────────────

const KEY = Symbol.for("km.vbBugsScheduler");
interface Runtime {
  timer: ReturnType<typeof setInterval> | null;
  intervalSeconds: number;
  running: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastError: string | null;
}
const g = globalThis as unknown as Record<symbol, Runtime | undefined>;
function runtime(): Runtime {
  if (!g[KEY]) {
    g[KEY] = {
      timer: null, intervalSeconds: DEFAULT_INTERVAL_SECONDS,
      running: false, lastRunAt: null, nextRunAt: null, lastError: null,
    };
  }
  return g[KEY]!;
}

export interface SchedulerState {
  timerOn: boolean;
  fetching: boolean;
  intervalSeconds: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastError: string | null;
}

export function schedulerState(): SchedulerState {
  const rt = runtime();
  return {
    timerOn: !!rt.timer,
    fetching: rt.running,
    intervalSeconds: rt.intervalSeconds,
    lastRunAt: rt.lastRunAt,
    nextRunAt: rt.nextRunAt,
    lastError: rt.lastError,
  };
}

export async function runOnce(opts: { full?: boolean } = {}): Promise<RefreshResult> {
  const rt = runtime();
  if (rt.running) return { ok: false, error: "上一輪還在抓" };
  rt.running = true;
  try {
    const res = await refresh(opts);
    rt.lastRunAt = new Date().toISOString();
    rt.lastError = res.ok ? null : (res.error ?? "抓取失敗");
    if (rt.timer) {
      rt.nextRunAt = new Date(Date.now() + rt.intervalSeconds * 1000).toISOString();
    }
    return res;
  } finally {
    rt.running = false;
  }
}

function stopTimer(): void {
  const rt = runtime();
  if (rt.timer) clearInterval(rt.timer);
  rt.timer = null;
  rt.nextRunAt = null;
}

function startTimer(intervalSeconds: number): void {
  const rt = runtime();
  stopTimer();
  rt.intervalSeconds = intervalSeconds;
  rt.timer = setInterval(() => { void runOnce(); }, intervalSeconds * 1000);
  rt.timer.unref?.();
  rt.nextRunAt = new Date(Date.now() + intervalSeconds * 1000).toISOString();
}

export async function initScheduler(): Promise<void> {
  const config = await readConfig();
  if (!config.enabled) {
    stopTimer();
    return;
  }
  startTimer(config.intervalSeconds);
  if (!(await readSnapshot())) void runOnce();
}

/** 設定說要開但這個 instance 沒掛上 timer 就補掛；沒有快照就先抓一次。 */
export async function ensureTimer(): Promise<void> {
  const config = await readConfig();
  const rt = runtime();
  if (config.enabled && !rt.timer) startTimer(config.intervalSeconds);
  if (!config.enabled && rt.timer) stopTimer();
  if (config.enabled && !rt.running && !(await readSnapshot())) void runOnce();
}

// 純規則放隔壁（客戶端也要用，不能帶到 fs/promises）
export { sortProducts, UNCATEGORISED, buildMatrix, PRIORITIES, STATUS_GROUPS } from "@/lib/vbBugsRules";
