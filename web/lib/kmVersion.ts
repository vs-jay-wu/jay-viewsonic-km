/**
 * 查「這台的 km 落後幾個 commit」，以及真的去更新（碰 git 與行程，判準在
 * `kmVersionRules.ts`）。
 *
 * 狀態存 `data/machine/km-version.json` —— **machine 擁有**：它描述的是
 * 「這個 checkout」，每台各自不同。
 */

import { readFile } from "fs/promises";
import { repoPath, repoRoot, run } from "@/lib/repo";
import { statePath } from "@/lib/statePaths";
import { writeStateFile } from "@/lib/stateWrite";
import { type KmVersionState } from "@/lib/kmVersionRules";

const FILE = () => statePath("km-version.json");
const BASE = "origin/master";

export async function readVersionState(): Promise<KmVersionState | null> {
  const raw = await readFile(FILE(), "utf8").catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as KmVersionState;
  } catch {
    return null;
  }
}

/** 真的去問一次 git（會打網路）。結果寫進 machine 狀態 */
export async function checkVersion(): Promise<KmVersionState> {
  const now = new Date().toISOString();
  const fail = async (error: string): Promise<KmVersionState> => {
    const s: KmVersionState = { behind: 0, ahead: 0, dirty: false, checkedAt: now, error };
    await writeStateFile(FILE(), JSON.stringify(s, null, 2) + "\n").catch(() => undefined);
    return s;
  };

  // fetch 不碰工作區，所以在別人正在編輯時跑也安全
  const f = await run("git", ["-C", repoRoot(), "fetch", "origin", "master", "--quiet"], {
    timeoutMs: 60_000,
  });
  if (f.code !== 0) return fail((f.stderr || "git fetch 失敗").trim().slice(0, 300));

  const counts = await run(
    "git",
    ["-C", repoRoot(), "rev-list", "--left-right", "--count", `HEAD...${BASE}`],
    { timeoutMs: 20_000 },
  );
  if (counts.code !== 0) return fail((counts.stderr || "git rev-list 失敗").trim().slice(0, 300));
  // `--left-right --count` 回「<ahead>\t<behind>」
  const [ahead, behind] = counts.stdout.trim().split(/\s+/).map((n) => Number(n) || 0);

  const st = await run("git", ["-C", repoRoot(), "status", "--porcelain"], { timeoutMs: 20_000 });
  const state: KmVersionState = {
    behind,
    ahead,
    dirty: st.code === 0 && st.stdout.trim().length > 0,
    checkedAt: now,
  };
  await writeStateFile(FILE(), JSON.stringify(state, null, 2) + "\n").catch(() => undefined);
  return state;
}

export interface UpdateOutcome {
  ok: boolean;
  /** 給人看的逐步結果，失敗時最後一行就是原因 */
  log: string[];
}

/**
 * 更新並重啟。
 *
 * ⚠️ **重啟會殺掉這個 process**，所以它是最後一步而且**分離出去跑**：
 * 同步呼叫的話這個 HTTP 回應永遠送不出去，畫面上看起來像「按了沒反應」。
 */
export async function applyUpdate(): Promise<UpdateOutcome> {
  const log: string[] = [];
  const step = async (label: string, cmd: string, args: string[]) => {
    const r = await run(cmd, args, { timeoutMs: 300_000 });
    log.push(`${label}：${r.code === 0 ? "ok" : (r.stderr || r.stdout).trim().slice(0, 400)}`);
    return r.code === 0;
  };

  const before = await run("git", ["-C", repoRoot(), "rev-parse", "HEAD"], { timeoutMs: 20_000 });

  // ⚠️ 一律 `--ff-only`：這支不處理合併。有分歧就讓它失敗並把 git 的話原樣帶出來
  if (!(await step("git pull --ff-only", "git", ["-C", repoRoot(), "pull", "--ff-only", "origin", "master"]))) {
    return { ok: false, log };
  }

  const after = await run("git", ["-C", repoRoot(), "rev-parse", "HEAD"], { timeoutMs: 20_000 });
  // lockfile 變了才 npm ci —— 它要幾十秒，沒變就是白等
  const changed = await run(
    "git",
    ["-C", repoRoot(), "diff", "--name-only", before.stdout.trim(), after.stdout.trim()],
    { timeoutMs: 20_000 },
  );
  if (changed.stdout.includes("web/package-lock.json")) {
    if (!(await step("npm ci", "npm", ["--prefix", repoPath("web"), "ci"]))) return { ok: false, log };
  } else {
    log.push("npm ci：跳過（lockfile 沒變）");
  }

  // 分離出去，讓這個回應先送得出去
  await run("sh", ["-c", `(sleep 2; "${repoPath("scripts/setup-km-web.sh")}" --restart) >/dev/null 2>&1 &`], {
    timeoutMs: 10_000,
  });
  log.push("重啟：2 秒後");
  return { ok: true, log };
}
