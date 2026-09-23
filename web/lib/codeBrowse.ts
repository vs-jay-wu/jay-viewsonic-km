import { readFile, readdir, stat } from "fs/promises";
import path from "path";
import { run } from "@/lib/repo";
import { isKnownWorktree } from "@/lib/changes";
import { isExternalRepo } from "@/lib/externalRepos";
import {
  isSensitivePath, looksBinary, parseGrepOutput, sortEntries,
  type SearchHit, type TreeEntry,
} from "@/lib/codeBrowseRules";

/**
 * 唯讀的程式碼瀏覽。**這個檔案裡沒有任何寫入**（Jay 2026-09-18：不要改 code 的功能）。
 *
 * 路徑驗證分兩層，兩層都不能少：
 *   1. repo 本身要過 `isKnownWorktree`（否則任何目錄都能被瀏覽）
 *   2. 目標路徑解析後必須還在那個 repo 底下（擋 `../../` 逃逸）
 */

/** 單一檔案的上限。超過就不給看 —— 瀏覽器也畫不動 */
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
/** 一次列幾個項目。node_modules 那種目錄有上萬個，全列會把瀏覽器卡死 */
const MAX_ENTRIES = 2000;

async function resolveIn(repo: string, rel: string): Promise<string | null> {
  const abs = path.resolve(repo, rel || ".");
  if (abs !== repo && !abs.startsWith(repo + path.sep)) return null;
  return abs;
}

/**
 * 這三支 API 的唯一入口守衛。
 *
 * 認兩種：本機工作區（含 worktree），以及**外接碟上的 repo**——
 * `/code` 是唯讀瀏覽，offloaded 的東西也該看得到（Jay 2026-09-22）。
 * 外接那條限制得比本機更窄（只認外接根目錄正下方的一層），見 lib/externalRepos.ts。
 */
export async function openRepo(dir: string): Promise<string | null> {
  const abs = path.resolve(dir);
  if (await isKnownWorktree(abs)) return abs;
  return (await isExternalRepo(abs)) ? abs : null;
}

export async function listDir(
  dir: string,
  rel: string
): Promise<{ entries: TreeEntry[]; truncated: boolean } | { error: string }> {
  const repo = await openRepo(dir);
  if (!repo) return { error: "不認得這個 repo" };
  const abs = await resolveIn(repo, rel);
  if (!abs) return { error: "路徑不在這個 repo 底下" };

  const dirents = await readdir(abs, { withFileTypes: true }).catch(() => null);
  if (!dirents) return { error: "讀不到這個目錄" };

  const entries: TreeEntry[] = [];
  for (const d of dirents.slice(0, MAX_ENTRIES)) {
    if (d.name === ".git") continue; // 內部資料，看了也沒意義
    const childRel = rel ? `${rel}/${d.name}` : d.name;
    if (d.isDirectory()) {
      entries.push({ name: d.name, path: childRel, kind: "dir" });
    } else if (d.isFile() || d.isSymbolicLink()) {
      const st = await stat(path.join(abs, d.name)).catch(() => null);
      entries.push({ name: d.name, path: childRel, kind: "file", sizeBytes: st?.size ?? 0 });
    }
  }
  return { entries: sortEntries(entries), truncated: dirents.length > MAX_ENTRIES };
}

export interface FileContent {
  path: string;
  text: string;
  sizeBytes: number;
  truncated: boolean;
}

export async function readFileIn(
  dir: string,
  rel: string
): Promise<FileContent | { error: string }> {
  const repo = await openRepo(dir);
  if (!repo) return { error: "不認得這個 repo" };
  const abs = await resolveIn(repo, rel);
  if (!abs || !rel) return { error: "路徑不在這個 repo 底下" };

  // 機敏檔案在**讀取這一層**就擋掉，不是靠畫面不顯示（sensitive-files.md）
  if (isSensitivePath(rel)) {
    return { error: "這是機敏檔案，不顯示內容。要看有哪些欄位請看同目錄的 .env.example" };
  }
  if (looksBinary(rel)) return { error: "二進位檔，不顯示內容" };

  const st = await stat(abs).catch(() => null);
  if (!st?.isFile()) return { error: "不是檔案" };
  if (st.size > MAX_FILE_BYTES) {
    return { error: `檔案太大（${(st.size / 1024 / 1024).toFixed(1)} MB），不顯示` };
  }

  const buf = await readFile(abs).catch(() => null);
  if (!buf) return { error: "讀不到這個檔案" };
  // 副檔名認不出來的二進位檔：前 8KB 有 NUL 就當二進位
  if (buf.subarray(0, 8192).includes(0)) return { error: "二進位檔，不顯示內容" };

  return { path: rel, text: buf.toString("utf8"), sizeBytes: st.size, truncated: false };
}

/**
 * 搜尋。用 `git grep` 而不是 `rg`：
 *
 * - 它照 `.gitignore` 走，天然跳過 `node_modules`、`build/`、`.dart_tool` 那些產物
 *   （這個工作區光 build 產物就有十幾 GB）
 * - 不需要額外安裝
 *
 * **`--untracked` 不能省**：沒有它就只搜已追蹤的檔案，於是「還沒 commit 的新檔」
 * 完全搜不到 —— 而那常常正是你在找的東西。實測：km 搜 `layoutGraph`，
 * 沒有 `--untracked` 是 0 個命中，有的話 4 個檔（其中 3 個是這個 session 新加的）。
 * 加上去也不會把產物搜進來（它仍然吃 .gitignore），大 repo 實測 0.46 秒。
 */
export async function searchRepo(
  dir: string,
  query: string,
  opts: { caseSensitive?: boolean; regex?: boolean } = {}
): Promise<{ hits: SearchHit[]; truncated: boolean } | { error: string }> {
  const repo = await openRepo(dir);
  if (!repo) return { error: "不認得這個 repo" };
  if (query.trim().length < 2) return { error: "關鍵字至少兩個字" };

  const args = ["-C", repo, "grep", "-n", "--no-color", "-I", "--untracked"];
  if (!opts.caseSensitive) args.push("-i");
  if (!opts.regex) args.push("-F"); // 預設當成純文字，不然 `(` 之類會變成語法錯誤
  args.push("-e", query);

  const r = await run("git", args, { timeoutMs: 30_000 });
  // git grep 沒找到時 exit code 是 1，那不是錯誤
  if (r.code > 1) return { error: r.stderr.trim().slice(0, 200) || "搜尋失敗" };

  const hits = parseGrepOutput(r.stdout);
  return { hits, truncated: hits.length >= 300 };
}
