import { readFile, mkdir, stat, writeFile } from "fs/promises";
import path from "path";
import { repoPath, run } from "@/lib/repo";
import { listRepoDirs, mapLimit, statusOf, workspace, worktreesOf } from "@/lib/changes";
import { getWorkIndex } from "@/lib/workIndex";
import { canonicalRepo, parseSessionTitle } from "@/lib/workItemRules";
import type { WorkItem } from "@/lib/workIndexRules";
import {
  LOG_FORMAT, branchMatchesTicket, mergeLineFiles, parseLog, parseNameStatus,
  type LineBranch, type LineReason, type WorkChanges,
} from "@/lib/workChangesRules";

export type { WorkChanges, LineBranch };

/** 手動加進某條線的 worktree（偵測一定會漏，要有逃生口） */
const MANUAL_FILE = repoPath("data/local-state/work-lines.json");
const CONCURRENCY = 8;

// ─── 手動加入的 worktree ─────────────────────────────────────────────────────

type ManualMap = Record<string, string[]>;

async function readManual(): Promise<ManualMap> {
  const raw = await readFile(MANUAL_FILE, "utf8").catch(() => null);
  if (!raw) return {};
  try {
    const d = JSON.parse(raw) as { lines?: ManualMap };
    return d.lines ?? {};
  } catch {
    return {};
  }
}

/** 加入／移除一個 worktree（同一個路徑再按一次就是移除） */
export async function toggleManual(key: string, worktree: string): Promise<string[]> {
  const all = await readManual();
  const cur = all[key] ?? [];
  const next = cur.includes(worktree) ? cur.filter((w) => w !== worktree) : [...cur, worktree];
  all[key] = next;
  if (!next.length) delete all[key];
  await mkdir(path.dirname(MANUAL_FILE), { recursive: true });
  await writeFile(MANUAL_FILE, JSON.stringify({ lines: all }, null, 2) + "\n", "utf8");
  return next;
}

// ─── 找出這條線橫跨哪些 repo ─────────────────────────────────────────────────

/**
 * 這條線可能動到哪些 repo。
 *
 * 三個來源：這條線的 PR、session 標題裡的 `[repo/sub-repo]`、以及手動加入的。
 * **刻意不掃全部 repo**：`git log --grep` 掃 117 個 repo 太貴，而且 trailer 只在
 * commit 之後才存在，光靠它會漏掉「還沒 commit 過的那條分支」。
 */
function candidateRepos(item: WorkItem): Set<string> {
  const repos = new Set<string>();
  for (const pr of item.prs) repos.add(pr.repo);
  for (const s of item.sessions) {
    if (s.repo) repos.add(s.repo);
    const ref = parseSessionTitle(s.title);
    const r = canonicalRepo(ref.repo, {});
    if (r) repos.add(r);
  }
  return repos;
}

/** repo 名 → 本機路徑（只看工作區根目錄底下，跟「未提交的改動」同一套範圍） */
async function localPathsOf(repos: Iterable<string>): Promise<Map<string, string>> {
  const { roots, offloaded } = await workspace();
  const out = new Map<string, string>();
  for (const repo of repos) {
    if (offloaded.has(repo)) continue;
    for (const root of roots) {
      const p = path.basename(root) === repo ? root : path.join(root, repo);
      const ok = await stat(path.join(p, ".git")).then(() => true, () => false);
      if (ok) {
        out.set(repo, p);
        break;
      }
    }
  }
  return out;
}

// ─── 單一 worktree 的「這條線」 ──────────────────────────────────────────────

/**
 * 這個 worktree 要跟誰比。
 *
 * **不能寫死 master**：實測 km／mvbf 是 `origin/master`、ragdoll-cat 是
 * `origin/develop`、finch 是 `origin/main`。`origin/HEAD` 沒設時退回常見的幾個。
 */
