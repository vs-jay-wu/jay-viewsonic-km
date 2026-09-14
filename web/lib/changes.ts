import { readdir, readFile, mkdir, stat, writeFile } from "fs/promises";
import path from "path";
import { repoPath, repoRoot, run } from "@/lib/repo";
import {
  parseDiff, parseStatus,
  type ChangedFile, type DiffLine, type RepoChanges, type WorktreeChanges,
} from "@/lib/changesRules";

export type { RepoChanges, WorktreeChanges, ChangedFile, DiffLine };

const IGNORE_FILE = repoPath("data/local-state/changes-ignored.json");
/** 同時跑幾個 git —— 117 個 repo 循序跑要 2.6 秒，開併發後快得多 */
const CONCURRENCY = 12;
/** 單一檔案的 diff 上限，太大的只給前面這麼多 */
export const DIFF_MAX_BYTES = 400_000;
/** 二進位檔的判斷用：git 會直接把位元組吐出來 */
const NUL = String.fromCharCode(0);

// ─── 忽略清單 ────────────────────────────────────────────────────────────────

export async function readIgnored(): Promise<string[]> {
  const raw = await readFile(IGNORE_FILE, "utf8").catch(() => null);
  if (!raw) return [];
  try {
    const d = JSON.parse(raw) as { ignored?: string[] };
    return Array.isArray(d.ignored) ? d.ignored : [];
  } catch {
    return [];
  }
}

export async function toggleIgnored(repo: string): Promise<string[]> {
  const cur = await readIgnored();
  const next = cur.includes(repo) ? cur.filter((r) => r !== repo) : [...cur, repo];
  await mkdir(path.dirname(IGNORE_FILE), { recursive: true });
  await writeFile(IGNORE_FILE, JSON.stringify({ ignored: next }, null, 2) + "\n", "utf8");
  return next;
}

// ─── 找出所有工作區 ──────────────────────────────────────────────────────────

interface Workspace {
  /** 掃描的起點（**只有 localPath，不含 externalPath**） */
  roots: string[];
  /** 搬到外接硬碟的 repo 名 —— 一律不列（Jay 2026-09-14） */
  offloaded: Set<string>;
}

/**
 * 掃描範圍。
 *
 * **刻意只讀 `localPath`，不讀 `externalPath`**：外接上的是 offloaded 的 repo，
 * 那些東西不在手上做，列出來只是雜訊；而且外接的讀取慢得多，會把整個掃描拖垮。
 * 另外把 `offloaded` 清單也讀進來當保險 —— 萬一本機留了殘檔（搬移中斷之類），
 * 名字對得上就不列。實測目前 328 個 offloaded 在本機一個資料夾都沒留。
 */
async function workspace(): Promise<Workspace> {
  const raw = await readFile(repoPath("local.workspace.json"), "utf8").catch(() => null);
  const roots = new Set<string>([repoRoot()]); // km 自己也算
  const offloaded = new Set<string>();
  if (raw) {
    try {
      const ws = JSON.parse(raw) as {
        orgs?: Record<string, { localPath?: string; offloaded?: string[] }>;
      };
      for (const o of Object.values(ws.orgs ?? {})) {
        if (o.localPath) roots.add(o.localPath);
        for (const name of o.offloaded ?? []) offloaded.add(name);
      }
    } catch {
      /* 壞掉就只掃 km */
    }
  }
  return { roots: [...roots], offloaded };
}

/** 有沒有 `.git`（**檔案或目錄都算** —— worktree 的 .git 是檔案，用 `-d` 判斷會整批漏掉） */
async function looksLikeRepo(dir: string): Promise<boolean> {
  return stat(path.join(dir, ".git")).then(() => true, () => false);
}

interface WorktreeInfo {
  path: string;
  branch: string | null;
}

