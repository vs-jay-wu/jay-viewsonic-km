import { mkdir, readFile } from "fs/promises";
import path from "path";
import { run } from "@/lib/repo";
import {
  isKnownWorktree, listRepoDirs, mainRepoOfLinkedWorktree, mapLimit, worktreesOf,
} from "@/lib/changes";
import {
  LOG_FORMAT, describeFetch, parseBranches, parseCommits, parseFetchOutput, pushPlan, sortBranches,
  type Branch, type Commit, type RepoHead,
} from "@/lib/gitViewRules";
import { parseNameStatus } from "@/lib/workChangesRules";
import { cacheState, canServeCached, shouldRescan } from "@/lib/repoCacheRules";
import { isExternalRepo } from "@/lib/externalRepos";
import { parseStatus, type ChangedFile } from "@/lib/changesRules";
import { statePath } from "@/lib/statePaths";
import { writeStateFile } from "@/lib/stateWrite";
import { readStateFile } from "@/lib/stateRead";

/**
 * 唯讀的 repo 檢視（`/git`）。
 *
 * **只有 fetch 與 push 會改到東西**（Jay 2026-09-16）。這個檔案裡不會出現
 * checkout／merge／rebase／reset／branch -d／push --force —— 那些由 AI 在 CLI 做。
 * 加新功能前先想一次：它是不是又把某個破壞性動作搬進了瀏覽器。
 */

/** pin 住的 repo（存路徑，改名就當它不在了） */
const PIN_FILE = statePath("git-pinned.json");

export async function readPinned(): Promise<string[]> {
  const raw = await readStateFile(PIN_FILE);
  if (!raw) return [];
  try {
    const d = JSON.parse(raw) as { pinned?: string[] };
    return Array.isArray(d.pinned) ? d.pinned : [];
  } catch {
    return [];
  }
}

export async function togglePinned(dir: string): Promise<string[]> {
  const cur = await readPinned();
  const next = cur.includes(dir) ? cur.filter((d) => d !== dir) : [...cur, dir];
  await mkdir(path.dirname(PIN_FILE), { recursive: true });
  await writeStateFile(PIN_FILE, JSON.stringify({ pinned: next }, null, 2) + "\n");
  return next;
}

export interface RepoBrief {
  name: string;
  dir: string;
  head: RepoHead;
  /** 目前分支領先／落後上游；沒有上游是 null */
  ahead: number | null;
  behind: number | null;
  /** 有幾個未提交的改動（只數，不列） */
  dirty: number;
  worktrees: number;
  lastCommitAt: string | null;
  /**
   * 這個目錄是某個 repo 的 linked worktree 時，主 repo 的名字。
   *
   * 同層的 worktree（`edu-droid-flutter-vb-2193`）在檔案系統上看起來就是另一個 repo，
   * 不標的話會以為公司有兩個同名專案（`/changes` 是把它們收在主 repo 底下的）。
   */
  worktreeOf: string | null;
  pinned: boolean;
}

export interface RepoDetail {
  name: string;
  dir: string;
  head: RepoHead;
  remotes: string[];
  branches: Branch[];
  commits: Commit[];
  /** 還有更舊的（畫面上的「載入更多」） */
  hasMore: boolean;
  /** 未提交的改動（staged ＋ 工作區 ＋ 未追蹤）。graph 最上面那一列就是它 */
  wip: ChangedFile[];
}

const CONCURRENCY = 8;
/** 一次抓幾個 commit。graph 是 O(列數)，再多畫面也讀不完 */
export const PAGE = 120;

/**
 * 只允許工作區裡的 repo —— 前端傳來的路徑不能直接餵給 `git -C`。
 *
 * **讀跟寫的範圍不一樣**（Jay 2026-09-23）：
 * - 讀（`repoDetail` / `repoCommits` / `commitDetail`）**連外接碟上的 repo 也放行**。
 *   `/repo` 的工作台可以開 offloaded 的 repo，只是「這張票當初怎麼改的」而已；
 *   原本避開外接是為了「對 327 個全掃」，選到一個才跑 git 不是同一件事。
 * - 寫（`fetchRepo` / `pushBranch` / `removeWorktree`）**只給本機**。那些會改到東西，
 *   而且在 USB 上慢；offloaded 的 repo 本來就不該在那邊推東西。
 */
