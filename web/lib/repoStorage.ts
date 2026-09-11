import { spawn } from "child_process";
import { readFile } from "fs/promises";
import { randomUUID } from "crypto";
import { repoPath, repoRoot, run } from "@/lib/repo";
import type { MoveAction, MoveJob, StorageSnapshot } from "@/lib/repoStorageRules";

export type { MoveJob, StorageSnapshot };

const PYTHON = "/usr/bin/python3";
const SCRIPT = repoPath("scripts/repo-storage.py");

/** 搬 24 GB 走 USB 也不該超過這個時間；超過就是卡住了，殺掉比掛著好 */
const JOB_TIMEOUT_MS = 2 * 60 * 60 * 1000;

/**
 * 搬移都交給 `scripts/repo-storage.py`，這裡不自己動檔案也不自己改 JSON。
 *
 * 那支腳本同時是 CLI 入口，兩邊共用同一套檢查（excluded、worktree、空間、
 * 兩邊都有…）。在這裡另寫一份的話，只有網頁按鈕會擋得住，CLI 就擋不住了。
 *
 * **一次只跑一個**：兩個搬移同時結束會各自讀寫 `local.workspace.json`，
 * 後寫的那個會把前一個的結果蓋掉。工作狀態掛在 `globalThis`，
 * 不然 dev 模式的 HMR 會每次重載都清掉進行中的工作。
 */
const g = globalThis as unknown as { __kmRepoMoveJob?: MoveJob | null };

export function currentJob(): MoveJob | null {
  return g.__kmRepoMoveJob ?? null;
}

function isRunning(): boolean {
  return currentJob()?.state === "running";
}

async function orgNames(): Promise<string[]> {
  const raw = await readFile(repoPath("local.workspace.json"), "utf8").catch(() => null);
  if (!raw) return [];
  try {
    const ws = JSON.parse(raw) as { orgs?: Record<string, unknown> };
    return Object.keys(ws.orgs ?? {});
  } catch {
    return [];
  }
}

export interface StorageResult {
  snapshots: StorageSnapshot[];
  job: MoveJob | null;
  error?: string;
}

/** 每個 org 問一次腳本「誰在本機、誰在外接」。只做 readdir，不慢。 */
export async function readStorage(): Promise<StorageResult> {
  const orgs = await orgNames();
  if (orgs.length === 0) {
    return { snapshots: [], job: currentJob(), error: "local.workspace.json 讀不到或沒有任何 org" };
  }

  const snapshots: StorageSnapshot[] = [];
  const errors: string[] = [];
  for (const org of orgs) {
    const res = await run(PYTHON, [SCRIPT, "status", "--org", org, "--json"], {
      timeoutMs: 60_000,
    });
    if (res.code !== 0) {
      errors.push(`${org}：${(res.stderr || res.stdout).trim() || `離開碼 ${res.code}`}`);
      continue;
    }
    try {
      snapshots.push(JSON.parse(res.stdout) as StorageSnapshot);
    } catch {
      errors.push(`${org}：狀態輸出不是合法 JSON`);
    }
  }

  return {
    snapshots,
    job: currentJob(),
    error: errors.length ? errors.join("；") : undefined,
  };
}

export interface StartResult {
  ok: boolean;
  job?: MoveJob;
  error?: string;
  /** 要用哪個 HTTP 狀態碼回：參數錯 400、已經有人在跑 409 */
  status?: number;
}

/**
 * 開一個搬移工作。**立刻回傳**，實際搬移在背景跑，進度靠 `readStorage()` 輪詢。
 *
 * 不做同步等待是因為最大的 repo 有 24 GB，走 USB 可能好幾分鐘 ——
 * 擋在一個 HTTP request 上會先被瀏覽器或 proxy 斷掉，而那時搬移還在進行中，
 * 使用者只會看到一個沒有結論的錯誤。
 */
