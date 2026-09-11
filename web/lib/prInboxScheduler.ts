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
 *   full     approve 與 request changes 都可以（預設）
 *   approve  只送 approve；要改的只留言，不卡對方
 *   off      只留言
 *
 * 預設 full：只留言的話 review 沒有結論，球不會離開 Jay 手上。
 * 實際規則是 scripts/pr-inbox-watch.sh 依這個值組系統提示給 AI。
 */
export type ReviewVerdictMode = "off" | "approve" | "full";
const DEFAULT_VERDICT: ReviewVerdictMode = "full";

/**
 * 不巡邏的時段（半夜）。時區固定台北，不跟著機器的 TZ 走 —— 帶電腦出差
 * 時「台灣時間的半夜」才是 Jay 要的那個意思。
 *
 * 只擋**排程**。手動觸發任何時間都能跑，這是「不要半夜自動去動別人的 PR」，
 * 不是「半夜不准用」。
 */
export interface QuietHours {
  enabled: boolean;
  /** 起始小時（含），0–23 */
  startHour: number;
  /** 結束小時（不含），0–23。start > end 代表跨午夜 */
  endHour: number;
}

const TIME_ZONE = "Asia/Taipei";
const DEFAULT_QUIET: QuietHours = { enabled: true, startHour: 0, endHour: 8 };

export interface ScheduleConfig {
  enabled: boolean;
  intervalSeconds: number;
  /** true = 排程只偵測、不啟動 AI（人不在時的保險模式） */
  detectOnly: boolean;
  reviewVerdict: ReviewVerdictMode;
  quietHours: QuietHours;
  updatedAt: string;
}

function clampHour(v: unknown, fallback: number): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= 23 ? n : fallback;
}

function normaliseQuiet(q: unknown): QuietHours {
  const o = (q ?? {}) as Partial<QuietHours>;
  return {
    enabled: o.enabled ?? DEFAULT_QUIET.enabled,
    startHour: clampHour(o.startHour, DEFAULT_QUIET.startHour),
    endHour: clampHour(o.endHour, DEFAULT_QUIET.endHour),
  };
}

/** 台北時間的現在幾點。用 Intl 取，不依賴機器的 TZ 設定。 */
export function taipeiHour(now = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE,
      hour: "2-digit",
      hour12: false,
    }).format(now)
  ) % 24;
}

/** 現在是不是靜音時段。start === end 代表整天都不巡（等於停用排程）。 */
export function inQuietHours(q: QuietHours, now = new Date()): boolean {
  if (!q.enabled) return false;
  const h = taipeiHour(now);
  // 跨午夜（例：22 → 6）要用 or，不跨的（0 → 8）用 and
  return q.startHour <= q.endHour
    ? h >= q.startHour && h < q.endHour
    : h >= q.startHour || h < q.endHour;
}

function normaliseVerdict(v: unknown): ReviewVerdictMode {
  if (v === "off" || v === "approve" || v === "full") return v;
  return DEFAULT_VERDICT;
}

export interface SchedulerState extends ScheduleConfig {
  /** 這個 server instance 有沒有真的掛著 timer */
  running: boolean;
  lastTickAt: string | null;
  nextRunAt: string | null;
  lastSkipReason: string | null;
  /** 現在是不是靜音時段（給 UI 直接顯示，不用自己再算一次時區） */
  quietNow: boolean;
  /** 台北時間的現在幾點 */
  taipeiHour: number;
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
      detectOnly: false, reviewVerdict: DEFAULT_VERDICT,
      quietHours: { ...DEFAULT_QUIET }, updatedAt: "",
    };
  }
  try {
    const c = JSON.parse(raw) as Partial<ScheduleConfig>;
    return {
      enabled: !!c.enabled,
      intervalSeconds: clampInterval(c.intervalSeconds),
      detectOnly: !!c.detectOnly,
      reviewVerdict: normaliseVerdict(c.reviewVerdict),
      quietHours: normaliseQuiet(c.quietHours),
      updatedAt: c.updatedAt ?? "",
    };
  } catch {
    return {
      enabled: false, intervalSeconds: DEFAULT_INTERVAL_SECONDS,
      detectOnly: false, reviewVerdict: DEFAULT_VERDICT,
      quietHours: { ...DEFAULT_QUIET }, updatedAt: "",
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

  // 靜音時段直接不 spawn。刻意不寫執行紀錄 —— 5 分鐘一輪的話一晚會堆出
  // 近百筆「因為半夜所以沒跑」，翻紀錄的人要的不是那個。狀態看 UI 的
  // lastSkipReason 就知道。
  const config = await readConfig();
  if (inQuietHours(config.quietHours)) {
    const { startHour: a, endHour: b } = config.quietHours;
    rt.lastSkipReason =
      `靜音時段（台北 ${String(a).padStart(2, "0")}:00–${String(b).padStart(2, "0")}:00）`;
    return;
  }

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
  quietHours?: Partial<QuietHours>;
}): Promise<SchedulerState> {
  const current = await readConfig();
  const config: ScheduleConfig = {
    enabled: input.enabled,
    intervalSeconds: clampInterval(input.intervalSeconds ?? current.intervalSeconds),
    detectOnly: input.detectOnly ?? current.detectOnly,
    reviewVerdict: normaliseVerdict(input.reviewVerdict ?? current.reviewVerdict),
    quietHours: normaliseQuiet({ ...current.quietHours, ...(input.quietHours ?? {}) }),
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
    quietNow: inQuietHours(config.quietHours),
    taipeiHour: taipeiHour(),
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