async function resolveRepo(dir: string, opts: { write?: boolean } = {}): Promise<string | null> {
  const abs = path.resolve(dir);
  if (await isKnownWorktree(abs)) return abs;
  if (opts.write) return null;
  return (await isExternalRepo(abs)) ? abs : null;
}

async function headOf(dir: string): Promise<RepoHead> {
  const [sha, branch] = await Promise.all([
    run("git", ["-C", dir, "rev-parse", "HEAD"]),
    run("git", ["-C", dir, "symbolic-ref", "-q", "--short", "HEAD"]),
  ]);
  const name = branch.code === 0 ? branch.stdout.trim() : "";
  return { sha: sha.stdout.trim(), branch: name || null, detached: !name };
}

async function remotesOf(dir: string): Promise<string[]> {
  const r = await run("git", ["-C", dir, "remote"]);
  return r.stdout.split("\n").map((x) => x.trim()).filter(Boolean);
}

/** 哪些分支正被某個 worktree 簽出 —— 那種分支不能亂動（這裡只拿來顯示） */
async function checkedOutMap(dir: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const w of await worktreesOf(dir)) {
    if (w.branch) out.set(w.branch, w.path);
  }
  return out;
}

async function dirtyCount(dir: string): Promise<number> {
  const r = await run("git", ["-C", dir, "status", "--porcelain=v1", "--untracked-files=normal"], {
    timeoutMs: 60_000,
  });
  return r.stdout.split("\n").filter(Boolean).length;
}

/** 未提交的改動清單。`--untracked-files=normal`：未追蹤的目錄收成一行，不然產物會洗版 */
async function wipFiles(dir: string): Promise<ChangedFile[]> {
  const r = await run("git", ["-C", dir, "status", "--porcelain=v1", "--untracked-files=normal"], {
    timeoutMs: 60_000,
  });
  return parseStatus(r.stdout);
}

/** 所有 repo 的一行摘要。**不抓 commit**，那是點進去才做的事 */
export async function listRepos(): Promise<{
  repos: RepoBrief[];
  skippedOffloaded: number;
  pinned: string[];
}> {
  const { dirs, skippedOffloaded } = await listRepoDirs();
  const pinned = await readPinned();
  const repos = await mapLimit(dirs, CONCURRENCY, async (dir): Promise<RepoBrief> => {
    const [head, track, dirty, wts, last] = await Promise.all([
      headOf(dir),
      run("git", ["-C", dir, "rev-list", "--left-right", "--count", "HEAD...@{upstream}"]),
      dirtyCount(dir),
      worktreesOf(dir),
      run("git", ["-C", dir, "log", "-1", "--format=%aI"]),
    ]);
    const [a, b] = track.code === 0 ? track.stdout.trim().split(/\s+/).map(Number) : [null, null];
    const main = wts[0]?.path;
    return {
      name: path.basename(dir),
      dir,
      head,
      ahead: Number.isFinite(a as number) ? (a as number) : null,
      behind: Number.isFinite(b as number) ? (b as number) : null,
      dirty,
      worktrees: wts.length,
      lastCommitAt: last.stdout.trim() || null,
      worktreeOf:
        main && path.resolve(main) !== path.resolve(dir) ? path.basename(main) : null,
      pinned: pinned.includes(dir),
    };
  });
  // pin 住的一律在最前面，其餘照最後 commit 時間
  repos.sort((x, y) => {
    if (x.pinned !== y.pinned) return x.pinned ? -1 : 1;
    return (x.lastCommitAt ?? "") < (y.lastCommitAt ?? "") ? 1 : -1;
  });
  return { repos, skippedOffloaded, pinned };
}

export type RepoList = Awaited<ReturnType<typeof listRepos>>;

/**
 * `listRepos()` 的快取。判準在 `lib/repoCacheRules.ts`（有測試），這裡只管狀態。
 *
 * **狀態掛在 `globalThis`**：dev 模式的 HMR 會重新載入模組，掛在模組變數上的話
 * 每次存檔就清空（跟排程 timer 同一個理由，見 `web/AGENTS.md`）。
 *
 * **同時只會有一次掃描**（`inflight`）—— `/code`、`/git`、`/changes` 會在同一瞬間
 * 各打一次，沒有這層就是三次全掃互相搶 CPU，反而更慢。
 */