export function startMove(repo: string, org: string, action: MoveAction): StartResult {
  if (action !== "offload" && action !== "restore") {
    return { ok: false, error: `不認得的動作「${action}」`, status: 400 };
  }
  if (!repo || !org) {
    return { ok: false, error: "要指定 repo 與 org", status: 400 };
  }
  // 參數會被接成路徑，所以這裡也擋一次（腳本自己還會再擋一次，兩邊都要有）
  if (!/^[A-Za-z0-9_][A-Za-z0-9._-]*$/.test(repo) || !/^[A-Za-z0-9._-]+$/.test(org)) {
    return { ok: false, error: `repo 或 org 名稱不合法：${repo} / ${org}`, status: 400 };
  }

  const running = currentJob();
  if (running?.state === "running") {
    return {
      ok: false,
      error: `${running.org}/${running.repo} 正在搬移中，等它跑完再開下一個`,
      status: 409,
    };
  }

  const job: MoveJob = {
    id: randomUUID(),
    repo,
    org,
    action,
    state: "running",
    startedAt: new Date().toISOString(),
    totalBytes: 0,
    copiedBytes: 0,
    fileCount: 0,
    message: "準備中…",
  };
  g.__kmRepoMoveJob = job;

  // --source web：搬遷紀錄要分得出是網頁按的還是 CLI 跑的
  const child = spawn(PYTHON, [SCRIPT, action, repo, "--org", org, "--json", "--source", "web"], {
    cwd: repoRoot(),
  });

  const timer = setTimeout(() => {
    child.kill("SIGTERM");
    finish(job, "error", `超過 ${JOB_TIMEOUT_MS / 60000} 分鐘還沒跑完，已中止（來源沒有被刪）`);
  }, JOB_TIMEOUT_MS);

  let buffer = "";
  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) applyEvent(job, line);
  });

  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  child.on("error", (err) => {
    clearTimeout(timer);
    finish(job, "error", `啟動 repo-storage.py 失敗：${err.message}`);
  });

  child.on("close", (code) => {
    clearTimeout(timer);
    if (buffer.trim()) applyEvent(job, buffer);
    if (job.state !== "running") return;
    // 沒吐 done 也沒吐 error 就結束 —— 一律當成失敗。
    // 離開碼 0 也算：腳本成功時**一定**會有 done 事件，沒有就是中途被砍掉了。
    finish(job, "error", stderr.trim() || `腳本沒有回報結果就結束了（離開碼 ${code}）`);
  });

  return { ok: true, job };
}

interface ScriptEvent {
  event?: string;
  message?: string;
  totalBytes?: number;
  copiedBytes?: number;
  fileCount?: number;
}

function applyEvent(job: MoveJob, line: string): void {
  const text = line.trim();
  if (!text) return;
  let evt: ScriptEvent;
  try {
    evt = JSON.parse(text) as ScriptEvent;
  } catch {
    return; // 不是事件行就忽略，不要因為雜訊把工作標成失敗
  }

  if (typeof evt.totalBytes === "number") job.totalBytes = evt.totalBytes;
  if (typeof evt.copiedBytes === "number") job.copiedBytes = evt.copiedBytes;
  if (typeof evt.fileCount === "number") job.fileCount = evt.fileCount;
  if (evt.message) job.message = evt.message;

  if (evt.event === "done") {
    job.copiedBytes = job.totalBytes;
    finish(job, "done", undefined);
  } else if (evt.event === "error") {
    finish(job, "error", evt.message ?? "搬移失敗");
  }
}

function finish(job: MoveJob, state: "done" | "error", error?: string): void {
  if (job.state !== "running") return;
  job.state = state;
  job.finishedAt = new Date().toISOString();
  if (error) {
    job.error = error;
    job.message = error;
  }
}

export interface ReconcileResult {
  ok: boolean;
  added?: string[];
  removed?: string[];
  message?: string;
  error?: string;
}

/** 只對齊 offloaded 清單，不搬任何檔案。用在「搬完但 JSON 沒寫成功」之後。 */
export async function reconcile(org: string): Promise<ReconcileResult> {
  if (isRunning()) {
    return { ok: false, error: "有搬移正在進行，等它跑完再對齊清單" };
  }
  if (!/^[A-Za-z0-9._-]+$/.test(org)) {
    return { ok: false, error: `org 名稱不合法：${org}` };
  }
  const res = await run(PYTHON, [SCRIPT, "reconcile", "--org", org, "--json"], {
    timeoutMs: 120_000,
  });
  const last = res.stdout.trim().split("\n").filter(Boolean).pop();
  let evt: ScriptEvent & { added?: string[]; removed?: string[] } = {};
  try {
    if (last) evt = JSON.parse(last);
  } catch {
    /* 下面用 code 判斷 */
  }
  if (res.code !== 0 || evt.event === "error") {
    return { ok: false, error: evt.message ?? ((res.stderr || res.stdout).trim() || "對齊失敗") };
  }
  return { ok: true, added: evt.added ?? [], removed: evt.removed ?? [], message: evt.message };
}
