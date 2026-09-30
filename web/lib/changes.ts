import { spawn } from "child_process";
import { readdir, readFile, mkdir, stat, writeFile } from "fs/promises";
import path from "path";
import { repoPath, repoRoot, run } from "@/lib/repo";
import { cacheState, canServeCached, shouldRescan } from "@/lib/repoCacheRules";
import { isSensitivePath } from "@/lib/codeBrowseRules";
import {
  isAdaptiveIconXml, isVectorDrawableXml, looksLikeAndroidDrawable,
} from "@/lib/vectorDrawableRules";
import { vectorDrawableSvg } from "@/lib/androidRes";
import {
  imageMimeOf, parseDiff, parseStatus, sortRepos,
  type ChangedFile, type DiffLine, type RepoChanges, type WorktreeChanges,
} from "@/lib/changesRules";

export type { RepoChanges, WorktreeChanges, ChangedFile, DiffLine };

const PIN_FILE = repoPath("data/local-state/changes-pinned.json");
/** 同時跑幾個 git —— 117 個 repo 循序跑要 2.6 秒，開併發後快得多 */
const CONCURRENCY = 12;
/** 單一檔案的 diff 上限，太大的只給前面這麼多 */
export const DIFF_MAX_BYTES = 400_000;
/** 二進位檔的判斷用：git 會直接把位元組吐出來 */
const NUL = String.fromCharCode(0);

// ─── pin 住的 repo ───────────────────────────────────────────────────────────

/**
 * pin 住的 repo 名（`/git` 那頁存的是目錄路徑，這頁的單位是 repo 名 ——
 * 同一個 repo 的多個 worktree 在這頁本來就收在同一組底下）。
 *
 * **只影響排序**，不會讓任何 repo 從清單上消失。
 */
export async function readPinned(): Promise<string[]> {
  const raw = await readFile(PIN_FILE, "utf8").catch(() => null);
  if (!raw) return [];
  try {
    const d = JSON.parse(raw) as { pinned?: string[] };
    return Array.isArray(d.pinned) ? d.pinned : [];
  } catch {
    return [];
  }
}

export async function togglePinned(repo: string): Promise<string[]> {
  const cur = await readPinned();
  const next = cur.includes(repo) ? cur.filter((r) => r !== repo) : [...cur, repo];
  await mkdir(path.dirname(PIN_FILE), { recursive: true });
  await writeFile(PIN_FILE, JSON.stringify({ pinned: next }, null, 2) + "\n", "utf8");
  return next;
}

// ─── 找出所有工作區 ──────────────────────────────────────────────────────────

