import { readFile, readdir, mkdir, writeFile, stat } from "fs/promises";
import path from "path";
import { repoPath, repoRoot, run } from "@/lib/repo";
import {
  CLEANABLE_DIR_NAMES, filterBig, kindsOf,
  type BuildDirEntry, type BuildDirsSnapshot, type RepoBuildDirs,
} from "@/lib/buildDirRules";

export type { BuildDirsSnapshot, RepoBuildDirs, BuildDirEntry };

const SNAPSHOT_FILE = repoPath("data/local-state/build-dirs.json");
/** 掃一次要 du 幾十 GB，不便宜（實測約 7 秒）。快取到期才重掃。 */
const STALE_MS = 6 * 60 * 60 * 1000;

/**
 * 掃本機各 repo 的 build 產物。
 *
 * **km repo 自己不掃**：web server 就跑在它的 node_modules 上，
 * 列出來只會讓人手滑把自己正在用的東西刪掉。
 */
async function orgRoots(): Promise<string[]> {
  const raw = await readFile(repoPath("local.workspace.json"), "utf8").catch(() => null);
  if (!raw) return [];
  try {
    const ws = JSON.parse(raw) as {
      orgs?: Record<string, { localPath?: string }>;
    };
    return Object.values(ws.orgs ?? [])
      .map((o) => o.localPath)
      .filter((p): p is string => !!p);
  } catch {
    return [];
  }
}

async function isDir(p: string): Promise<boolean> {
  return stat(p).then((s) => s.isDirectory(), () => false);
}

/** 一次 du 多個目錄。回傳 `絕對路徑 → bytes` */
async function duSizes(paths: string[]): Promise<Map<string, number>> {
  const sizes = new Map<string, number>();
  // 參數太多會爆 ARG_MAX，分批
  for (let i = 0; i < paths.length; i += 200) {
    const chunk = paths.slice(i, i + 200);
    const { stdout } = await run("/usr/bin/du", ["-sk", ...chunk], { timeoutMs: 300_000 });
    for (const line of stdout.split("\n")) {
      const m = line.match(/^(\d+)\s+(.*)$/);
      if (m) sizes.set(m[2], Number(m[1]) * 1024);
    }
  }
  return sizes;
}

/** 這個目錄有沒有被 gitignore。不是 git repo 時當成「可以刪」 */
async function ignoredDirs(repoDir: string, rel: string[]): Promise<Set<string>> {
  if (!rel.length) return new Set();
  if (!(await isDir(path.join(repoDir, ".git")))) return new Set(rel);
  const { stdout } = await run("git", ["-C", repoDir, "check-ignore", ...rel], {
    timeoutMs: 30_000,
  });
  return new Set(stdout.split("\n").map((s) => s.trim()).filter(Boolean));
}