async function baseRefOf(worktree: string): Promise<string | null> {
  const head = await run("git", ["-C", worktree, "symbolic-ref", "-q", "--short", "refs/remotes/origin/HEAD"]);
  if (head.code === 0 && head.stdout.trim()) return head.stdout.trim();
  for (const cand of ["origin/main", "origin/master", "origin/develop"]) {
    const r = await run("git", ["-C", worktree, "rev-parse", "--verify", "-q", cand]);
    if (r.code === 0) return cand;
  }
  return null;
}

async function readBranch(
  repo: string,
  worktree: string,
  branch: string | null,
  why: LineReason[]
): Promise<LineBranch> {
  const shell: LineBranch = {
    repo,
    worktree,
    worktreeName: path.basename(worktree),
    branch,
    base: null,
    mergeBase: null,
    commits: [],
    files: [],
    why,
  };

  const base = await baseRefOf(worktree);
  if (!base) return { ...shell, error: "找不到可以比的基準分支（origin/HEAD 沒設）" };

  const mb = await run("git", ["-C", worktree, "merge-base", base, "HEAD"]);
  if (mb.code !== 0) return { ...shell, base, error: mb.stderr.trim().slice(0, 200) };
  const mergeBase = mb.stdout.trim();

  const [log, committed, overall, status] = await Promise.all([
    run("git", ["-C", worktree, "log", `--format=${LOG_FORMAT}`, `${mergeBase}..HEAD`], {
      timeoutMs: 30_000,
    }),
    run("git", ["-C", worktree, "diff", "--name-only", `${mergeBase}..HEAD`], { timeoutMs: 30_000 }),
    // 不帶 `..HEAD`：這樣比的是「base → **工作區**」，commit 過的與還沒 commit 的一起算
    run("git", ["-C", worktree, "diff", "--name-status", mergeBase], { timeoutMs: 60_000 }),
    statusOf(worktree),
  ]);

  return {
    ...shell,
    base,
    mergeBase,
    commits: parseLog(log.stdout),
    files: mergeLineFiles(
      parseNameStatus(overall.stdout),
      committed.stdout.split("\n").filter(Boolean),
      status
    ),
  };
}

// ─── 整條線 ──────────────────────────────────────────────────────────────────

/**
 * 一個工作項目（票／PR）橫跨各 repo 的改動。
 *
 * 每條分支都會標 `why`（為什麼被收進來）：`trailer` 是 commit 裡的
 * `Claude-Session:`（唯一精確的那條），其餘是靠票號、PR 或人工推的。
 * UI 一定要把這個差別畫出來 —— 「推出來的」有可能是錯的。
 */
