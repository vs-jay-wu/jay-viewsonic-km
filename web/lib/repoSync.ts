import { readFile, mkdir } from "fs/promises";
import path from "path";
import { repoPath, run } from "@/lib/repo";
import { recordFailure, recordSuccess } from "@/lib/health";
import {
  parseSummary, shouldRun,
  type RepoSyncConfig, type RepoSyncRun, type RepoSyncSchedulerState, type RepoSyncState,
} from "@/lib/repoSyncRules";
import { statePath } from "@/lib/statePaths";
import { writeStateFile } from "@/lib/stateWrite";
import { readStateFile } from "@/lib/stateRead";

// 型別定義在純規則檔（客戶端要 import type），這裡只轉出去
export type { RepoSyncConfig, RepoSyncRun, RepoSyncState, RepoSyncSchedulerState };

/**
 * 定時把 org 底下的 repo 全部同步一次（`scripts/sync-org-repos.sh`）。
 *
 * 三個刻意的決定：
 * 1. **完全不叫 AI** —— 就是跑那支腳本，跟 PR 巡邏的「先偵測、必要時才叫 AI」不同。
 * 2. **只在夜間窗口跑、一晚一次、過了不補**（跟 Jira 全同步同一套規則，Jay
 *    2026-09-11 指定）。判準在 `repoSyncRules.ts`，有測試。
 * 3. 帶 `--offloaded-if-available`：**有掛外接就連 offloaded 的一起同步，沒掛就
 *    只同步本機的**，不當成失敗。`--include-offloaded` 沒掛硬碟時會直接 exit 1，
 *    那是給互動使用的語意，排程不能用。
 */

const STATE_FILE = statePath("repo-sync.json");
const CONFIG_FILE = statePath("repo-sync-config.json");

/** 多久檢查一次「現在是不是窗口、這個窗口跑過沒」 */
const TICK_SECONDS = 600;
/** 全 org 的 git fetch 可能很久，給足時間 */
const RUN_TIMEOUT_MS = 45 * 60_000;
/** 留幾筆歷史；輸出只留尾巴，這個目錄是 gitignored 的但沒必要養大 */
const MAX_RUNS = 20;
const LOG_TAIL_CHARS = 8000;

const DEFAULT_CONFIG: RepoSyncConfig = {
  enabled: true,
  org: "Viewsonic-EDU",
  updatedAt: "",
};

// ─── 讀寫 ────────────────────────────────────────────────────────────────────

async function readJson<T>(file: string, fallback: T): Promise<T> {
  const raw = await readStateFile(file);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeStateFile(file, JSON.stringify(value, null, 2) + "\n");
}

export async function readConfig(): Promise<RepoSyncConfig> {
  const c = await readJson<Partial<RepoSyncConfig>>(CONFIG_FILE, {});
  return {
    // 布林用 ??，false 是有效值（jq 的 // 就是這樣出事的）
    enabled: c.enabled ?? DEFAULT_CONFIG.enabled,
    org: c.org || DEFAULT_CONFIG.org,
    updatedAt: c.updatedAt ?? "",
  };
}

export async function setConfig(input: Partial<RepoSyncConfig>): Promise<RepoSyncConfig> {
  const current = await readConfig();
  const config: RepoSyncConfig = {
    enabled: input.enabled ?? current.enabled,
    org: input.org || current.org,
    updatedAt: new Date().toISOString(),
  };
  await writeJson(CONFIG_FILE, config);
  if (config.enabled) startTimer();
  else stopTimer();
  return config;
}

export async function readState(): Promise<RepoSyncState> {
  const s = await readJson<Partial<RepoSyncState>>(STATE_FILE, {});
  return {
    lastRunAt: s.lastRunAt ?? null,
    runs: Array.isArray(s.runs) ? s.runs : [],
  };
}

// ─── 執行 ────────────────────────────────────────────────────────────────────

export interface SyncResult {
  ok: boolean;
  error?: string;
  run?: RepoSyncRun;
}

