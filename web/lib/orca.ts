import { readFile, mkdir, stat } from "fs/promises";
import path from "path";
import { repoPath, run } from "@/lib/repo";
import { statePath } from "@/lib/statePaths";
import { writeStateFile } from "@/lib/stateWrite";

/**
 * 用 Orca（ADE）的 CLI 開 Claude session。
 *
 * 兩件事靠實測定下來（2026-09-11）：
 *
 * 1. **不能用終端標題做重複偵測** —— `terminal create --title X` 之後，標題會被
 *    執行中的程式蓋掉（實測：帶 `--title km-probe-3 --command "sleep 40"`，
 *    `terminal show` 回來的 title 已經是 `sleep`）。所以改成自己記帳：
 *    sessionId → terminal handle，開之前先 `terminal show` 確認那個 handle 還活著。
 * 2. **Orca 只認得註冊過的 repo** —— 沒註冊的路徑會回 `selector_not_found`。
 *    要不要註冊是會改 Orca 設定的決定，所以回報給 UI 讓 Jay 自己按，不自作主張。
 */

const REGISTRY_FILE = statePath("orca-sessions.json");
const PRESENCE_FILE = statePath("orca-presence.json");
const APP_PATH = process.env.ORCA_APP || "/Applications/Orca.app";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CliResult<T> {
  ok: boolean;
  result?: T;
  error?: { code?: string; message?: string };
}

async function cli<T>(args: string[]): Promise<CliResult<T>> {
  const { stdout, stderr, code } = await run(
    "/bin/zsh",
    [repoPath("scripts/orca.sh"), ...args, "--json"],
    { timeoutMs: 60_000 }
  );
  if (code !== 0 && !stdout.trim()) {
    return { ok: false, error: { message: (stderr || stdout || `orca exit ${code}`).trim() } };
  }
  try {
    return JSON.parse(stdout) as CliResult<T>;
  } catch {
    return { ok: false, error: { message: (stdout || stderr).trim().slice(0, 500) } };
  }
}

// ─── 記帳（sessionId → terminal handle）───────────────────────────────────────

type Registry = Record<string, { handle: string; cwd: string; openedAt: string }>;

async function readRegistry(): Promise<Registry> {
  const raw = await readFile(REGISTRY_FILE, "utf8").catch(() => null);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Registry;
  } catch {
    return {};
  }
}

async function writeRegistry(r: Registry): Promise<void> {
  await mkdir(path.dirname(REGISTRY_FILE), { recursive: true });
  await writeStateFile(REGISTRY_FILE, JSON.stringify(r, null, 2) + "\n");
}

// ─── 查詢 ────────────────────────────────────────────────────────────────────

export async function orcaStatus(): Promise<{ running: boolean; runtimeReady: boolean }> {
  const res = await cli<{
    app?: { running?: boolean };
    runtime?: { state?: string; reachable?: boolean };
  }>(["status"]);
  return {
    running: !!res.result?.app?.running,
    runtimeReady: res.result?.runtime?.state === "ready",
  };
}

export async function knownRepoPaths(): Promise<string[]> {
  const res = await cli<{ repos?: { path?: string }[] }>(["repo", "list"]);
  return (res.result?.repos ?? []).map((r) => r.path).filter((p): p is string => !!p);
}

/** 這個 cwd 在不在某個已註冊的 repo 底下（子目錄也算） */
export function isUnderKnownRepo(cwd: string, repos: string[]): boolean {
  return repos.some((r) => cwd === r || cwd.startsWith(r.endsWith("/") ? r : r + "/"));
}

/** 有沒有人在 Orca 之外手動 resume 同一個 session */
async function externalResumePid(sessionId: string): Promise<number | null> {
  const { stdout, code } = await run("/usr/bin/pgrep", ["-f", `claude .*--resume ${sessionId}`], {
    timeoutMs: 10_000,
  });
  if (code !== 0) return null;
  const pid = Number(stdout.trim().split(/\s+/)[0]);
  return Number.isFinite(pid) ? pid : null;
}

