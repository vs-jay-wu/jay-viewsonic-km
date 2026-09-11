import { readFile, mkdir, writeFile } from "fs/promises";
import path from "path";
import { repoPath, run } from "@/lib/repo";
import { recordFailure, recordSuccess } from "@/lib/health";
import { notifyMac } from "@/lib/notify";

const STATE_DIR = "data/local-state";
const SNAPSHOT_FILE = repoPath(STATE_DIR, "my-prs.json");
const CONFIG_FILE = repoPath(STATE_DIR, "my-prs-config.json");
const EVENTS_FILE = repoPath(STATE_DIR, "my-prs-events.json");

const MIN_INTERVAL_SECONDS = 60;
const DEFAULT_INTERVAL_SECONDS = 600;
/** seen 只是去重用的指紋，留最近這麼多筆就夠 */
const SEEN_CAP = 3000;
const EVENTS_CAP = 300;
/** 一次拿到太多事件就不要逐則轟炸，改送一則摘要 */
const NOTIFY_INDIVIDUAL_MAX = 3;

// ─── 型別 ────────────────────────────────────────────────────────────────────

export interface PrReview {
  id: string;
  author: string;
  state: string;
  submittedAt: string;
  url: string;
}

export interface PrComment {
  id: string;
  author: string;
  createdAt: string;
  url: string;
}

export interface MyPr {
  repo: string;
  number: number;
  title: string;
  url: string;
  state: "OPEN" | "MERGED" | "CLOSED";
  isDraft: boolean;
  baseRefName: string;
  headRefName: string;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  mergeable: string | null;
  reviewDecision: string | null;
  checks: string | null;
  reviews: PrReview[];
  approvedBy: string[];
  changesRequestedBy: string[];
  comments: PrComment[];
  openThreads: number;
  openThreadsByOthers: number;
  theirLastActivity: string | null;
}

export interface Snapshot {
  fetchedAs: string;
  fetchedAt: string;
  mergedWithinDays: number;
  prs: MyPr[];
  /** 已經看過（不再產生事件）的 review / comment 指紋 */
  seen?: string[];
  /** 上次抓取失敗的訊息（成功就清掉） */
  lastError?: string | null;
}

export type EventType = "approved" | "changes_requested" | "reviewed" | "commented";

export interface MyPrEvent {
  id: string;
  type: EventType;
  at: string;
  actor: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  read: boolean;
}

export interface MyPrsConfig {
  enabled: boolean;
  intervalSeconds: number;
  /** 有人 review／留言時要不要發 macOS 通知 */
  notify: boolean;
  mergedDays: number;
  updatedAt: string;
}