/**
 * 問 git 這個 repo 有哪些 worktree。
 *
 * **一定要問 git，不能只掃資料夾**：sibling worktree 的 `.git` 是檔案（掃 `-d` 會漏），
 * 而 session 綁的 worktree 在 `<repo>/.claude/worktrees/<name>`、藏在 repo 裡面，
 * 頂層掃描根本看不到。實測 mvbf 有 9 個 worktree，其中 4 個有未提交改動，
 * 而那 4 個在只掃資料夾的版本裡一個都沒出現。
 */
async function worktreesOf(dir: string): Promise<WorktreeInfo[]> {
  const { stdout, code } = await run("git", ["-C", dir, "worktree", "list", "--porcelain"], {
    timeoutMs: 20_000,
  });
  if (code !== 0) return [{ path: dir, branch: null }];
  const out: WorktreeInfo[] = [];
  let cur: WorktreeInfo | null = null;
  for (const line of stdout.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (cur) out.push(cur);
      cur = { path: line.slice(9).trim(), branch: null };
    } else if (line.startsWith("branch ") && cur) {
      cur.branch = line.slice(7).trim().replace(/^refs\/heads\//, "");
    } else if (line.startsWith("detached") && cur) {
      cur.branch = "(detached)";
    }
  }
  if (cur) out.push(cur);
  return out.length ? out : [{ path: dir, branch: null }];
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    })
  );
  return out;
}

async function statusOf(worktree: string): Promise<ChangedFile[]> {
  const { stdout, code } = await run(
    "git",
    ["-C", worktree, "status", "--porcelain=v1", "--untracked-files=all"],
    { timeoutMs: 60_000 }
  );
  if (code !== 0) return [];
  const files = parseStatus(stdout);
  if (!files.some((f) => f.kind === "modified")) return files;

  // 找出「真的有內容差異」的檔。
  //
  // ⚠️ `git diff --numstat` **也會列出純模式改變的檔**，只是新增／刪除都是 `0`
  //（一開始以為它會省略，結果 maine-coon-cat 的 1239 個 chmod 全部被當成真改動）。
  // 所以要看的是前兩欄而不是「有沒有出現」。二進位檔是 `-  -`，那是真的有改。
  const { stdout: numstat } = await run(
    "git",
    ["-C", worktree, "diff", "--numstat", "HEAD"],
    { timeoutMs: 60_000 }
  );
  const withContent = new Set<string>();
  for (const line of numstat.split("\n")) {
    const [added, deleted, file] = line.split("\t");
    if (!file) continue;
    if (added === "0" && deleted === "0") continue;
    withContent.add(file.trim());
  }
  return files.map((f) =>
    f.kind === "modified" && !withContent.has(f.path) ? { ...f, modeOnly: true } : f
  );
}

export interface ChangesSnapshot {
  scannedAt: string;
  /** 掃了幾個工作區（含 worktree） */
  scanned: number;
  repos: RepoChanges[];
  ignored: string[];
  /** 被忽略的 repo 底下有幾個改動（只給數字，不列內容） */
  ignoredChanges: number;
  /** 因為是 offloaded（搬到外接）而跳過的資料夾數 */
  skippedOffloaded: number;
}