interface RepoCache {
  data: RepoList | null;
  computedAt: number | null;
  inflight: Promise<RepoList> | null;
}

const g = globalThis as typeof globalThis & { __kmRepoCache?: RepoCache };
const cache: RepoCache = (g.__kmRepoCache ??= { data: null, computedAt: null, inflight: null });

function rescan(): Promise<RepoList> {
  cache.inflight ??= listRepos()
    .then((d) => {
      cache.data = d;
      cache.computedAt = Date.now();
      return d;
    })
    .finally(() => {
      cache.inflight = null;
    });
  return cache.inflight;
}

/**
 * 快取版。`force` 會等新的掃完才回（「重新掃描」按鈕要的是這個）。
 *
 * 回傳多兩個欄位讓呼叫端知道手上這份多舊：`computedAt`（ISO）與 `stale`
 * （這次拿到的是舊資料、背景正在重算）。
 */
export async function listReposCached(
  force = false
): Promise<RepoList & { computedAt: string | null; stale: boolean }> {
  const state = cacheState(cache.computedAt, Date.now());
  const serveCached = canServeCached(state, force) && cache.data !== null;

  if (shouldRescan(state, force)) {
    const p = rescan();
    // 背景重算的失敗不能變成未處理的 rejection —— 這次已經用舊資料回應了
    if (serveCached) p.catch(() => undefined);
    else await p;
  }

  const data = cache.data as RepoList;
  /*
   * **pin 不進快取，每次回應現讀。**
   *
   * pin 只是一份路徑清單，跟 git 狀態無關（Jay 2026-09-23：「我感覺不需要重掃吧？」）
   * —— 為了讓 pin 生效而作廢快取，等於每按一次 pin 就付 2.6 秒重掃 148 個 repo。
   * 讀那個 JSON 是 0.1ms 等級，疊上去便宜得多，而且順序也一起正確。
   */
  const pinned = await readPinned();
  const repos = data.repos
    .map((r) => ({ ...r, pinned: pinned.includes(r.dir) }))
    .sort((x, y) => {
      if (x.pinned !== y.pinned) return x.pinned ? -1 : 1;
      return (x.lastCommitAt ?? "") < (y.lastCommitAt ?? "") ? 1 : -1;
    });

  return {
    ...data,
    repos,
    pinned,
    computedAt: cache.computedAt ? new Date(cache.computedAt).toISOString() : null,
    stale: serveCached && state === "stale",
  };
}

/**
 * git 那一面確定變了就把快取作廢（fetch、push、移除 worktree 之後）。
 *
 * ⚠️ **pin 不要呼叫這個** —— 它不改 git 狀態，而作廢的代價是下一次請求要等
 * 2.6 秒重掃。pin 是在 `listReposCached` 回應時疊上去的。
 */
export function invalidateRepoCache(): void {
  cache.computedAt = null;
}

/** 一頁 commit（`--max-count` 多要一顆，用來判斷後面還有沒有東西） */
export interface CommitPage {
  commits: Commit[];
  hasMore: boolean;
}

interface PageOpts {
  ref?: string;
  limit?: number;
  skip?: number;
}

/**
 * 取一頁 commit。
 *
 * ⚠️ 分頁靠 `--skip`，而它是**對當下這棵 graph** 算的位移 —— 翻頁之間若有新
 * commit 進來（fetch、或自己 commit 一顆），後面那幾頁會整體位移，同一顆可能
 * 重複出現、也可能被跳過。呼叫端必須以 sha 去重（`lib/gitViewRules.ts` 的
 * `mergeCommitPage`），不要假設各頁不相交。
 */
async function commitPage(repo: string, remotes: string[], opts: PageOpts): Promise<CommitPage> {
  const limit = Math.min(opts.limit ?? PAGE, 500);
  const skip = Math.max(0, opts.skip ?? 0);
  const logRes = await run("git", [
    "-C", repo, "log", `--format=${LOG_FORMAT}`,
    // `--date-order` 而不是預設：分支交錯時預設的排法會讓 graph 的線亂跳
    "--date-order",
    `--max-count=${limit + 1}`, `--skip=${skip}`,
    ...(opts.ref && opts.ref !== "--all" ? [opts.ref] : ["--all"]),
  ], { timeoutMs: 60_000 });

  const commits = parseCommits(logRes.stdout, remotes);
  return { commits: commits.slice(0, limit), hasMore: commits.length > limit };
}