// ─── 開啟 ────────────────────────────────────────────────────────────────────

export type OpenOutcome =
  | { status: "reused"; handle: string }
  | { status: "opened"; handle: string }
  | { status: "needs-repo"; repoPath: string }
  | { status: "external"; pid: number }
  | { status: "orca-down" }
  | { status: "error"; error: string };

export interface OpenInput {
  sessionId: string;
  cwd: string;
  /** Jay 在 web 上按過「註冊並開啟」才會是 true */
  registerRepo?: boolean;
}

export async function openSession(input: OpenInput): Promise<OpenOutcome> {
  const { sessionId, cwd } = input;
  if (!UUID_RE.test(sessionId)) return { status: "error", error: "session id 格式不對" };

  // ⚠️ **每呼叫一次 CLI 就會啟動一個全新的 Orca.app 行程**，而 macOS 26 的
  // App Data 保護會對此跳「Orca.app would like to access data from other apps」。
  // 所以這裡刻意把呼叫次數壓到最少：
  //   - 不先問 `status`（直接做事，失敗再處理）
  //   - 不先問 `repo list`（create 失敗會回 selector_not_found，用那個判斷）
  //   - 重用時只打一次 `terminal switch`（handle 死了它自己會失敗）
  // 常見情況因此是 2 次（建立＋切換）或 1 次（重用）。

  // ① 開過而且分頁還在 → 直接切過去。切不過去就是死了，往下走重開。
  const registry = await readRegistry();
  const known = registry[sessionId];
  if (known) {
    const switched = await cli<unknown>(["terminal", "switch", "--terminal", known.handle]);
    if (switched.ok) return { status: "reused", handle: known.handle };
    delete registry[sessionId];
    await writeRegistry(registry);
  }

  // ② 已經有人 resume 了同一個 —— 再開一個會變成兩份在寫同一份紀錄。
  //    這一步是 pgrep，不會啟動 Orca。
  const pid = await externalResumePid(sessionId);
  if (pid) return { status: "external", pid };

  // ③ 直接建立；repo 沒註冊時 Orca 會回 selector_not_found，不必先查一次清單
  const created = await createTerminal(sessionId, cwd);
  if (!created.ok && created.error?.code === "selector_not_found") {
    if (!input.registerRepo) return { status: "needs-repo", repoPath: cwd };
    const added = await cli<unknown>(["repo", "add", "--path", cwd]);
    if (!added.ok) return { status: "error", error: added.error?.message ?? "repo add 失敗" };
    const retry = await createTerminal(sessionId, cwd);
    return finishCreate(retry, sessionId, cwd, registry);
  }
  return finishCreate(created, sessionId, cwd, registry);
}

/** 刻意不帶 `--focus`：Orca 1.4.198 帶了它會回
 *  `Timed out waiting for terminal handle after creation`（實測，不帶就正常）。
 *  改成建立完再 switch，效果一樣。 */
function createTerminal(sessionId: string, cwd: string) {
  return cli<{ terminal?: { handle?: string } }>([
    "terminal", "create",
    "--worktree", `path:${cwd}`,
    "--command", `claude --resume ${sessionId}`,
  ]);
}

async function finishCreate(
  created: CliResult<{ terminal?: { handle?: string } }>,
  sessionId: string,
  cwd: string,
  registry: Registry
): Promise<OpenOutcome> {
  const handle = created.result?.terminal?.handle;
  if (!created.ok || !handle) {
    const msg = created.error?.message ?? "terminal create 失敗";
    // Orca 沒起來時會是連線類的錯誤，跟一般失敗分開講
    if (/runtime|connect|ECONNREFUSED|not reachable/i.test(msg)) return { status: "orca-down" };
    return { status: "error", error: msg };
  }
  await cli<unknown>(["terminal", "switch", "--terminal", handle]);
  registry[sessionId] = { handle, cwd, openedAt: new Date().toISOString() };
  await writeRegistry(registry);
  return { status: "opened", handle };
}