export async function workChanges(key: string): Promise<WorkChanges | { error: string }> {
  const index = await getWorkIndex();
  const item = index.items.find((i) => i.key === key);
  if (!item) return { error: `找不到工作項目 ${key}` };

  const manual = (await readManual())[key] ?? [];
  const sessionIds = new Set(item.sessions.map((s) => s.id));
  const prRepos = new Set(item.prs.map((p) => p.repo));
  const paths = await localPathsOf(candidateRepos(item));

  // 候選：候選 repo 的每個 worktree ＋ 手動加入的路徑
  const candidates: { repo: string; worktree: string; branch: string | null }[] = [];
  const seen = new Set<string>();
  const add = (repo: string, worktree: string, branch: string | null) => {
    const key = path.resolve(worktree);
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ repo, worktree, branch });
  };
  for (const [repo, dir] of paths) {
    for (const w of await worktreesOf(dir)) add(repo, w.path, w.branch);
  }

  /*
   * **再掃一次全工作區，找分支名含票號的 worktree。**
   *
   * 只靠 session 標題與 PR 推 repo 是不夠的，而且**不是因為標題寫錯**：
   * 標題的子 repo 本來就是選填（`[km] VB-2267 …` 完全合法），所以那一格
   * 常常只有 `km`，根本沒有指出工作在哪個 repo。VB-2267 就是這樣 —— 實際工作在
   * `edu-droid-flutter-vb-2267`（分支 `Jay/VB-2267-white-logo-dark-theme`），
   * 舊的判準一個分支都找不到（Jay 2026-09-17 回報）。
   *
   * **分支名才是 git 裡的事實**，標題是人／agent 當下打的字 —— 關聯要建在前者上。
   *
   * 成本：每個 repo 一次 `git worktree list`（「未提交的改動」本來就在做同樣的事，
   * 129 個 repo 約一秒）。只有這條線有票號時才做。
   */
  if (item.ticketKey) {
    const { dirs } = await listRepoDirs();
    const extra = await mapLimit(dirs, CONCURRENCY, async (dir) => {
      const wts = await worktreesOf(dir);
      const repo = path.basename(wts[0]?.path ?? dir);
      return wts
        .filter((w) => branchMatchesTicket(w.branch, item.ticketKey))
        .map((w) => ({ repo, worktree: w.path, branch: w.branch }));
    });
    for (const list of extra) for (const c of list) add(c.repo, c.worktree, c.branch);
  }
  for (const w of manual) {
    if (seen.has(path.resolve(w))) continue;
    const wts = await worktreesOf(w).catch(() => []);
    const self = wts.find((x) => path.resolve(x.path) === path.resolve(w));
    // repo 名要取**主 worktree** 的目錄名，不是這個路徑的 —— linked worktree 可以
    // 叫任何名字（`~/.mvb-worktrees/poc-desktop-mode` 的 repo 其實是 edu-mvb-mac-playground）
    add(path.basename(wts[0]?.path ?? w), w, self?.branch ?? null);
  }

  // 收不收進來：分支名含票號／是這條線 PR 的 repo 主分支／手動加入／commit 帶 trailer
  const scanned = await mapLimit(candidates, CONCURRENCY, async (c) => {
    const why: LineReason[] = [];
    if (manual.includes(c.worktree)) why.push("manual");
    if (branchMatchesTicket(c.branch, item.ticketKey)) why.push("branch-name");

    // trailer 要有 commit 才驗得到，所以先撈這條分支的 log（上限 200 筆，夠用了）
    let hasTrailer = false;
    if (!why.length || why.includes("manual")) {
      const base = await baseRefOf(c.worktree);
      if (base) {
        const log = await run(
          "git",
          ["-C", c.worktree, "log", `--format=${LOG_FORMAT}`, "-200", `${base}..HEAD`],
          { timeoutMs: 20_000 }
        );
        hasTrailer = parseLog(log.stdout).some((x) => x.sessionId && sessionIds.has(x.sessionId));
      }
    }
    if (hasTrailer) why.unshift("trailer");
    // PR 的 repo：**分支要正好是 PR 的來源分支**才算。
    // 只比 repo 會把那個 repo 的 master 也收進來，那是別人的工作，不是這條線的
    if (!why.length && c.branch && prRepos.has(c.repo)) {
      const isHead = item.prs.some((p) => p.repo === c.repo && p.headRefName === c.branch);
      if (isHead) why.push("pr");
    }
    return { c, why };
  });

  const picked = scanned.filter((x) => x.why.length);
  const branches = await mapLimit(picked, CONCURRENCY, ({ c, why }) =>
    readBranch(c.repo, c.worktree, c.branch, why)
  );

  return {
    key,
    ticketKey: item.ticketKey,
    scannedAt: new Date().toISOString(),
    // 有 trailer 的排前面（那是精確關聯），再來才是推出來的
    branches: branches.sort((a, b) => {
      const rank = (x: LineBranch) => (x.why.includes("trailer") ? 0 : x.why.includes("manual") ? 1 : 2);
      return rank(a) - rank(b) || a.repo.localeCompare(b.repo);
    }),
    candidates: scanned
      .filter((x) => !x.why.length)
      .map(({ c }) => ({ ...c, worktreeName: path.basename(c.worktree) })),
  };
}
