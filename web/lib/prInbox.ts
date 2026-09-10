import { readFile, readdir, stat, unlink } from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { repoPath } from "@/lib/repo";

export const RUNS_DIR = "data/pr-inbox-runs";

/**
 * 紀錄保留天數。沒叫 AI 的那些（clean / detected / skipped / 偵測失敗）
 * 看過就沒用了，留 7 天；真的派過 AI 的要留久一點才查得到花費與當時的判斷。
 */
export const RETAIN_DAYS = 7;
export const RETAIN_DAYS_AI = 30;

/**
 * 這筆算不算「AI 執行過」。
 * claude 有 metadata 就是跑過；aborted 是被中斷的（多半死在 AI 那段，
 * 而且正是最需要事後追的），一律當 AI 那組看待。
 */
function isAiRun(rec: { claude: ClaudeMeta | null; status: string }): boolean {
  return rec.claude !== null || rec.status === "aborted";
}

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
  /** clean=沒待處理 detected=只偵測 handled=叫過 AI skipped=被鎖擋掉 aborted=被 kill failed/detect-failed */
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

export interface PruneResult {
  deleted: string[];
  keptAi: number;
  kept: number;
}

/**
 * 清掉過期的執行紀錄（連 .prs.json 與 .log 一起）。
 *
 * 用 startedAt 判斷，讀不到就退回檔名裡的時間戳 —— 兩者都拿不到就不動它，
 * 寧可留著也不要誤刪。
 */
export async function pruneRuns(now = Date.now()): Promise<PruneResult> {
  const runs = await listRuns(10_000);
  const result: PruneResult = { deleted: [], keptAi: 0, kept: 0 };

  for (const r of runs) {
    const ai = isAiRun(r);
    const startedMs = Date.parse(r.startedAt || "") || runIdToMs(r.id);
    if (!startedMs) {
      if (ai) result.keptAi++;
      else result.kept++;
      continue;
    }
    const ageDays = (now - startedMs) / 86_400_000;
    if (ageDays > (ai ? RETAIN_DAYS_AI : RETAIN_DAYS)) {
      if (await deleteRun(r.id)) result.deleted.push(r.id);
    } else if (ai) {
      result.keptAi++;
    } else {
      result.kept++;
    }
  }
  return result;
}

/** 檔名形態是 YYYYMMDD-HHMMSS（本機時間）。 */
function runIdToMs(id: string): number {
  const m = id.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/);
  if (!m) return 0;
  const [, y, mo, d, h, mi, s] = m;
  return new Date(+y, +mo - 1, +d, +h, +mi, +s).getTime();
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

/**
 * 觸發一輪。detached 丟出去就不管 —— AI 那段可能跑好幾分鐘，不能綁在
 * HTTP request 上，也不該因為 dev server 重啟就被殺掉。
 * 重入保護在腳本自己的鎖裡。
 */
export function triggerRun(
  opts: { detectOnly?: boolean; trigger?: "manual" | "scheduled" } = {}
): { pid: number | null } {
  const args = [
    repoPath("scripts/pr-inbox-watch.sh"),
    "--trigger", opts.trigger ?? "manual",
  ];
  if (opts.detectOnly) args.push("--detect-only");
  const child = spawn("/bin/zsh", args, {
    cwd: repoPath(),
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
  return { pid: child.pid ?? null };
}
