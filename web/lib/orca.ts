import { readFile, mkdir, stat, writeFile } from "fs/promises";
import path from "path";
import { repoPath, run } from "@/lib/repo";

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

const REGISTRY_FILE = repoPath("data/local-state/orca-sessions.json");
const PRESENCE_FILE = repoPath("data/local-state/orca-presence.json");
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
  await writeFile(REGISTRY_FILE, JSON.stringify(r, null, 2) + "\n", "utf8");
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

  const status = await orcaStatus();
  if (!status.running || !status.runtimeReady) {
    // 先試著把 Orca 叫起來；`open` 會等到 runtime 可用才回來
    const opened = await cli<unknown>(["open"]);
    if (!opened.ok) return { status: "orca-down" };
  }

  // ① 這個 session 之前開過、而且那個分頁還活著 → 切過去就好
  const registry = await readRegistry();
  const known = registry[sessionId];
  if (known) {
    const shown = await cli<{ terminal?: { connected?: boolean; orphaned?: boolean } }>(
      ["terminal", "show", "--terminal", known.handle]
    );
    const t = shown.result?.terminal;
    if (shown.ok && t?.connected && !t.orphaned) {
      await cli<unknown>(["terminal", "switch", "--terminal", known.handle]);
      return { status: "reused", handle: known.handle };
    }
    delete registry[sessionId];
    await writeRegistry(registry);
  }

  // ② 已經有人 resume 了同一個 —— 再開一個會變成兩份在寫同一份紀錄。
  //    記帳掉了（例如狀態檔被刪）而分頁還活著時，會落到這條，結果一樣是不開。
  const pid = await externalResumePid(sessionId);
  if (pid) return { status: "external", pid };

  // ③ Orca 只認得註冊過的 repo；要不要註冊是 Jay 的決定
  const repos = await knownRepoPaths();
  if (!isUnderKnownRepo(cwd, repos)) {
    if (!input.registerRepo) return { status: "needs-repo", repoPath: cwd };
    const added = await cli<unknown>(["repo", "add", "--path", cwd]);
    if (!added.ok) {
      return { status: "error", error: added.error?.message ?? "repo add 失敗" };
    }
  }

  // 刻意不帶 `--focus`：Orca 1.4.198 帶了它會回
  // `Timed out waiting for terminal handle after creation`（實測，不帶就正常）。
  // 改成建立完再 switch 過去，效果一樣。
  const created = await cli<{ terminal?: { handle?: string } }>([
    "terminal", "create",
    "--worktree", `path:${cwd}`,
    "--command", `claude --resume ${sessionId}`,
  ]);
  const handle = created.result?.terminal?.handle;
  if (!created.ok || !handle) {
    return { status: "error", error: created.error?.message ?? "terminal create 失敗" };
  }

  await cli<unknown>(["terminal", "switch", "--terminal", handle]);
  registry[sessionId] = { handle, cwd, openedAt: new Date().toISOString() };
  await writeRegistry(registry);
  return { status: "opened", handle };
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
    .then(() => writeFile(PRESENCE_FILE, JSON.stringify(presence, null, 2) + "\n", "utf8"))
    .catch(() => undefined);
  return presence;
}
