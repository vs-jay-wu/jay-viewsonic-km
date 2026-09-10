import { readFile, readdir, stat, unlink } from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { repoPath, run } from "@/lib/repo";

export const RUNS_DIR = "data/pr-inbox-runs";
const LAUNCHD_LABEL = "com.jay-viewsonic-km.pr-inbox-watch";

export interface RunPr {
  repo: string;
  number: number;
  title: string;
  url: string;
  author: string;
  priority?: string;
  reason?: string;
}

export interface ClaudeMeta {
  exitCode: number;
  sessionId: string | null;
  costUsd: number | null;
  durationMs: number | null;
  apiDurationMs: number | null;
  numTurns: number | null;
  isError: boolean;
  resultText: string;
}

export interface RunRecord {
  id: string;
  startedAt: string;
  finishedAt: string;
  /** clean=沒待處理 detected=只偵測 handled=叫過 AI skipped=被鎖擋掉 failed/detect-failed */
  status: string;
  note: string;
  trigger: string;
  prCount: number;
  prs: RunPr[];
  claude: ClaudeMeta | null;
  hasLog: boolean;
}

export interface LockState {
  locked: boolean;
  pid: number | null;
  startedAt: string | null;
  runId: string | null;
  /** 持有者行程還活著嗎（false = 死鎖，下一輪會自己回收） */
  alive: boolean;
}

export interface WatcherState {
  loaded: boolean;
  intervalSeconds: number | null;
  plistExists: boolean;
  raw: string;
}

/** 只允許 <id>.json 形態的 id，避免路徑穿越。 */
export function isValidRunId(id: string): boolean {
  return /^\d{8}-\d{6}$/.test(id);
}

export async function listRuns(limit = 200): Promise<RunRecord[]> {
  const dir = repoPath(RUNS_DIR);
  const entries = await readdir(dir).catch(() => [] as string[]);
  const ids = entries
    .filter((f) => f.endsWith(".json") && !f.endsWith(".prs.json"))
    .map((f) => f.replace(/\.json$/, ""))
    .filter(isValidRunId)
    .sort()
    .reverse()
    .slice(0, limit);

  const runs = await Promise.all(
    ids.map(async (id) => {
      const raw = await readFile(path.join(dir, `${id}.json`), "utf8").catch(() => null);
      if (!raw) return null;
      try {
        const rec = JSON.parse(raw) as Omit<RunRecord, "hasLog">;
        const hasLog = await stat(path.join(dir, `${id}.log`)).then(
          () => true,
          () => false
        );
        return { ...rec, hasLog };
      } catch {
        return null;
      }
    })
  );
  return runs.filter((r): r is RunRecord => r !== null);
}

export async function readRunLog(id: string): Promise<string | null> {
  if (!isValidRunId(id)) return null;
  return readFile(repoPath(RUNS_DIR, `${id}.log`), "utf8").catch(() => null);
}

export async function deleteRun(id: string): Promise<boolean> {
  if (!isValidRunId(id)) return false;
  const targets = [`${id}.json`, `${id}.prs.json`, `${id}.log`];
  let deleted = false;
  for (const t of targets) {
    await unlink(repoPath(RUNS_DIR, t)).then(
      () => { deleted = true; },
      () => {}
    );
  }
  return deleted;
}

export async function lockState(): Promise<LockState> {
  const dir = repoPath(RUNS_DIR, ".lock");
  const read = (f: string) =>
    readFile(path.join(dir, f), "utf8").then((s) => s.trim(), () => null);

  const [pidRaw, startedAt, runId] = await Promise.all([
    read("pid"),
    read("startedAt"),
    read("runId"),
  ]);
  const exists = await stat(dir).then(() => true, () => false);
  if (!exists) {
    return { locked: false, pid: null, startedAt: null, runId: null, alive: false };
  }
  const pid = pidRaw ? Number(pidRaw) : null;
  let alive = false;
  if (pid) {
    try {
      process.kill(pid, 0); // 只探測，不送訊號
      alive = true;
    } catch {
      alive = false;
    }
  }
  return { locked: true, pid, startedAt, runId, alive };
}

export async function watcherState(): Promise<WatcherState> {
  const { stdout } = await run(
    "/bin/zsh",
    [repoPath("scripts/setup-pr-inbox-watch.sh"), "--status"],
    { timeoutMs: 15_000 }
  );
  const loaded = stdout.includes(`已載入：${LAUNCHD_LABEL}`);
  const m = stdout.match(/interval = (\d+)/);
  return {
    loaded,
    intervalSeconds: m ? Number(m[1]) : null,
    plistExists: loaded || stdout.includes("plist 存在"),
    raw: stdout.trim(),
  };
}

export async function setWatcher(
  action: "install" | "uninstall",
  intervalSeconds?: number
): Promise<{ ok: boolean; output: string }> {
  const args = [repoPath("scripts/setup-pr-inbox-watch.sh"), `--${action}`];
  if (action === "install" && intervalSeconds) {
    args.push("--interval", String(Math.max(60, Math.floor(intervalSeconds))));
  }
  const { stdout, stderr, code } = await run("/bin/zsh", args, { timeoutMs: 30_000 });
  return { ok: code === 0, output: (stdout + stderr).trim() };
}

/**
 * 手動觸發一輪。detached 丟出去就不管 —— AI 那段可能跑好幾分鐘，
 * 不能綁在 HTTP request 上。重入保護在腳本自己的鎖裡。
 */
export function triggerRun(detectOnly: boolean): { pid: number | null } {
  const args = [repoPath("scripts/pr-inbox-watch.sh"), "--trigger", "manual"];
  if (detectOnly) args.push("--detect-only");
  const child = spawn("/bin/zsh", args, {
    cwd: repoPath(),
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
  return { pid: child.pid ?? null };
}