/**
 * 一個 repo 的分支、HEAD 與 commit graph。
 *
 * `ref` 給 `--all` 時看全部分支（預設），給某條分支就只看它那條線。
 *
 * 只要往下再翻一頁 commit 的話用 `repoCommits`，不要再打這支 —— 見那邊的註解。
 */
export async function repoDetail(
  dir: string,
  opts: PageOpts = {}
): Promise<RepoDetail | { error: string }> {
  const repo = await resolveRepo(dir);
  if (!repo) return { error: "不認得這個 repo（只能看工作區裡的）" };

  const remotes = await remotesOf(repo);
  const [head, brRes, checkedOut, page, wip] = await Promise.all([
    headOf(repo),
    run("git", [
      "-C", repo, "for-each-ref",
      "--format=%(refname)\x1f%(refname:short)\x1f%(upstream:short)\x1f%(upstream:track)\x1f%(objectname)\x1f%(committerdate:iso-strict)\x1f%(contents:subject)",
      "refs/heads", "refs/remotes",
    ], { timeoutMs: 30_000 }),
    checkedOutMap(repo),
    commitPage(repo, remotes, opts),
    wipFiles(repo),
  ]);

  return {
    name: path.basename(repo),
    dir: repo,
    head,
    remotes,
    branches: sortBranches(parseBranches(brRes.stdout, checkedOut)),
    commits: page.commits,
    hasMore: page.hasMore,
    wip,
  };
}

/**
 * 只取 commit —— 「往下載入更多」用。
 *
 * 跟 `repoDetail` 分開是因為翻頁時**分支清單與未提交改動都用不到**，而那兩份都不便宜：
 * `for-each-ref` 在分支多的 repo（ragdoll-cat 有 104 條）要掃全部的 ref，`wipFiles`
 * 是一次 `git status`。翻一次頁重算一次、算完丟掉，純粹是浪費。
 */
export async function repoCommits(
  dir: string,
  opts: PageOpts = {}
): Promise<CommitPage | { error: string }> {
  const repo = await resolveRepo(dir);
  if (!repo) return { error: "不認得這個 repo（只能看工作區裡的）" };
  return commitPage(repo, await remotesOf(repo), opts);
}

/**
 * 一個 commit 動到的檔案（**照 VS Code：展開看的是檔案，不是訊息**，Jay 2026-09-16）。
 *
 * 訊息全文也一起回 —— 它不佔畫面（放在檔名列的 tooltip），但 km 的 commit 訊息
 * 常常把「為什麼」寫在 body 裡，整個不給會少一塊。
 */
export async function commitDetail(
  dir: string,
  sha: string
): Promise<{ message: string; files: ChangedFile[] } | { error: string }> {
  const repo = await resolveRepo(dir);
  if (!repo) return { error: "不認得這個 repo" };
  if (!/^[0-9a-f]{7,40}$/.test(sha)) return { error: "sha 格式不對" };
  const [msg, files] = await Promise.all([
    run("git", ["-C", repo, "log", "-1", "--format=%B", sha]),
    run("git", ["-C", repo, "show", "--name-status", "--format=", sha], { timeoutMs: 30_000 }),
  ]);
  return { message: msg.stdout.trimEnd(), files: parseNameStatus(files.stdout) };
}

// ─── 唯二會改到東西的兩個動作 ────────────────────────────────────────────────

/**
 * `git fetch --prune`。
 *
 * `--prune` 只清掉遠端已經不存在的**遠端追蹤 ref**，不會動到本地分支或工作區。
 * 不加 `--tags`：那會把一堆不相干的 tag 拉進來。
 */
/**
 * 移除一個 linked worktree（`git worktree remove`）。
 *
 * **這是這個頁面唯一會刪東西的動作**，所以守門比 fetch／push 嚴：
 *
 * 1. 只能刪 **linked worktree**。主 repo 不給刪 —— `git worktree remove` 對主工作區
 *    本來就會拒絕，但錯誤訊息不好懂，而且「按下去才發現不行」不是好體驗。
 * 2. **不給 `--force`**。git 在工作區有未提交改動或未追蹤檔案時會拒絕，那正是我們
 *    要的：`cross-repo-workflow.md` §4 講的就是「工作區的未 commit 改動不會留下」。
 *    要硬刪請自己去終端機下 `--force`，那是刻意的摩擦。
 * 3. 分支**不會**被刪掉。worktree 沒了，`git branch` 還看得到它，commit 也都還在。
 */