export async function scanChanges(): Promise<ChangesSnapshot> {
  const { roots, offloaded } = await workspace();
  const repoDirs: string[] = [];
  let skippedOffloaded = 0;
  for (const root of roots) {
    if (await looksLikeRepo(root)) repoDirs.push(root);
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith(".")) continue;
      if (offloaded.has(e.name)) {
        skippedOffloaded++;
        continue;
      }
      const dir = path.join(root, e.name);
      if (await looksLikeRepo(dir)) repoDirs.push(dir);
    }
  }

  const groups = await mapLimit(repoDirs, CONCURRENCY, async (dir) => ({
    dir,
    worktrees: await worktreesOf(dir),
  }));

  // sibling worktree 會被「自己」與「主 repo」各找到一次，用主工作區的路徑去重
  const seen = new Set<string>();
  const byRepo = new Map<string, WorktreeInfo[]>();
  for (const { dir, worktrees } of groups) {
    const main = worktrees[0]?.path ?? dir;
    if (seen.has(main)) continue;
    seen.add(main);
    const list: WorktreeInfo[] = [];
    for (const w of worktrees) {
      if (w.path !== main) seen.add(w.path);
      list.push(w);
    }
    byRepo.set(main, list);
  }

  const ignored = await readIgnored();
  const flat = [...byRepo.entries()].flatMap(([main, list]) => list.map((w) => ({ main, w })));
  const statuses = await mapLimit(flat, CONCURRENCY, async ({ main, w }) => ({
    main,
    w,
    files: await statusOf(w.path),
  }));

  const repos = new Map<string, RepoChanges>();
  let ignoredChanges = 0;
  for (const { main, w, files } of statuses) {
    if (!files.length) continue;
    const repo = path.basename(main);
    if (ignored.includes(repo)) {
      ignoredChanges += files.length;
      continue;
    }
    const entry = repos.get(repo) ?? { repo, worktrees: [], total: 0 };
    entry.worktrees.push({
      path: w.path,
      name: path.basename(w.path),
      branch: w.branch,
      isMain: w.path === main,
      isSessionBound: w.path.includes("/.claude/worktrees/"),
      files,
    });
    entry.total += files.length;
    repos.set(repo, entry);
  }

  for (const r of repos.values()) {
    r.worktrees.sort((a, b) =>
      a.isMain === b.isMain ? a.name.localeCompare(b.name) : a.isMain ? -1 : 1
    );
  }

  return {
    scannedAt: new Date().toISOString(),
    scanned: flat.length,
    repos: [...repos.values()].sort((a, b) => b.total - a.total),
    ignored,
    ignoredChanges,
    skippedOffloaded,
  };
}

// ─── 單一檔案的 diff ─────────────────────────────────────────────────────────

export interface FileDiff {
  worktree: string;
  file: string;
  lines: DiffLine[];
  /** 超過上限被截斷 */
  truncated: boolean;
  binary: boolean;
  error?: string;
}

/**
 * 取一個檔案的 diff。
 *
 * `worktree` 一定要是**掃描結果裡出現過的路徑**（呼叫端負責驗），這裡再擋一次
 * 路徑逃逸：檔案得在那個 worktree 底下。未追蹤的檔案 `git diff` 看不到，
 * 要用 `--no-index` 跟 /dev/null 比，才會整份當成新增顯示。
 */
export async function fileDiff(
  worktree: string,
  file: string,
  opts: { untracked?: boolean } = {}
): Promise<FileDiff> {
  const abs = path.resolve(worktree, file);
  if (abs !== worktree && !abs.startsWith(worktree + path.sep)) {
    return {
      worktree, file, lines: [], truncated: false, binary: false,
      error: "路徑不在這個工作區底下",
    };
  }

  const args = opts.untracked
    ? ["-C", worktree, "diff", "--no-index", "--no-color", "--", "/dev/null", file]
    : ["-C", worktree, "diff", "HEAD", "--no-color", "--", file];
  const { stdout, stderr, code } = await run("git", args, { timeoutMs: 30_000 });
  // `--no-index` 有差異時回 1，那是正常的
  if (code !== 0 && code !== 1 && !stdout) {
    return {
      worktree, file, lines: [], truncated: false, binary: false,
      error: stderr.trim().slice(0, 300),
    };
  }
  if (/^Binary files /m.test(stdout) || stdout.includes(NUL)) {
    return { worktree, file, lines: [], truncated: false, binary: true };
  }
  const truncated = stdout.length > DIFF_MAX_BYTES;
  return {
    worktree,
    file,
    lines: parseDiff(truncated ? stdout.slice(0, DIFF_MAX_BYTES) : stdout),
    truncated,
    binary: false,
  };
}