export interface Workspace {
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
export async function workspace(): Promise<Workspace> {
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

export interface WorktreeInfo {
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
export async function worktreesOf(dir: string): Promise<WorktreeInfo[]> {
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

export async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
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

/**
 * 找出「只改了檔案模式、內容一個字都沒動」的檔。
 *
 * 三個訊號合起來才準（前兩版都錯過，原因記在這裡）：
 *
 * 1. `git diff --summary` 列出所有 mode change —— 但它**不代表內容沒變**，
 *    一個檔可以同時改模式又改內容。
 * 2. `git diff --numstat` 會**連純模式改變也列出來，只是增刪都是 `0`**
 *    （第一版以為它會省略，結果 maine-coon-cat 的 1239 個 chmod 全被當成真改動）。
 * 3. 二進位檔在 numstat 是 `-  -`，**看不出有沒有改內容**（第二版因此把 17 個
 *    只改模式的音效／圖示當成真改動）。這些只能直接比 blob：工作區檔案的
 *    `git hash-object` 對上 `git ls-tree HEAD` 的 sha，一樣就是純模式。
 */
async function modeOnlyPaths(worktree: string, modified: string[]): Promise<Set<string>> {
  if (!modified.length) return new Set();

  const [summaryRes, numstatRes] = await Promise.all([
    run("git", ["-C", worktree, "diff", "--summary", "HEAD"], { timeoutMs: 60_000 }),
    run("git", ["-C", worktree, "diff", "--numstat", "HEAD"], { timeoutMs: 60_000 }),
  ]);

  const modeChanged = new Set<string>();
  for (const line of summaryRes.stdout.split("\n")) {
    const m = /^\s*mode change \d+ => \d+ (.+)$/.exec(line);
    if (m) modeChanged.add(m[1].trim());
  }
  if (!modeChanged.size) return new Set();

  const withContent = new Set<string>();
  const binary: string[] = [];
  for (const line of numstatRes.stdout.split("\n")) {
    const [added, deleted, file] = line.split("\t");
    if (!file) continue;
    const rel = file.trim();
    if (added === "-" && deleted === "-") binary.push(rel);
    else if (added !== "0" || deleted !== "0") withContent.add(rel);
  }

  // 二進位檔只能比 blob。只比「有 mode change 的那些」，通常是個位數到幾十個。
  const candidates = binary.filter((rel) => modeChanged.has(rel));
  if (candidates.length) {
    const [hashRes, treeRes] = await Promise.all([
      run("git", ["-C", worktree, "hash-object", "--", ...candidates], { timeoutMs: 120_000 }),
      run("git", ["-C", worktree, "ls-tree", "HEAD", "--", ...candidates], { timeoutMs: 60_000 }),
    ]);
    const headBlob = new Map<string, string>();
    for (const line of treeRes.stdout.split("\n")) {
      const m = /^\d+ blob ([0-9a-f]+)\s+(.+)$/.exec(line);
      if (m) headBlob.set(m[2].trim().replace(/^"|"$/g, ""), m[1]);
    }
    const hashes = hashRes.stdout.split("\n").map((h) => h.trim()).filter(Boolean);
    candidates.forEach((rel, i) => {
      const worktreeHash = hashes[i];
      // 比不出來（hash-object 失敗之類）就當成有內容改動，寧可多顯示不要少顯示
      if (!worktreeHash || headBlob.get(rel) !== worktreeHash) withContent.add(rel);
    });
  }

  return new Set(modified.filter((rel) => modeChanged.has(rel) && !withContent.has(rel)));
}

export async function statusOf(worktree: string): Promise<ChangedFile[]> {
  const { stdout, code } = await run(
    "git",
    ["-C", worktree, "status", "--porcelain=v1", "--untracked-files=all"],
    { timeoutMs: 60_000 }
  );
  if (code !== 0) return [];
  const files = parseStatus(stdout);
  const modified = files.filter((f) => f.kind === "modified").map((f) => f.path);
  if (!modified.length) return files;

  const modeOnly = await modeOnlyPaths(worktree, modified);
  return files.map((f) => (modeOnly.has(f.path) ? { ...f, modeOnly: true } : f));
}

export interface ChangesSnapshot {
  scannedAt: string;
  /** 掃了幾個工作區（含 worktree） */
  scanned: number;
  repos: RepoChanges[];
  /** pin 住的 repo 名（含目前沒有改動、所以沒出現在 `repos` 裡的） */
  pinned: string[];
  /** 因為是 offloaded（搬到外接）而跳過的資料夾數 */
  skippedOffloaded: number;
}

/**
 * 工作區裡所有的 repo 目錄（不含 offloaded 的）。
 *
 * 「未提交的改動」與「Repo 檢視」共用同一份範圍定義 —— 兩邊各掃各的話，
 * 一邊看得到、另一邊看不到某個 repo，會很難解釋。
 */
export async function listRepoDirs(): Promise<{ dirs: string[]; skippedOffloaded: number }> {
  const { roots, offloaded } = await workspace();
  const dirs: string[] = [];
  let skippedOffloaded = 0;
  for (const root of roots) {
    if (await looksLikeRepo(root)) dirs.push(root);
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith(".")) continue;
      if (offloaded.has(e.name)) {
        skippedOffloaded++;
        continue;
      }
      const dir = path.join(root, e.name);
      if (await looksLikeRepo(dir)) dirs.push(dir);
    }
  }
  return { dirs, skippedOffloaded };
}

export async function scanChanges(): Promise<ChangesSnapshot> {
  const { dirs: repoDirs, skippedOffloaded } = await listRepoDirs();

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

  const pinned = await readPinned();
  const flat = [...byRepo.entries()].flatMap(([main, list]) => list.map((w) => ({ main, w })));
  const statuses = await mapLimit(flat, CONCURRENCY, async ({ main, w }) => ({
    main,
    w,
    files: await statusOf(w.path),
  }));

  const repos = new Map<string, RepoChanges>();
  for (const { main, w, files } of statuses) {
    if (!files.length) continue;
    const repo = path.basename(main);
    const entry = repos.get(repo) ?? { repo, worktrees: [], total: 0, pinned: pinned.includes(repo) };
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
    repos: sortRepos([...repos.values()]),
    pinned,
    skippedOffloaded,
  };
}

/**
 * 這個路徑是不是工作區裡的 git 工作區。
 *
 * 給 diff／blob API 用的**輕量**驗證。原本是「重跑一次完整掃描再比對」，但掃描為了
 * 判斷 modeOnly 多了好幾個 git 呼叫之後，每點一個檔案就要等好幾秒。
 *
 * 兩條都算數：
 *
 * 1. **路徑就在工作區根目錄底下**，而且那裡真的有 `.git`。
 * 2. **linked worktree 放在工作區外面，但 gitdir 指回工作區裡的 repo**。
 *    `git worktree add` 的目錄可以在任何地方 —— 實際踩到的是
 *    `~/.mvb-worktrees/poc-desktop-mode`（主 repo 在 `Orgs/…/edu-mvb-mac-playground`）：
 *    掃描列得出來（它是從主 repo 的 `git worktree list` 來的），但點下去 403
 *    「不認得這個工作區」。判斷的依據是 gitdir，不是路徑長相。
 */
export async function isKnownWorktree(candidate: string): Promise<boolean> {
  const abs = path.resolve(candidate);
  const { roots } = await workspace();
  const inRoots = (p: string) =>
    roots.some((r) => p === path.resolve(r) || p.startsWith(path.resolve(r) + path.sep));

  if (inRoots(abs)) return looksLikeRepo(abs);

  const main = await mainRepoOfLinkedWorktree(abs);
  return main !== null && inRoots(main);
}

/**
 * linked worktree 的主 repo 路徑；不是 linked worktree 就回 null。
 *
 * worktree 的 `.git` 是**檔案**，內容是
 * `gitdir: <主 repo>/.git/worktrees/<名字>`。
 */
export async function mainRepoOfLinkedWorktree(dir: string): Promise<string | null> {
  const raw = await readFile(path.join(dir, ".git"), "utf8").catch(() => null);
  const m = raw && /^gitdir:\s*(.+)$/m.exec(raw.trim());
  if (!m) return null;
  const gitdir = path.resolve(dir, m[1].trim());
  const marker = `${path.sep}.git${path.sep}worktrees${path.sep}`;
  const at = gitdir.indexOf(marker);
  if (at === -1) return null;
  return gitdir.slice(0, at);
}

// ─── 單一檔案的 diff ─────────────────────────────────────────────────────────

export interface ImageSides {
  mime: string;
  /** HEAD 裡那張的位元組數；沒有舊版（新增／未追蹤）就是 null */
  oldBytes: number | null;
  /** 工作區那張的位元組數；已刪除就是 null */
  newBytes: number | null;
  /** 舊版在 HEAD 裡的路徑（改名時跟現在的不一樣） */
  oldPath: string;
  /** 舊版要從哪個 revision 取（看整條線時是 merge-base；看單一 commit 時是 `<sha>^`） */
  oldRev: string;
  /** 新版要從哪個 revision 取；null＝工作區現在的檔案 */
  newRev: string | null;
}

export interface FileDiff {
  worktree: string;
  file: string;
  lines: DiffLine[];
  /** 超過上限被截斷 */
  truncated: boolean;
  binary: boolean;
  /** 是圖片才有 —— 前端改用 2-up／滑桿／洋蔥皮比對，不畫 unified diff */
  image?: ImageSides;
  error?: string;
}

/** 單張圖的上限。超過就不給看（瀏覽器也扛不住，而且那多半是誤放的產物） */
export const IMAGE_MAX_BYTES = 25 * 1024 * 1024;

/**
 * 快照的快取。判準沿用 `lib/repoCacheRules.ts`（有測試），這裡只管狀態。
 *
 * **為什麼要快取**：全掃 159 個 repo 要 **3 秒**，而且那 3 秒**不是傳輸也不是
 * Next** —— 純 node 跑同一批 git 指令是 2.95 秒，把並行度從 12 拉到 48 也沒有變快
 * （2026-09-30 實測）。成本是「159 個 repo × 每個 25–50ms」的長尾，沒有熱點可以修。
 * 所以唯一能做的是**不要在開頁時掃**。
 *
 * 策略與 repo 清單那份相同：stale-while-revalidate。另外多一層 ——
 * **快照寫到磁碟**，dev server 重開之後第一次開頁也不必等 3 秒。
 */
const SNAPSHOT_FILE = repoPath("data/local-state/changes-snapshot.json");
/** 幾秒內算新鮮。掃一次 3 秒，排程每 30 秒預熱一次，所以這個值取 45 秒 */
export const CHANGES_CACHE_TTL_MS = 45_000;

interface ChangesCache {
  data: ChangesSnapshot | null;
  computedAt: number | null;
  inflight: Promise<ChangesSnapshot> | null;
  /** 最後一次有人問這份資料（排程用它決定要不要繼續預熱） */
  lastAskedAt: number | null;
  loadedFromDisk: boolean;
}

// 狀態掛在 globalThis：dev 的 HMR 會重載模組，掛模組變數上每次存檔就清空
const cg = globalThis as typeof globalThis & { __kmChangesCache?: ChangesCache };
const changesCache: ChangesCache = (cg.__kmChangesCache ??= {
  data: null, computedAt: null, inflight: null, lastAskedAt: null, loadedFromDisk: false,
});

async function loadSnapshotFromDisk(): Promise<void> {
  if (changesCache.loadedFromDisk) return;
  changesCache.loadedFromDisk = true;
  const raw = await readFile(SNAPSHOT_FILE, "utf8").catch(() => null);
  if (!raw) return;
  try {
    const saved = JSON.parse(raw) as { computedAt: number; snapshot: ChangesSnapshot };
    // 已經有更新的了就不要用磁碟上那份蓋掉
    if (saved.snapshot && (changesCache.computedAt ?? 0) < saved.computedAt) {
      changesCache.data = saved.snapshot;
      changesCache.computedAt = saved.computedAt;
    }
  } catch {
    /* 檔壞了就當沒有，下一次掃完會蓋回去 */
  }
}

function rescanChanges(): Promise<ChangesSnapshot> {
  changesCache.inflight ??= scanChanges()
    .then(async (d) => {
      changesCache.data = d;
      changesCache.computedAt = Date.now();
      await mkdir(path.dirname(SNAPSHOT_FILE), { recursive: true }).catch(() => undefined);
      await writeFile(
        SNAPSHOT_FILE,
        JSON.stringify({ computedAt: changesCache.computedAt, snapshot: d }),
        "utf8"
      ).catch(() => undefined);
      return d;
    })
    .finally(() => {
      changesCache.inflight = null;
    });
  return changesCache.inflight;
}

/**
 * 快取版。`force` 會等新的掃完才回 —— 「重新掃描」按鈕與「指紋變了」那條路用它。
 *
 * 回傳多兩個欄位讓畫面知道手上這份多舊：`computedAt`（ISO）與 `stale`。
 */
export async function scanChangesCached(
  force = false
): Promise<ChangesSnapshot & { computedAt: string | null; stale: boolean }> {
  changesCache.lastAskedAt = Date.now();
  await loadSnapshotFromDisk();
  // 掛在這裡而不是只掛在排程上：dev 模式下改 `instrumentation.ts` 不會重跑
  // `register()`，只靠排程的話要等下次重開 server 才生效（實測踩到）
  void warmUntrackedCache().catch(() => undefined);

  const state = cacheState(changesCache.computedAt, Date.now(), CHANGES_CACHE_TTL_MS);
  const serveCached = canServeCached(state, force) && changesCache.data !== null;

  if (shouldRescan(state, force)) {
    const p = rescanChanges();
    // 背景重掃的失敗不能變成未處理的 rejection —— 這次已經用舊資料回應了
    if (serveCached) p.catch(() => undefined);
    else await p;
  }

  const data = changesCache.data as ChangesSnapshot;
  return {
    ...data,
    computedAt: changesCache.computedAt ? new Date(changesCache.computedAt).toISOString() : null,
    stale: state !== "fresh" && serveCached,
  };
}

/** 排程用：最近有人看過這頁嗎（沒人看就不必一直預熱） */
export function changesAskedWithin(ms: number): boolean {
  return changesCache.lastAskedAt !== null && Date.now() - changesCache.lastAskedAt < ms;
}

/**
 * 替每個 repo 打開 `core.untrackedCache`。
 *
 * git 自己的未追蹤檔快取，實測**每個 repo 的 `git status` 快一倍**
 * （0.028→0.014、0.025→0.012…，2026-09-30 抽 5 個量的）。掃描裡有三分之一的
 * 成本是在走未追蹤檔（`-uno` 實測 2.62s→1.76s），所以這條是免費的一刀。
 *
 * **一個 process 只做一次**：`git config` 本身也要開一個行程，每次掃都做等於
 * 多付 159 次 spawn。設定寫在各 repo 的 `.git/config`（本機檔，不會進版控，
 * 團隊不受影響）。
 */
export async function warmUntrackedCache(): Promise<number> {
  const cw = globalThis as typeof globalThis & { __kmUntrackedCacheDone?: boolean };
  if (cw.__kmUntrackedCacheDone) return 0;
  cw.__kmUntrackedCacheDone = true;
  const { dirs } = await listRepoDirs();
  let n = 0;
  await mapLimit(dirs, CONCURRENCY, async (dir) => {
    const r = await run("git", ["-C", dir, "config", "core.untrackedCache", "true"]);
    if (r.code === 0) n++;
  });
  return n;
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
  opts: {
    untracked?: boolean; oldPath?: string; base?: string; sha?: string;
    /**
     * VS Code 那種「Staged Changes／Changes」兩區塊要看的是不同的差異：
     *   index     HEAD → 索引（`git diff --cached`）＝ commit 下去會帶走的
     *   worktree  索引 → 工作區（`git diff`）＝ commit **不會**帶走的
     * 不給就是舊行為（HEAD → 工作區，兩者合在一起）。
     */
    side?: "index" | "worktree";
  } = {}
): Promise<FileDiff> {
  const abs = path.resolve(worktree, file);
  if (abs !== worktree && !abs.startsWith(worktree + path.sep)) {
    return {
      worktree, file, lines: [], truncated: false, binary: false,
      error: "路徑不在這個工作區底下",
    };
  }

  // 四種來源：
  //   sha       單一 commit 動到這個檔案的部分（`git show`）
  //   base      base → **工作區** 的整體差異（commit 過的與還沒 commit 的一起算）
  //   untracked 還沒被 git 追蹤的，`git diff` 看不到，要跟 /dev/null 比
  //   （預設）  HEAD → 工作區，也就是「未提交的改動」那頁在看的東西
  const args = opts.sha
    ? ["-C", worktree, "show", "--no-color", "--format=", opts.sha, "--", file]
    : opts.untracked
      ? ["-C", worktree, "diff", "--no-index", "--no-color", "--", "/dev/null", file]
      : opts.side === "index"
        ? ["-C", worktree, "diff", "--cached", "--no-color", "--", file]
        : opts.side === "worktree"
          ? ["-C", worktree, "diff", "--no-color", "--", file]
          : ["-C", worktree, "diff", opts.base ?? "HEAD", "--no-color", "--", file];
  const { stdout, stderr, code } = await run("git", args, { timeoutMs: 30_000 });
  // `--no-index` 有差異時回 1，那是正常的
  if (code !== 0 && code !== 1 && !stdout) {
    return {
      worktree, file, lines: [], truncated: false, binary: false,
      error: stderr.trim().slice(0, 300),
    };
  }
  // 看單一 commit 時，兩側都要從 git 取：舊＝`<sha>^`、新＝`<sha>`。
  // 只換舊側是錯的 —— 新側若讀工作區，看到的會是「現在」而不是那個 commit 當時
  // 圖片：`side: "worktree"` 的舊側是**索引**（空字串 rev ＝ git 的 `:<path>`）。
  // `side: "index"` 的新側其實該是索引、這裡仍讀工作區的檔 —— 只有「圖片 staged
  // 之後又被改過」才會不一致，先不處理（文字 diff 那側是對的）。
  const image = await imageSides(
    worktree,
    abs,
    file,
    opts.oldPath ?? file,
    opts.sha ? `${opts.sha}^` : opts.side === "worktree" ? "" : opts.base ?? "HEAD",
    opts.sha ?? null
  );
  if (/^Binary files /m.test(stdout) || stdout.includes(NUL)) {
    return { worktree, file, lines: [], truncated: false, binary: true, image };
  }
  const truncated = stdout.length > DIFF_MAX_BYTES;
  return {
    worktree,
    file,
    lines: parseDiff(truncated ? stdout.slice(0, DIFF_MAX_BYTES) : stdout),
    truncated,
    binary: false,
    image,
  };
}

/**
 * 圖片兩側的大小。**不在這裡讀內容**，只問大小 —— 內容由 `/api/changes/blob`
 * 直接串給 `<img>`，不必經過 JSON（base64 會胖三分之一，而且大圖會塞爆回應）。
 *
 * SVG 是文字檔，所以 `binary` 會是 false、unified diff 也讀得到 —— 兩種都給，
 * 前端多一個「原始碼」分頁。
 */
async function imageSides(
  worktree: string,
  abs: string,
  file: string,
  oldPath: string,
  rev: string,
  newRev: string | null
): Promise<ImageSides | undefined> {
  /*
   * Android 的 `<vector>` 也當圖片看（轉成 SVG 之後就能用同一套 2-up／滑桿／洋蔥皮）。
   *
   * **要看內容才算數**：`res/drawable/` 底下同樣是 `.xml` 的還有 `<shape>`、
   * `<selector>`、`<layer-list>`（ragdoll-cat 實測 569 個檔裡有 292 個不是 vector），
   * 只看副檔名會給它們一個永遠畫不出東西的圖片檢視。
   */
  const mime = imageMimeOf(file) ?? (await vectorMime(worktree, abs, file, oldPath, rev, newRev));
  if (!mime) return undefined;
  const newBytes = newRev
    ? await gitBlobSize(worktree, newRev, file)
    : await stat(abs).then((s) => s.size, () => null);
  // `cat-file -s` 只讀 object header，不會把整個 blob 解出來
  const oldBytes = await gitBlobSize(worktree, rev, oldPath);
  if (oldBytes === null && newBytes === null) return undefined;
  return { mime, oldBytes, newBytes, oldPath, oldRev: rev, newRev };
}

/**
 * 這個 `.xml` 是不是 VectorDrawable。新側看不到（刪除）就看舊側 ——
 * 兩側都沒有才回 undefined。
 */
async function vectorMime(
  worktree: string,
  abs: string,
  file: string,
  oldPath: string,
  rev: string,
  newRev: string | null
): Promise<string | undefined> {
  if (!looksLikeAndroidDrawable(file)) return undefined;
  const text =
    (await readTextAt(worktree, abs, file, newRev)) ?? (await readTextAt(worktree, abs, oldPath, rev));
  return text && (isVectorDrawableXml(text) || isAdaptiveIconXml(text)) ? "image/svg+xml" : undefined;
}

/** `rev` 是 null／空字串就讀工作區的檔，否則從 git 取 */
async function readTextAt(
  worktree: string,
  abs: string,
  file: string,
  rev: string | null
): Promise<string | null> {
  if (!rev) return readFile(abs, "utf8").catch(() => null);
  const r = await run("git", ["-C", worktree, "cat-file", "blob", `${rev}:${file}`]);
  return r.code === 0 ? r.stdout : null;
}

/** `cat-file -s` 只讀 object header，不會把整個 blob 解出來。不存在就回 null */
async function gitBlobSize(worktree: string, rev: string, file: string): Promise<number | null> {
  const r = await run("git", ["-C", worktree, "cat-file", "-s", `${rev}:${file}`]);
  return r.code === 0 && /^\d+$/.test(r.stdout.trim()) ? Number(r.stdout.trim()) : null;
}

/**
 * 讀出圖片的位元組，給 `/api/changes/blob` 直接串給瀏覽器。
 *
 * `side: "old"` 走 `git cat-file blob HEAD:<path>`（改名時 path 是舊的那個），
 * `"new"` 直接讀工作區的檔。路徑逃逸在這裡擋（呼叫端另外驗 worktree）。
 */
export async function readImageBlob(
  worktree: string,
  file: string,
  side: "old" | "new",
  /**
   * 要拿哪個版本。舊側預設 HEAD（看整條線時是 merge-base）；
   * **新側空字串＝讀工作區現在的檔案**，給了 revision 就從 git 取（看單一 commit 時）
   */
  rev = "HEAD"
): Promise<{ data: Buffer; mime: string } | { error: string; status: number }> {
  const mime = imageMimeOf(file);
  const abs = path.resolve(worktree, file);
  if (!abs.startsWith(worktree + path.sep)) return { error: "路徑不在這個工作區底下", status: 403 };

  // Android 的 VectorDrawable：轉成 SVG 再串出去，`<img>` 才畫得出來。
  // 尺寸要寫成 dp（`intrinsic`）—— 沒有內建尺寸的 SVG 在 Chrome 量到的是 300×150，
  // 兩側共用的縮放比就會算錯（見 ImageDiffView 檔頭）
  if (!mime && looksLikeAndroidDrawable(file)) {
    const xml = await readTextAt(worktree, abs, file, side === "new" && (!rev || rev === "HEAD") ? null : rev);
    if (xml === null) return { error: "讀不到這個檔案", status: 404 };
    const svg = await vectorDrawableSvg(worktree, file, xml);
    if (!svg) return { error: "這個 drawable 不是 <vector>／<adaptive-icon>，沒有預覽", status: 415 };
    return { data: Buffer.from(svg, "utf8"), mime: "image/svg+xml" };
  }
  if (!mime) return { error: "不是認得的圖片格式", status: 400 };

  if (side === "new" && (!rev || rev === "HEAD")) {
    const st = await stat(abs).catch(() => null);
    if (!st) return { error: "工作區沒有這個檔案", status: 404 };
    if (st.size > IMAGE_MAX_BYTES) return { error: "圖片太大，不顯示", status: 413 };
    return { data: await readFile(abs), mime };
  }

  const size = await run("git", ["-C", worktree, "cat-file", "-s", `${rev}:${file}`]);
  if (size.code !== 0) return { error: `${rev} 裡沒有這個檔案`, status: 404 };
  if (Number(size.stdout.trim()) > IMAGE_MAX_BYTES) return { error: "圖片太大，不顯示", status: 413 };
  const data = await runBinary("git", ["-C", worktree, "cat-file", "blob", `${rev}:${file}`]);
  if (!data) return { error: `讀不到 ${rev} 的版本`, status: 404 };
  return { data, mime };
}

/** `lib/repo.ts` 的 `run` 回字串，圖片不能那樣讀（會被當 UTF-8 毀掉），所以自己收 Buffer */
function runBinary(cmd: string, args: string[]): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args);
    const chunks: Buffer[] = [];
    let bytes = 0;
    child.stdout.on("data", (c: Buffer) => {
      bytes += c.length;
      if (bytes > IMAGE_MAX_BYTES) child.kill();
      else chunks.push(c);
    });
    child.on("error", () => resolve(null));
    child.on("close", (code) => resolve(code === 0 && bytes <= IMAGE_MAX_BYTES ? Buffer.concat(chunks) : null));
  });
}

