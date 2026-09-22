import { readdir, readFile, mkdir, open, stat, writeFile } from "fs/promises";
import path from "path";
import { repoPath, repoRoot, run } from "@/lib/repo";
import {
  parseDocHead, scopeOf, sortFiles, sortSets,
  type DocFile, type DocSet, type DocsIndex, type DocStatus,
} from "@/lib/docsRules";

export type { DocFile, DocSet, DocsIndex };

const DOCS_DIR = repoPath("docs");
const PINS_FILE = repoPath("data/local-state/docs-pins.json");
/** 只讀 head 的前面這麼多 byte —— 最大的 findings 有 95KB，全讀只為了標題不划算 */
const HEAD_BYTES = 4096;

// ─── pin ─────────────────────────────────────────────────────────────────────

export async function readPins(): Promise<string[]> {
  const raw = await readFile(PINS_FILE, "utf8").catch(() => null);
  if (!raw) return [];
  try {
    const d = JSON.parse(raw) as { pinned?: string[] };
    return Array.isArray(d.pinned) ? d.pinned : [];
  } catch {
    return [];
  }
}

/** pin／取消 pin 一個文件集（key 是它的資料夾路徑）。順序＝加入的順序。 */
export async function togglePin(dir: string): Promise<string[]> {
  const pinned = await readPins();
  const next = pinned.includes(dir) ? pinned.filter((d) => d !== dir) : [...pinned, dir];
  await mkdir(path.dirname(PINS_FILE), { recursive: true });
  await writeFile(PINS_FILE, JSON.stringify({ pinned: next }, null, 2) + "\n", "utf8");
  return next;
}

// ─── 掃描 ────────────────────────────────────────────────────────────────────

/** 一次問完所有檔案的最後 commit 日期。逐檔 `git log` 要開 29 個行程，不值得。 */
async function gitDates(): Promise<Map<string, string>> {
  const { stdout } = await run(
    "git",
    ["log", "--name-only", "--format=%x00%ad", "--date=short", "--", "docs"],
    { timeoutMs: 60_000, cwd: repoRoot() }
  );
  const dates = new Map<string, string>();
  let current = "";
  for (const line of stdout.split("\n")) {
    if (line.startsWith("\0")) {
      current = line.slice(1).trim();
      continue;
    }
    const f = line.trim();
    // 由新到舊走，所以第一次看到的就是最後更新
    if (f && !dates.has(f)) dates.set(f, current);
  }
  return dates;
}

async function readHead(file: string): Promise<string> {
  const fh = await open(file, "r");
  try {
    const buf = Buffer.alloc(HEAD_BYTES);
    const { bytesRead } = await fh.read(buf, 0, HEAD_BYTES, 0);
    return buf.subarray(0, bytesRead).toString("utf8");
  } finally {
    await fh.close();
  }
}

/** 資料夾裡有沒有 html；有的話就是一個文件集。assets／images 這些不算。 */
const SKIP_DIRS = new Set(["assets", "images", "pages", "patches", "fixtures", "node_modules", ".git"]);

async function collectDirs(dir: string, out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  let hasHtml = false;
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || e.name.startsWith(".")) continue;
      await collectDirs(path.join(dir, e.name), out);
    } else if (e.isFile() && e.name.endsWith(".html")) {
      hasHtml = true;
    }
  }
  if (hasHtml) out.push(dir);
}

/**
 * 掃出所有 HTML 文件集。
 *
 * 每次請求都重掃：29 份文件、每份只讀前 4KB，比一次 `git log` 還快，
 * 不值得為它做排程或快取（而且文件是人手改的，快取只會讓你看到舊的）。
 */
export async function scanDocs(): Promise<DocsIndex> {
  const dirs: string[] = [];
  await collectDirs(DOCS_DIR, dirs);
  const dates = await gitDates().catch(() => new Map<string, string>());

  const sets: DocSet[] = [];
  for (const dir of dirs.sort()) {
    const names = (await readdir(dir).catch(() => [])).filter((n) => n.endsWith(".html"));
    const files: DocFile[] = [];
    for (const name of names) {
      const abs = path.join(dir, name);
      const rel = path.relative(repoRoot(), abs);
      const [head, st] = await Promise.all([readHead(abs), stat(abs)]);
      const parsed = parseDocHead(head, name);
      files.push({
        path: rel, name, title: parsed.title, kind: parsed.kind, status: parsed.status,
        tickets: parsed.tickets, icon: parsed.icon, sizeBytes: st.size,
        // 優先用 commit 日期（mtime 會被 checkout 洗掉）；還沒進版控的文件集
        // 只有 mtime 可用，總比沒有好
        updated: dates.get(rel) ?? st.mtime.toISOString().slice(0, 10),
      });
    }
    if (!files.length) continue;

    const relDir = path.relative(repoRoot(), dir);
    const { repo, feature } = scopeOf(relDir);
    const sorted = sortFiles(files);
    const entry = sorted.find((f) => f.name === "index.html") ?? null;
    const updated = sorted.map((f) => f.updated ?? "").sort().pop() || null;
    const tickets = [...new Set(sorted.flatMap((f) => f.tickets))].sort();
    // 文件集的狀態看入口檔；沒有入口就退回「集內最常見的」
    const status: DocStatus = entry?.status ?? sorted[0].status;

    sets.push({
      dir: relDir, feature, repo, entry, files: sorted, updated, tickets, status,
      totalBytes: sorted.reduce((n, f) => n + f.sizeBytes, 0),
    });
  }

  const pinned = await readPins();
  return {
    scannedAt: new Date().toISOString(),
    sets: sortSets(sets, pinned),
    missingEntry: sets.filter((s) => !s.entry).length,
  };
}

// ─── 提供檔案內容給瀏覽器 ────────────────────────────────────────────────────

/**
 * 把 `docs/` 底下的檔案解析成絕對路徑，**並確認它真的在 docs/ 底下**。
 *
 * 這個值來自網址，所以一定要自己 resolve 再比對前綴 —— 只檢查字串裡有沒有 `..`
 * 擋不住 URL 編碼過的路徑，而 `path.resolve` 會把它們全部攤平。
 */
export function resolveDocPath(segments: string[]): string | null {
  const abs = path.resolve(DOCS_DIR, ...segments);
  if (abs !== DOCS_DIR && !abs.startsWith(DOCS_DIR + path.sep)) return null;
  return abs;
}