export async function removeWorktree(
  dir: string
): Promise<{ ok: boolean; summary: string; detail?: string }> {
  const abs = path.resolve(dir);
  if (!(await isKnownWorktree(abs))) return { ok: false, summary: "不認得這個工作區" };

  const main = await mainRepoOfLinkedWorktree(abs);
  if (!main) return { ok: false, summary: "這是主工作區，不能從這裡刪" };

  const r = await run("git", ["-C", main, "worktree", "remove", abs], { timeoutMs: 60_000 });
  if (r.code !== 0) {
    const raw = (r.stderr + "\n" + r.stdout).trim();
    // git 拒絕的理由多半是「有未提交的改動」——原文比我們重寫的訊息準確
    return { ok: false, summary: "刪不掉", detail: raw.slice(-500) };
  }
  // 順手清掉 .git/worktrees 底下的殘骸（目錄被手動刪過時會留下）
  await run("git", ["-C", main, "worktree", "prune"], { timeoutMs: 30_000 });
  return { ok: true, summary: `已移除 worktree（分支還在）` };
}

export async function fetchRepo(
  dir: string,
  remote?: string
): Promise<{ ok: boolean; summary: string; detail?: string }> {
  const repo = await resolveRepo(dir, { write: true });
  if (!repo) return { ok: false, summary: "不認得這個 repo" };
  const remotes = await remotesOf(repo);
  if (remote && !remotes.includes(remote)) {
    return { ok: false, summary: `沒有這個 remote：${remote}` };
  }
  const r = await run("git", ["-C", repo, "fetch", "--prune", ...(remote ? [remote] : ["--all"])], {
    timeoutMs: 180_000,
  });
  // fetch 把進度與結果都寫在 stderr，不是 stdout
  const raw = (r.stdout + "\n" + r.stderr).trim();
  if (r.code !== 0) return { ok: false, summary: "fetch 失敗", detail: raw.slice(-500) };

  // 更新的分支各抓到幾個新 commit —— 這才是「fetch 到什麼」真正想知道的事
  const changes = parseFetchOutput(raw);
  const ranges = changes.filter((c) => c.range).slice(0, 20);
  const counts: Record<string, number> = {};
  await mapLimit(ranges, CONCURRENCY, async (c) => {
    const n = await run("git", ["-C", repo, "rev-list", "--count", `${c.range!.from}..${c.range!.to}`]);
    if (n.code === 0) counts[c.ref] = Number(n.stdout.trim()) || 0;
  });

  const { text, detail } = describeFetch(changes, counts);
  return { ok: true, summary: text, detail };
}

/**
 * `git push <remote> <refspec>`。
 *
 * **判準在 `pushPlan`（有測試），這裡只負責執行**，而且只執行它給的 refspec：
 * 不 force、不刪除、不 `--set-upstream`、不推 tag。落後上游的分支在 `pushPlan`
 * 就會被擋下來 —— 真的要處理分歧是 CLI 的事。
 */
export async function pushBranch(
  dir: string,
  branchName: string
): Promise<{ ok: boolean; summary: string; detail?: string }> {
  const repo = await resolveRepo(dir, { write: true });
  if (!repo) return { ok: false, summary: "不認得這個 repo" };

  const detail = await repoDetail(repo, { limit: 1 });
  if ("error" in detail) return { ok: false, summary: detail.error };
  const branch = detail.branches.find((b) => b.name === branchName && !b.remote);
  if (!branch) return { ok: false, summary: `找不到本地分支 ${branchName}` };

  const plan = pushPlan(branch);
  if (!plan.ok || !plan.refspec || !plan.remote) return { ok: false, summary: plan.reason };

  const r = await run("git", ["-C", repo, "push", plan.remote, plan.refspec], {
    timeoutMs: 300_000,
  });
  const raw = (r.stdout + "\n" + r.stderr).trim();
  return r.code === 0
    ? { ok: true, summary: `${branch.ahead} 個 commit 已送到 ${plan.remote}` }
    // 失敗的原因**要原樣給**：被拒的理由（non-fast-forward、權限、hook）沒有摘要的餘地
    : { ok: false, summary: "push 失敗", detail: raw.slice(-800) };
}