// ─── 讀檔案的某一段（diff 的「展開更多上下文」用） ───────────────────────────

export interface FileLines {
  /** 這一段的內容，一行一個元素 */
  lines: string[];
  from: number;
  to: number;
  /** 整份檔案共幾行 —— 前端靠它知道「已經到檔尾了」 */
  total: number;
}

/**
 * 讀一個檔案的第 from..to 行（1-based，含頭含尾）。
 *
 * `rev` 空字串＝讀工作區現在的檔案，`":"` ＝**索引裡那一版**（git 自己的
 * `:<path>` 寫法），其餘 `git show <rev>:<path>`。
 *
 * 索引那一版是給「Staged Changes」區塊的展開用的：那邊的 diff 是 HEAD → 索引，
 * 行號指的是索引的內容。部分 staged 的檔案（`MM`）工作區跟索引不一樣，
 * 拿工作區的行去補會**安靜地補錯行**。
 *
 * **機敏檔案在這裡也要擋**：diff 本來就不會帶它們的內容進來，但展開是另一條
 * 讀取路徑，漏掉就等於開了一個後門（sensitive-files.md）。
 */
export async function readFileLines(
  worktree: string,
  file: string,
  rev: string,
  range: { from: number; to: number | null }
): Promise<FileLines | { error: string }> {
  const abs = path.resolve(worktree, file);
  if (!abs.startsWith(worktree + path.sep)) return { error: "路徑不在這個工作區底下" };
  if (isSensitivePath(file)) return { error: "機敏檔案，不顯示內容" };

  let text: string;
  if (rev) {
    // `rev === ":"` 時 spec 是 `:<path>`（索引），不是 `::<path>`
    const spec = rev === ":" ? `:${file}` : `${rev}:${file}`;
    const r = await run("git", ["-C", worktree, "show", spec], { timeoutMs: 30_000 });
    if (r.code !== 0) return { error: r.stderr.trim().slice(0, 200) || "讀不到這個版本" };
    text = r.stdout;
  } else {
    const buf = await readFile(abs).catch(() => null);
    if (!buf) return { error: "讀不到這個檔案" };
    if (buf.subarray(0, 8192).includes(0)) return { error: "二進位檔" };
    text = buf.toString("utf8");
  }

  // `git show` 與檔案讀出來都會有結尾換行，split 之後最後那個空字串不是一行
  const all = text.split("\n");
  if (all.length && all[all.length - 1] === "") all.pop();

  const from = Math.max(1, range.from);
  const to = Math.min(all.length, range.to ?? all.length);
  return { lines: from > to ? [] : all.slice(from - 1, to), from, to, total: all.length };
}