const DEFAULT_CONFIG: MyPrsConfig = {
  enabled: true,
  intervalSeconds: DEFAULT_INTERVAL_SECONDS,
  notify: true,
  mergedDays: 14,
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

export async function readConfig(): Promise<MyPrsConfig> {
  const c = await readJson<Partial<MyPrsConfig>>(CONFIG_FILE, {});
  return {
    enabled: c.enabled ?? DEFAULT_CONFIG.enabled,
    intervalSeconds: clampInterval(c.intervalSeconds ?? DEFAULT_CONFIG.intervalSeconds),
    notify: c.notify ?? DEFAULT_CONFIG.notify,
    mergedDays: Math.max(1, Math.floor(Number(c.mergedDays ?? DEFAULT_CONFIG.mergedDays)) || 14),
    updatedAt: c.updatedAt ?? "",
  };
}

export async function readSnapshot(): Promise<Snapshot | null> {
  const s = await readJson<Snapshot | null>(SNAPSHOT_FILE, null);
  return s && Array.isArray(s.prs) ? s : null;
}

export async function readEvents(): Promise<MyPrEvent[]> {
  return readJson<MyPrEvent[]>(EVENTS_FILE, []);
}

export async function markEventsRead(ids?: string[]): Promise<MyPrEvent[]> {
  const events = await readEvents();
  const next = events.map((e) =>
    !ids || ids.includes(e.id) ? { ...e, read: true } : e
  );
  await writeJson(EVENTS_FILE, next);
  return next;
}

export async function clearEvents(): Promise<void> {
  await writeJson(EVENTS_FILE, []);
}

// ─── 抓取與差異 ──────────────────────────────────────────────────────────────

/** review 用 GraphQL 的 node id 當指紋；comment 同理。都是穩定不重複的。 */
function reviewKey(r: PrReview): string {
  return `review:${r.id}`;
}
function commentKey(c: PrComment): string {
  return `comment:${c.id}`;
}

function eventTypeOf(state: string): EventType {
  if (state === "APPROVED") return "approved";
  if (state === "CHANGES_REQUESTED") return "changes_requested";
  return "reviewed";
}

export interface RefreshResult {
  ok: boolean;
  error?: string;
  snapshot?: Snapshot;
  newEvents: MyPrEvent[];
  /** 第一次抓（或設定檔被清掉）時只建立基準，不產生事件也不通知 */
  bootstrapped: boolean;
  notified: boolean;
}

/**
 * 抓一次並算出「有沒有人動我的 PR」。
 *
 * 事件只看**別人**的 review 與留言（腳本已經把我自己的濾掉了）。用 node id
 * 當指紋去重，所以同一則 review 不會因為多抓幾次就重複通知。
 *
 * 第一次抓會把現有的 review／留言全部記成 seen —— 否則剛裝好就會被幾十則
 * 歷史紀錄轟炸。
 */
export async function refresh(): Promise<RefreshResult> {
  const config = await readConfig();
  const prev = await readSnapshot();

  const { stdout, stderr, code } = await run(
    "/bin/zsh",
    [repoPath("scripts/my-prs.sh"), "--merged-days", String(config.mergedDays)],
    { timeoutMs: 120_000 }
  );

  if (code !== 0) {
    const error = (stderr || stdout || `my-prs.sh exit ${code}`).trim().slice(0, 2000);
    if (prev) await writeJson(SNAPSHOT_FILE, { ...prev, lastError: error });
    return { ok: false, error, newEvents: [], bootstrapped: false, notified: false };
  }

  let fetched: Snapshot;
  try {
    fetched = JSON.parse(stdout) as Snapshot;
  } catch (e) {
    return {
      ok: false, error: `解析 my-prs.sh 輸出失敗：${(e as Error).message}`,
      newEvents: [], bootstrapped: false, notified: false,
    };
  }

  const seen = new Set(prev?.seen ?? []);
  const bootstrapped = !prev;
  const newEvents: MyPrEvent[] = [];

  for (const pr of fetched.prs) {
    for (const r of pr.reviews) {
      const key = reviewKey(r);
      if (seen.has(key)) continue;
      seen.add(key);
      if (bootstrapped) continue;
      newEvents.push({
        id: key,
        type: eventTypeOf(r.state),
        at: r.submittedAt,
        actor: r.author,
        repo: pr.repo,
        number: pr.number,
        title: pr.title,
        url: r.url || pr.url,
        read: false,
      });
    }
    for (const c of pr.comments) {
      const key = commentKey(c);
      if (seen.has(key)) continue;
      seen.add(key);
      if (bootstrapped) continue;
      newEvents.push({
        id: key,
        type: "commented",
        at: c.createdAt,
        actor: c.author,
        repo: pr.repo,
        number: pr.number,
        title: pr.title,
        url: c.url || pr.url,
        read: false,
      });
    }
  }

  const snapshot: Snapshot = {
    ...fetched,
    seen: [...seen].slice(-SEEN_CAP),
    lastError: null,
  };
  await writeJson(SNAPSHOT_FILE, snapshot);

  if (newEvents.length > 0) {
    const events = await readEvents();
    const merged = [...newEvents, ...events].slice(0, EVENTS_CAP);
    await writeJson(EVENTS_FILE, merged);
  }

  let notified = false;
  if (config.notify && newEvents.length > 0) {
    notified = await sendNotifications(newEvents);
  }

  return { ok: true, snapshot, newEvents, bootstrapped, notified };
}

const TYPE_LABEL: Record<EventType, string> = {
  approved: "approve 了",
  changes_requested: "要求修改",
  reviewed: "留了 review",
  commented: "留言",
};

async function sendNotifications(events: MyPrEvent[]): Promise<boolean> {
  if (events.length > NOTIFY_INDIVIDUAL_MAX) {
    const res = await notifyMac({
      title: "我的 PR 有新動靜",
      subtitle: `${events.length} 則新回應`,
      message: [...new Set(events.map((e) => `${e.repo.split("/").pop()}#${e.number}`))]
        .slice(0, 6)
        .join("、"),
      sound: true,
    });
    return res.ok;
  }
  let ok = false;
  for (const e of events) {
    const res = await notifyMac({
      title: `${e.actor} ${TYPE_LABEL[e.type]}`,
      subtitle: `${e.repo.split("/").pop()}#${e.number}`,
      message: e.title.slice(0, 120),
      sound: e.type === "approved" || e.type === "changes_requested",
    });
    ok = ok || res.ok;
  }
  return ok;
}

// ─── 排程（掛在 web server 裡，跟 PR 巡邏同樣做法）─────────────────────────

const KEY = Symbol.for("km.myPrsScheduler");
interface Runtime {
  timer: ReturnType<typeof setInterval> | null;
  intervalSeconds: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastError: string | null;
  running: boolean;
}
const g = globalThis as unknown as Record<symbol, Runtime | undefined>;
function runtime(): Runtime {
  if (!g[KEY]) {
    g[KEY] = {
      timer: null, intervalSeconds: DEFAULT_INTERVAL_SECONDS,
      lastRunAt: null, nextRunAt: null, lastError: null, running: false,
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

/** 抓一次並更新排程器的狀態。同一時間只跑一輪。 */
export async function runOnce(): Promise<RefreshResult> {
  const rt = runtime();
  if (rt.running) {
    return { ok: false, error: "上一輪還在抓", newEvents: [], bootstrapped: false, notified: false };
  }
  rt.running = true;
  try {
    const res = await refresh();
    rt.lastRunAt = new Date().toISOString();
    rt.lastError = res.ok ? null : (res.error ?? "抓取失敗");
    // 連續失敗才會在首頁跳警告（token 過期是每次都失敗，很快就會累積到門檻）
    if (res.ok) await recordSuccess("my-prs");
    else await recordFailure("my-prs", res.error ?? "抓取失敗");
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
  rt.timer = setInterval(() => {
    void runOnce();
  }, intervalSeconds * 1000);
  rt.timer.unref?.();
  rt.nextRunAt = new Date(Date.now() + intervalSeconds * 1000).toISOString();
}

/** server 啟動時呼叫。沒有快照就先抓一次（建立基準，不會通知）。 */
export async function initScheduler(): Promise<void> {
  const config = await readConfig();
  if (!config.enabled) {
    stopTimer();
    return;
  }
  startTimer(config.intervalSeconds);
  if (!(await readSnapshot())) void runOnce();
}

export async function setConfig(input: Partial<MyPrsConfig>): Promise<MyPrsConfig> {
  const current = await readConfig();
  const config: MyPrsConfig = {
    enabled: input.enabled ?? current.enabled,
    intervalSeconds: clampInterval(input.intervalSeconds ?? current.intervalSeconds),
    notify: input.notify ?? current.notify,
    mergedDays: Math.max(1, Math.floor(Number(input.mergedDays ?? current.mergedDays)) || 14),
    updatedAt: new Date().toISOString(),
  };
  await writeJson(CONFIG_FILE, config);
  if (config.enabled) startTimer(config.intervalSeconds);
  else stopTimer();
  return config;
}

/**
 * 使用者開頁面時順手在背景更新一次，**但不讓他等**。
 * 連續重整不該變成連續打 GitHub，所以有最小間隔。
 */
const MIN_BACKGROUND_GAP_MS = 60_000;

export function refreshInBackground(): { started: boolean; reason?: string } {
  const rt = runtime();
  if (rt.running) return { started: false, reason: "上一輪還在抓" };
  if (rt.lastRunAt && Date.now() - Date.parse(rt.lastRunAt) < MIN_BACKGROUND_GAP_MS) {
    return { started: false, reason: "剛抓過" };
  }
  void runOnce();
  return { started: true };
}

/**
 * 設定說要開但這個 instance 沒掛上 timer 就補掛，狀態才不會騙人。
 * 順便處理「還沒有任何快照」的情況 —— 不然剛裝好要等一個間隔才有東西看。
 */
export async function ensureTimer(): Promise<void> {
  const config = await readConfig();
  const rt = runtime();
  if (config.enabled && !rt.timer) startTimer(config.intervalSeconds);
  if (!config.enabled && rt.timer) stopTimer();
  if (config.enabled && !rt.running && !(await readSnapshot())) void runOnce();
}
