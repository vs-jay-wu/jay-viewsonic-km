import { readFile, mkdir, writeFile } from "fs/promises";
import path from "path";
import { repoPath } from "@/lib/repo";
import { lockState, pruneRuns, triggerRun } from "@/lib/prInbox";

const CONFIG_FILE = repoPath("data/local-state/pr-inbox-watch.json");
const MIN_INTERVAL_SECONDS = 60;
const DEFAULT_INTERVAL_SECONDS = 1800;

/**
 * AI 可不可以代表 Jay 對別人的 PR 送出 review 判定。
 *
 *   off      只留言（預設）
 *   approve  沒有 MUST／SHOULD 時可以 approve，不送 request changes
 *   full     approve 與 request changes 都可以
 *
 * 實際規則是 scripts/pr-inbox-watch.sh 依這個值組系統提示給 AI。
 */
export type ReviewVerdictMode = "off" | "approve" | "full";

export interface ScheduleConfig {
  enabled: boolean;
  intervalSeconds: number;
  /** true = 排程只偵測、不啟動 AI（人不在時的保險模式） */
  detectOnly: boolean;
  reviewVerdict: ReviewVerdictMode;
  updatedAt: string;
}

function normaliseVerdict(v: unknown): ReviewVerdictMode {
  return v === "approve" || v === "full" ? v : "off";
}

export interface SchedulerState extends ScheduleConfig {
  /** 這個 server instance 有沒有真的掛著 timer */
  running: boolean;
  lastTickAt: string | null;
  nextRunAt: string | null;
  lastSkipReason: string | null;
}

/**
 * dev 模式下模組會被 HMR 重新載入，用 globalThis 存 timer 才不會留下孤兒 ——
 * 否則每次改檔案都多一個 interval 在跑，同一分鐘會觸發好幾輪。
 */
const KEY = Symbol.for("km.prInboxScheduler");
interface Runtime {
  timer: ReturnType<typeof setInterval> | null;
  intervalSeconds: number;
  detectOnly: boolean;
  lastTickAt: string | null;
  nextRunAt: string | null;
  lastSkipReason: string | null;
}
const g = globalThis as unknown as Record<symbol, Runtime | undefined>;
function runtime(): Runtime {
  if (!g[KEY]) {
    g[KEY] = {
      timer: null,
      intervalSeconds: DEFAULT_INTERVAL_SECONDS,
      detectOnly: false,
      lastTickAt: null,
      nextRunAt: null,
      lastSkipReason: null,
    };
  }
  return g[KEY]!;
}

function clampInterval(seconds: unknown): number {
  const n = Math.floor(Number(seconds));
  if (!Number.isFinite(n)) return DEFAULT_INTERVAL_SECONDS;
  return Math.max(MIN_INTERVAL_SECONDS, n);
}

export async function readConfig(): Promise<ScheduleConfig> {
  const raw = await readFile(CONFIG_FILE, "utf8").catch(() => null);
  if (!raw) {
    return {
      enabled: false, intervalSeconds: DEFAULT_INTERVAL_SECONDS,
      detectOnly: false, reviewVerdict: "off", updatedAt: "",
    };
  }
  try {
    const c = JSON.parse(raw) as Partial<ScheduleConfig>;
    return {
      enabled: !!c.enabled,
      intervalSeconds: clampInterval(c.intervalSeconds),
      detectOnly: !!c.detectOnly,
      reviewVerdict: normaliseVerdict(c.reviewVerdict),
      updatedAt: c.updatedAt ?? "",
    };
  } catch {
    return {
      enabled: false, intervalSeconds: DEFAULT_INTERVAL_SECONDS,
      detectOnly: false, reviewVerdict: "off", updatedAt: "",
    };
  }
}

async function writeConfig(config: ScheduleConfig): Promise<void> {
  await mkdir(path.dirname(CONFIG_FILE), { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", "utf8");
}

/**
 * 一次巡邏。腳本自己也有鎖，這裡先看一眼只是為了少 spawn 一個行程、
 * 並把「為什麼這輪沒跑」記下來給 UI 看。
 */
async function tick(): Promise<void> {
  const rt = runtime();
  // 順手清過期紀錄（保留天數見 prInbox.ts 的 RETAIN_DAYS）
  await pruneRuns().catch(() => undefined);
  rt.lastTickAt = new Date().toISOString();
  rt.nextRunAt = new Date(Date.now() + rt.intervalSeconds * 1000).toISOString();

  const lock = await lockState();
  if (lock.locked && lock.alive) {
    rt.lastSkipReason = `上一輪還在跑（pid ${lock.pid}）`;
    return;
  }
  rt.lastSkipReason = null;
  // detached 丟出去：AI 那段可能好幾分鐘，而且 server 重啟也不該把它殺掉
  triggerRun({ trigger: "scheduled", detectOnly: rt.detectOnly });
}

function stopTimer(): void {
  const rt = runtime();
  if (rt.timer) clearInterval(rt.timer);
  rt.timer = null;
  rt.nextRunAt = null;
}

function startTimer(intervalSeconds: number, detectOnly: boolean): void {
  const rt = runtime();
  stopTimer();
  rt.intervalSeconds = intervalSeconds;
  rt.detectOnly = detectOnly;
  rt.timer = setInterval(() => {
    void tick();
  }, intervalSeconds * 1000);
  // 不要因為這個 timer 卡住 process 結束
  rt.timer.unref?.();
  rt.nextRunAt = new Date(Date.now() + intervalSeconds * 1000).toISOString();
}

/** server 啟動時呼叫（instrumentation.ts）。設定存在磁碟，所以重開會自己接回去。 */
export async function initScheduler(): Promise<void> {
  await pruneRuns().catch(() => undefined);
  const config = await readConfig();
  if (config.enabled) startTimer(config.intervalSeconds, config.detectOnly);
  else stopTimer();
}

export async function setSchedule(input: {
  enabled: boolean;
  intervalSeconds?: number;
  detectOnly?: boolean;
  reviewVerdict?: ReviewVerdictMode;
}): Promise<SchedulerState> {
  const current = await readConfig();
  const config: ScheduleConfig = {
    enabled: input.enabled,
    intervalSeconds: clampInterval(input.intervalSeconds ?? current.intervalSeconds),
    detectOnly: input.detectOnly ?? current.detectOnly,
    reviewVerdict: normaliseVerdict(input.reviewVerdict ?? current.reviewVerdict),
    updatedAt: new Date().toISOString(),
  };
  await writeConfig(config);
  if (config.enabled) startTimer(config.intervalSeconds, config.detectOnly);
  else stopTimer();
  return schedulerState(config);
}

export function schedulerState(config: ScheduleConfig): SchedulerState {
  const rt = runtime();
  return {
    ...config,
    running: !!rt.timer,
    lastTickAt: rt.lastTickAt,
    nextRunAt: rt.nextRunAt,
    lastSkipReason: rt.lastSkipReason,
  };
}

export async function currentState(): Promise<SchedulerState> {
  const config = await readConfig();
  // 設定說要開、但這個 instance 沒掛上 timer（例如 server 剛重啟又還沒跑到
  // instrumentation，或曾經被 HMR 清掉）——順手補掛，狀態才不會騙人。
  if (config.enabled && !runtime().timer) startTimer(config.intervalSeconds, config.detectOnly);
  if (!config.enabled && runtime().timer) stopTimer();
  return schedulerState(config);
}