export async function scan(): Promise<BuildDirsSnapshot> {
  const roots = await orgRoots();
  const repos: RepoBuildDirs[] = [];
  const allPaths: string[] = [];
  const pending: { repo: RepoBuildDirs; rel: string[] }[] = [];

  for (const root of roots) {
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith(".")) continue;
      const dir = path.join(root, e.name);
      if (path.resolve(dir) === path.resolve(repoRoot())) continue; // km 自己不掃

      const rootEntries = await readdir(dir).catch(() => []);
      const kinds = kindsOf(rootEntries);
      if (!kinds.length) continue;

      // 根目錄的候選 ＋ 子模組（往下一層）的候選
      const candidates = new Set<string>();
      for (const k of kinds) for (const d of k.dirs) candidates.add(d);
      const nested = new Set(kinds.flatMap((k) => k.nestedDirs));
      if (nested.size) {
        for (const name of rootEntries) {
          if (name.startsWith(".") || name === "node_modules") continue;
          if (!(await isDir(path.join(dir, name)))) continue;
          for (const n of nested) candidates.add(path.join(name, n));
        }
      }

      const kindOfDir = (rel: string): RepoBuildDirs["kinds"][number] => {
        const base = path.basename(rel);
        return kinds.find((k) => k.dirs.includes(base) || k.nestedDirs.includes(base))?.kind
          ?? "unknown";
      };

      const rel: string[] = [];
      for (const c of candidates) {
        if (await isDir(path.join(dir, c))) rel.push(c);
      }
      if (!rel.length) continue;

      const repo: RepoBuildDirs = {
        repo: e.name,
        repoPath: dir,
        kinds: kinds.map((k) => k.kind),
        dirs: rel.map((r) => ({ path: r, bytes: 0, kind: kindOfDir(r) })),
        totalBytes: 0,
      };
      repos.push(repo);
      pending.push({ repo, rel });
      allPaths.push(...rel.map((r) => path.join(dir, r)));
    }
  }

  const sizes = await duSizes(allPaths);
  for (const { repo, rel } of pending) {
    const ignored = await ignoredDirs(repo.repoPath, rel);
    for (const d of repo.dirs) {
      d.bytes = sizes.get(path.join(repo.repoPath, d.path)) ?? 0;
      if (!ignored.has(d.path)) d.notIgnored = true;
    }
    repo.totalBytes = repo.dirs.reduce((n, d) => n + d.bytes, 0);
  }

  const big = filterBig(repos);
  const snapshot: BuildDirsSnapshot = {
    scannedAt: new Date().toISOString(),
    repoCount: repos.length,
    totalBytes: big.reduce((n, r) => n + r.totalBytes, 0),
    repos: big,
    error: null,
  };
  await mkdir(path.dirname(SNAPSHOT_FILE), { recursive: true })
    .then(() => writeFile(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2) + "\n", "utf8"))
    .catch(() => undefined);
  return snapshot;
}

export async function readSnapshot(): Promise<BuildDirsSnapshot | null> {
  const raw = await readFile(SNAPSHOT_FILE, "utf8").catch(() => null);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as BuildDirsSnapshot;
    return Array.isArray(s.repos) ? s : null;
  } catch {
    return null;
  }
}

export function isStale(s: BuildDirsSnapshot | null): boolean {
  return !s || Date.now() - Date.parse(s.scannedAt) > STALE_MS;
}

// ─── 清除 ────────────────────────────────────────────────────────────────────

export interface CleanResult {
  ok: boolean;
  removed: string[];
  freedBytes: number;
  error?: string;
}

/**
 * 刪掉某個 repo 的 build 目錄。
 *
 * 三道關卡，全部都要過（這是不可逆的操作，前端傳什麼都不能直接信）：
 * 1. repo 必須是掃描結果裡的那一個（路徑由 server 自己查，不吃前端的路徑）
 * 2. 目錄名必須在白名單裡（`build`／`node_modules`…）
 * 3. 必須被 gitignore（或該 repo 不是 git repo）—— 沒被忽略的目錄可能有原始碼
 */
export async function clean(repoName: string, relPaths: string[]): Promise<CleanResult> {
  const snapshot = await readSnapshot();
  const repo = snapshot?.repos.find((r) => r.repo === repoName);
  if (!repo) return { ok: false, removed: [], freedBytes: 0, error: "掃描結果裡沒有這個 repo，請先重新掃描" };

  const wanted = relPaths.length ? relPaths : repo.dirs.map((d) => d.path);
  const targets = repo.dirs.filter((d) => wanted.includes(d.path));
  if (!targets.length) return { ok: false, removed: [], freedBytes: 0, error: "沒有可以清的目錄" };

  const removed: string[] = [];
  let freed = 0;
  for (const d of targets) {
    if (!CLEANABLE_DIR_NAMES.has(path.basename(d.path))) continue;
    if (d.notIgnored) continue; // 沒被 gitignore 的一律不動
    const abs = path.join(repo.repoPath, d.path);
    if (!abs.startsWith(repo.repoPath + path.sep)) continue;
    if (!(await isDir(abs))) continue;
    const { code, stderr } = await run("/bin/rm", ["-rf", abs], { timeoutMs: 600_000 });
    if (code !== 0) {
      return { ok: false, removed, freedBytes: freed, error: stderr.trim().slice(0, 300) };
    }
    removed.push(d.path);
    freed += d.bytes;
  }

  // 刪完重掃，讓畫面直接反映現況
  await scan().catch(() => undefined);
  return { ok: true, removed, freedBytes: freed };
}