async function sync(trigger: RepoSyncRun["trigger"]): Promise<SyncResult> {
  const config = await readConfig();
  const startedAt = new Date();

  const { stdout, stderr, code } = await run(
    "/bin/zsh",
    [repoPath("scripts/sync-org-repos.sh"), "--offloaded-if-available", config.org],
    { timeoutMs: RUN_TIMEOUT_MS }
  );

  const finishedAt = new Date();
  const ok = code === 0;
  const output = (stdout + (stderr ? `\n[stderr]\n${stderr}` : "")).trim();
  const record: RepoSyncRun = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    ok,
    trigger,
    org: config.org,
    summary: ok ? parseSummary(stdout) : null,
    error: ok ? null : (stderr || stdout || `sync-org-repos.sh exit ${code}`).trim().slice(0, 2000),
    logTail: output.slice(-LOG_TAIL_CHARS),
  };

  const state = await readState();
  await writeJson(STATE_FILE, {
    // lastRunAt 記的是**開始**時間：窗口判斷要的是「這個窗口動過沒」，
    // 用結束時間的話，跨過 07:00 才跑完會讓下一晚的判斷往後偏
    lastRunAt: record.startedAt,
    runs: [record, ...state.runs].slice(0, MAX_RUNS),
  } satisfies RepoSyncState);

  if (ok) await recordSuccess("repo-sync");
  else await recordFailure("repo-sync", record.error ?? "同步失敗");

  return { ok, error: record.error ?? undefined, run: record };
}

// ─── 排程（掛在 web server 裡，跟其他三個一樣）──────────────────────────────

const KEY = Symbol.for("km.repoSyncScheduler");
interface Runtime {
  timer: ReturnType<typeof setInterval> | null;
  running: boolean;
  startedAt: string | null;
}
const g = globalThis as unknown as Record<symbol, Runtime | undefined>;
function runtime(): Runtime {
  if (!g[KEY]) g[KEY] = { timer: null, running: false, startedAt: null };
  return g[KEY]!;
}

export function schedulerState(): RepoSyncSchedulerState {
  const rt = runtime();
  return {
    timerOn: !!rt.timer,
    syncing: rt.running,
    startedAt: rt.startedAt,
    tickSeconds: TICK_SECONDS,
  };
}

export async function runOnce(
  trigger: RepoSyncRun["trigger"] = "manual"
): Promise<SyncResult> {
  const rt = runtime();
  if (rt.running) return { ok: false, error: "上一輪還在同步" };
  rt.running = true;
  rt.startedAt = new Date().toISOString();
  try {
    return await sync(trigger);
  } catch (e) {
    const error = (e as Error).message;
    await recordFailure("repo-sync", error);
    return { ok: false, error };
  } finally {
    rt.running = false;
    rt.startedAt = null;
  }
}

/** 每個 tick 問一次：在窗口內、而且這個窗口還沒跑過，就跑。 */
async function tick(): Promise<void> {
  const config = await readConfig();
  if (!config.enabled) return;
  const rt = runtime();
  if (rt.running) return;
  const state = await readState();
  if (!shouldRun(new Date(), state.lastRunAt)) return;
  await runOnce("scheduled");
}

function stopTimer(): void {
  const rt = runtime();
  if (rt.timer) clearInterval(rt.timer);
  rt.timer = null;
}

function startTimer(): void {
  const rt = runtime();
  stopTimer();
  rt.timer = setInterval(() => { void tick(); }, TICK_SECONDS * 1000);
  rt.timer.unref?.();
}

export async function initScheduler(): Promise<void> {
  const config = await readConfig();
  if (!config.enabled) {
    stopTimer();
    return;
  }
  startTimer();
  // 開機當下若正好在窗口內、而且今晚還沒跑過，就跑 —— 不必等第一個 tick
  void tick();
}

/** 設定說要開但這個 instance 沒掛上 timer 就補掛（dev 的 HMR 會弄丟） */
export async function ensureTimer(): Promise<void> {
  const config = await readConfig();
  const rt = runtime();
  if (config.enabled && !rt.timer) startTimer();
  if (!config.enabled && rt.timer) stopTimer();
}
