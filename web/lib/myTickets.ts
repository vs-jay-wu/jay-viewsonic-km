import { readFile, mkdir } from "fs/promises";
import path from "path";
import { repoPath, run } from "@/lib/repo";
import { recordFailure, recordSuccess } from "@/lib/health";
import type { MyTicket, MyTicketsSnapshot } from "@/lib/myTicketsRules";
import { statePath } from "@/lib/statePaths";
import { writeStateFile } from "@/lib/stateWrite";
import { readStateFile } from "@/lib/stateRead";

export type { MyTicket, MyTicketsSnapshot };

/**
 * 指派給我、還沒完成的 VB 單。抓取在 scripts/my-tickets.py（增量＋夜間全同步），
 * 這裡只負責排程、快取與健康度 —— 跟 VB Bug 總覽同一套。
 */

const SNAPSHOT_FILE = statePath("my-tickets.json");
const CONFIG_FILE = statePath("my-tickets-config.json");
const PINS_FILE = statePath("ticket-pins.json");

const MIN_INTERVAL_SECONDS = 300;
const DEFAULT_INTERVAL_SECONDS = 1800;
const MIN_BACKGROUND_GAP_MS = 60_000;

export interface MyTicketsConfig {
  enabled: boolean;
  intervalSeconds: number;
  updatedAt: string;
}

const DEFAULT_CONFIG: MyTicketsConfig = {
  enabled: true,
  intervalSeconds: DEFAULT_INTERVAL_SECONDS,
  updatedAt: "",
};

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

export async function readConfig(): Promise<MyTicketsConfig> {
  const c = await readJson<Partial<MyTicketsConfig>>(CONFIG_FILE, {});
  const n = Math.floor(Number(c.intervalSeconds ?? DEFAULT_INTERVAL_SECONDS));
  return {
    enabled: c.enabled ?? DEFAULT_CONFIG.enabled,
    intervalSeconds: Number.isFinite(n) ? Math.max(MIN_INTERVAL_SECONDS, n) : DEFAULT_INTERVAL_SECONDS,
    updatedAt: c.updatedAt ?? "",
  };
}

export async function setConfig(input: Partial<MyTicketsConfig>): Promise<MyTicketsConfig> {
  const current = await readConfig();
  const config: MyTicketsConfig = {
    enabled: input.enabled ?? current.enabled,
    intervalSeconds: Math.max(
      MIN_INTERVAL_SECONDS,
      Math.floor(Number(input.intervalSeconds ?? current.intervalSeconds))
    ),
    updatedAt: new Date().toISOString(),
  };
  await writeJson(CONFIG_FILE, config);
  if (config.enabled) startTimer(config.intervalSeconds);
  else stopTimer();
  return config;
}

export async function readSnapshot(): Promise<MyTicketsSnapshot | null> {
  const s = await readJson<MyTicketsSnapshot | null>(SNAPSHOT_FILE, null);
  return s && Array.isArray(s.issues) ? s : null;
}

// ─── pin（跟 sessions／文件同一套：一個 json、順序＝加入的順序）────────────

export async function readPins(): Promise<string[]> {
  const d = await readJson<{ pinned?: string[] }>(PINS_FILE, {});
  return Array.isArray(d.pinned) ? d.pinned : [];
}

export async function togglePin(key: string): Promise<string[]> {
  const pinned = await readPins();
  const next = pinned.includes(key) ? pinned.filter((k) => k !== key) : [...pinned, key];
  await writeJson(PINS_FILE, { pinned: next });
  return next;
}

export interface RefreshResult {
  ok: boolean;
  error?: string;
  snapshot?: MyTicketsSnapshot;
}

export async function refresh(opts: { full?: boolean } = {}): Promise<RefreshResult> {
  const prev = await readSnapshot();
  const args = [repoPath("scripts/my-tickets.py"), "--state", SNAPSHOT_FILE];
  if (opts.full) args.push("--full");

  const { stdout, stderr, code } = await run("python3", args, { timeoutMs: 180_000 });
  if (code !== 0) {
    const error = (stderr || stdout || `my-tickets.py exit ${code}`).trim().slice(0, 2000);
    if (prev) await writeJson(SNAPSHOT_FILE, { ...prev, lastError: error });
    return { ok: false, error };
  }
  try {
    const snapshot = JSON.parse(stdout) as MyTicketsSnapshot;
    await writeJson(SNAPSHOT_FILE, { ...snapshot, lastError: null });
    return { ok: true, snapshot };
  } catch (e) {
    return { ok: false, error: `解析 my-tickets.py 輸出失敗：${(e as Error).message}` };
  }
}

// ─── 排程 ────────────────────────────────────────────────────────────────────

const KEY = Symbol.for("km.myTicketsScheduler");
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
    timerOn: !!rt.timer, fetching: rt.running, intervalSeconds: rt.intervalSeconds,
    lastRunAt: rt.lastRunAt, nextRunAt: rt.nextRunAt, lastError: rt.lastError,
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
    if (res.ok) await recordSuccess("my-tickets");
    else await recordFailure("my-tickets", res.error ?? "抓取失敗");
    if (rt.timer) rt.nextRunAt = new Date(Date.now() + rt.intervalSeconds * 1000).toISOString();
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

export function refreshInBackground(): { started: boolean; reason?: string } {
  const rt = runtime();
  if (rt.running) return { started: false, reason: "上一輪還在抓" };
  if (rt.lastRunAt && Date.now() - Date.parse(rt.lastRunAt) < MIN_BACKGROUND_GAP_MS) {
    return { started: false, reason: "剛抓過" };
  }
  void runOnce();
  return { started: true };
}

export async function ensureTimer(): Promise<void> {
  const config = await readConfig();
  const rt = runtime();
  if (config.enabled && !rt.timer) startTimer(config.intervalSeconds);
  if (!config.enabled && rt.timer) stopTimer();
  if (config.enabled && !rt.running && !(await readSnapshot())) void runOnce();
}