// ─── 對正在跑的 session 送 prompt ────────────────────────────────────────────

export type SendOutcome =
  | { status: "sent" }
  /** 沒開過、或那個分頁已經關掉 —— 要先「在 Orca 開啟」 */
  | { status: "not-open" }
  | { status: "orca-down" }
  | { status: "error"; error: string };

/**
 * 把一段文字送進那個 session 正在跑的終端機。
 *
 * ⚠️ **只送給 km 自己開的分頁**（`orca-sessions.json` 裡有記帳的那些）。
 *
 * 理由是 `terminal send --enter` 會**當場送出**：目標若不是 Claude 的 TUI 而是
 * 一個普通 shell，那段文字就變成**被執行的指令**。km 開的分頁是用
 * `--command "claude --resume <id>"` 建的，所以知道裡面跑的是什麼；
 * 從 `terminal list` 撈來的handle 不知道，**不要**為了方便而放寬這條。
 *
 * 送出之後不等回覆：回覆會寫進 session 的 transcript，而那本來就是
 * `TranscriptPanel` 在顯示的東西 —— 等於免費拿到「看著它回」。
 */
export async function sendToSession(sessionId: string, text: string): Promise<SendOutcome> {
  const body = text.trim();
  if (!body) return { status: "error", error: "沒有內容" };

  const registry = await readRegistry();
  const known = registry[sessionId];
  if (!known) return { status: "not-open" };

  // 分頁可能已經被關掉。handle 死了就把記帳清掉，讓畫面能講「要先開」
  const shown = await cli<unknown>(["terminal", "show", "--terminal", known.handle]);
  if (!shown.ok) {
    const msg = shown.error?.message ?? "";
    if (/runtime|connect|ECONNREFUSED|not reachable/i.test(msg)) return { status: "orca-down" };
    delete registry[sessionId];
    await writeRegistry(registry);
    return { status: "not-open" };
  }

  const sent = await cli<unknown>([
    "terminal", "send", "--terminal", known.handle, "--text", body, "--enter",
  ]);
  if (!sent.ok) return { status: "error", error: sent.error?.message ?? "terminal send 失敗" };
  return { status: "sent" };
}

// ─── 有沒有裝 Orca ───────────────────────────────────────────────────────────

export interface OrcaPresence {
  installed: boolean;
  appPath: string;
  checkedAt: string;
}

/**
 * 偵測 Orca 裝了沒，結果**只在「有」的時候永久記住**。
 *
 * 一旦確認裝了就不再偵測（Jay 2026-09-11）—— 應用程式不會自己消失，
 * 每次開首頁都去 stat 一次只是白花時間。
 *
 * 反過來「沒裝」不黏著：那是要他去處理的狀態，處理完（裝好）下次就該翻過來，
 * 所以沒裝的情況每次都重測。
 */
export async function orcaPresence(): Promise<OrcaPresence> {
  const cached = await readFile(PRESENCE_FILE, "utf8")
    .then((raw) => JSON.parse(raw) as Partial<OrcaPresence>)
    .catch(() => null);
  if (cached?.installed) {
    return {
      installed: true,
      appPath: cached.appPath ?? APP_PATH,
      checkedAt: cached.checkedAt ?? "",
    };
  }

  const installed = await stat(APP_PATH).then((s) => s.isDirectory(), () => false);
  const presence: OrcaPresence = {
    installed,
    appPath: APP_PATH,
    checkedAt: new Date().toISOString(),
  };
  await mkdir(path.dirname(PRESENCE_FILE), { recursive: true })
    .then(() => writeStateFile(PRESENCE_FILE, JSON.stringify(presence, null, 2) + "\n"))
    .catch(() => undefined);
  return presence;
}
