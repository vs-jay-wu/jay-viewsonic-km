import { readFile, readdir, stat } from "fs/promises";
import path from "path";
import { run } from "@/lib/repo";
import { isKnownWorktree } from "@/lib/changes";
import { isExternalRepo } from "@/lib/externalRepos";
import {
  isHardBlocked, isSensitivePath, looksBinary, maskEnvValues, parseGrepOutput, sortEntries,
  type SearchHit, type TreeEntry,
} from "@/lib/codeBrowseRules";
import {
  isAdaptiveIconXml, isVectorDrawableXml, looksLikeAndroidDrawable, parseAdaptiveIcon,
} from "@/lib/vectorDrawableRules";
import { readResColors, readResDrawables } from "@/lib/androidRes";
import { rawMimeOf } from "@/lib/codeRawRules";

/**
 * 唯讀的程式碼瀏覽。**這個檔案裡沒有任何寫入**（Jay 2026-09-18：不要改 code 的功能）。
 *
 * 路徑驗證分兩層，兩層都不能少：
 *   1. repo 本身要過 `isKnownWorktree`（否則任何目錄都能被瀏覽）
 *   2. 目標路徑解析後必須還在那個 repo 底下（擋 `../../` 逃逸）
 */

/**
 * 單一檔案的上限。
 *
 * **貴的不是傳輸，是畫面**：1.9 MB 的檔從這支 API 抓回來只要 25ms（本機），
 * 但同一個檔有 50,896 行，程式碼檢視一行一個 `<tr>` → 45 萬個 DOM 節點、
 * JS heap 275 MB、捲動每幀 34ms（2026-09-30 實測）。所以限制**行數**才對，
 * 那一層在畫面端（`components/CodeView.tsx` 的 `MAX_RENDER_LINES`）；
 * 這裡的位元組上限只是擋住「誤放的產物」那種極端情況（repo 裡有 38 MB 的 CSV）。
 */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
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

/**
 * 標出哪些被 gitignore 掉 —— 畫面上調暗，跟 VS Code 一樣
 * （Jay 2026-09-23：「被 ignore 會比較不明顯的顏色」）。
 *
 * 一次問一整層（路徑當參數帶進去），不是一個一個問。
 *
 * ⚠️ 兩個會**安靜失效**的地方：
 * - **`check-ignore` 在「沒有任何一個被忽略」時回傳 1**，那是正常結果不是錯誤；
 *   真正的錯誤是 128。把 1 當失敗的話，乾淨的目錄會整層失去標記。
 * - **`-z` 只能配 `--stdin`**（`fatal: -z only makes sense with --stdin`）。
 *   路徑當參數帶時不能加，否則整個指令失敗、一個都標不到 —— 而畫面上只是
 *   「沒有任何檔案是灰的」，跟「這個 repo 沒忽略任何東西」長得一模一樣。
 */
async function markIgnored(repo: string, entries: TreeEntry[]): Promise<TreeEntry[]> {
  if (!entries.length) return entries;
  const r = await run("git", ["-C", repo, "check-ignore", "--", ...entries.map((e) => e.path)], {
    timeoutMs: 20_000,
  });
  if (r.code !== 0 && r.code !== 1) return entries; // repo 壞了之類 —— 不標就是了
  const ignored = new Set(r.stdout.split("\n").map((x) => x.trim()).filter(Boolean));
  return entries.map((e) => (ignored.has(e.path) ? { ...e, ignored: true } : e));
}

/** 合併鏈最多往下幾層。Java／Kotlin 的 package 路徑很深，但不會無限 */
const MAX_COMPACT_DEPTH = 16;

/**
 * VS Code 的 compact folders：只有單一子目錄的資料夾整條合成一列
 * （`com` ▸ `viewsonic` ▸ `vbo` ▸ `takeone` → `com/viewsonic/vbo/takeone`）。
 *
 * 回傳的 `path` 是**鏈底**那個目錄 —— 展開時直接列它的內容，中間那幾層不佔一列
 * （它們本來就沒有別的東西可看）。
 */
async function compactDir(parentAbs: string, name: string, rel: string): Promise<TreeEntry> {
  let dispName = name;
  let curRel = rel;
  let curAbs = path.join(parentAbs, name);

  for (let depth = 0; depth < MAX_COMPACT_DEPTH; depth++) {
    const kids = await readdir(curAbs, { withFileTypes: true }).catch(() => null);
    if (!kids) break;
    // `.git` 在列表上本來就被跳過，所以它不算「唯一的那個子項目」
    const visible = kids.filter((k) => k.name !== ".git");
    if (visible.length !== 1 || !visible[0].isDirectory()) break;
    dispName = `${dispName}/${visible[0].name}`;
    curRel = `${curRel}/${visible[0].name}`;
    curAbs = path.join(curAbs, visible[0].name);
  }
  return { name: dispName, path: curRel, kind: "dir" };
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
      entries.push(await compactDir(abs, d.name, childRel));
    } else if (d.isFile() || d.isSymbolicLink()) {
      const st = await stat(path.join(abs, d.name)).catch(() => null);
      entries.push({ name: d.name, path: childRel, kind: "file", sizeBytes: st?.size ?? 0 });
    }
  }
  return {
    entries: sortEntries(await markIgnored(repo, entries)),
    truncated: dirents.length > MAX_ENTRIES,
  };
}

export interface FileContent {
  path: string;
  text: string;
  sizeBytes: number;
  truncated: boolean;
  /** 這個檔是機敏檔案（畫面上要標出來，提醒別在分享螢幕時開著） */
  sensitive?: boolean;
  /** 這次是用哪種方式解鎖的 */
  revealed?: Reveal;
  /**
   * Android drawable 才有：同一個 `res/` 底下的 `<color name=…>` 對照表。
   * 沒有它的話 `android:fillColor="@color/x"` 在預覽裡只能畫成灰色。
   */
  resColors?: Record<string, string>;
  /** adaptive icon 才有：它三層指到的那幾個 drawable 的原文 */
  resDrawables?: Record<string, string>;
}

/**
 * `full` ＝ 明碼、`masked` ＝ 只留欄位名、不給就是預設的「不顯示」。
 *
 * **要帶明確的參數才會拿到內容**（`/api/code/file?reveal=…`）—— 預設路徑
 * 的行為跟以前一模一樣。這樣「有人真的解鎖了」在程式與 log 裡都 grep 得到，
 * 而不是靠某個布林預設值的歷史。
 */
export type Reveal = "full" | "masked";

export async function readFileIn(
  dir: string,
  rel: string,
  reveal?: Reveal
): Promise<FileContent | { error: string }> {
  const repo = await openRepo(dir);
  if (!repo) return { error: "不認得這個 repo" };
  const abs = await resolveIn(repo, rel);
  if (!abs || !rel) return { error: "路徑不在這個 repo 底下" };

  /*
   * 機敏檔案在**讀取這一層**把關，不是靠畫面不顯示（sensitive-files.md）。
   *
   * keystore 那一類連解鎖都不給；其餘的預設仍然不給，要帶 `reveal` 才讀 ——
   * 也就是「使用者在自己的瀏覽器上明確按了一下」。
   */
  if (isHardBlocked(rel)) {
    return { error: "這個目錄受保護（excluded-dirs.md），一律不讀取" };
  }
  // 二進位要**排在機敏之前**：keystore 那種檔解鎖也只是亂碼，
  // 給解鎖按鈕等於把原因講錯（Jay 2026-09-23 點 .jks 時看到的就是那個）
  if (looksBinary(rel)) return { error: "二進位檔，不顯示內容" };
  if (isSensitivePath(rel) && !reveal) {
    return {
      error: "這是機敏檔案，預設不顯示內容。要看有哪些欄位請看同目錄的 .env.example",
      sensitive: true,
    };
  }

  const st = await stat(abs).catch(() => null);
  if (!st?.isFile()) return { error: "不是檔案" };
  if (st.size > MAX_FILE_BYTES) {
    return { error: `檔案太大（${(st.size / 1024 / 1024).toFixed(1)} MB），不顯示` };
  }

  const buf = await readFile(abs).catch(() => null);
  if (!buf) return { error: "讀不到這個檔案" };
  // 副檔名認不出來的二進位檔：前 8KB 有 NUL 就當二進位
  if (buf.subarray(0, 8192).includes(0)) return { error: "二進位檔，不顯示內容" };

  const sensitive = isSensitivePath(rel);
  // 遮罩一定要在這裡做 —— 前端遮的話值還在回應裡，開 DevTools 就看得到
  const text = sensitive && reveal === "masked" ? maskEnvValues(buf.toString("utf8")) : buf.toString("utf8");
  const previewable =
    looksLikeAndroidDrawable(rel) && (isVectorDrawableXml(text) || isAdaptiveIconXml(text));
  const resColors = previewable ? await readResColors(repo, rel) : undefined;
  // adaptive icon 的三層各自是另一個檔，預覽要在客戶端合成，所以一起送過去
  const refs = previewable && isAdaptiveIconXml(text) ? parseAdaptiveIcon(text) : null;
  const resDrawables = refs
    ? await readResDrawables(repo, rel, [refs.background, refs.foreground])
    : undefined;
  return {
    path: rel, text, sizeBytes: st.size, truncated: false, sensitive, revealed: reveal,
    resColors, resDrawables,
  };
}

/**
 * 把一個檔案**原封不動**交給瀏覽器（`/code-view/…` 用）。
 *
 * 與 `readFileIn` 的差別只有「不轉成 JSON 字串」；**守衛完全相同**，而且刻意
 * 共用同一支函式的那幾條判斷，不要各寫一份 —— 兩份遲早會漂移，而漂移的那天
 * 是機敏檔案從新的出口漏出去。
 *
 * 比 `readFileIn` 更嚴的一條：**副檔名要在白名單裡**（`rawMimeOf`）。
 * 這條路由的輸出會被瀏覽器當成 HTML／JS 執行，猜 MIME 是不行的。
 */
export async function readRawIn(
  dir: string,
  rel: string
): Promise<{ data: Buffer; mime: string } | { error: string; status: number }> {
  const repo = await openRepo(dir);
  if (!repo) return { error: "不認得這個 repo", status: 403 };
  const abs = await resolveIn(repo, rel);
  if (!abs || !rel) return { error: "路徑不在這個 repo 底下", status: 403 };

  // 機敏檔案的三層守衛照樣套用（sensitive-files.md）——
  // 這條路由沒有 `reveal` 參數，所以機敏檔案一律擋，連遮罩版都不給
  if (isHardBlocked(rel)) return { error: "這個目錄受保護，一律不讀取", status: 403 };
  if (isSensitivePath(rel)) return { error: "機敏檔案不從這條路徑提供", status: 403 };

  const mime = rawMimeOf(rel);
  if (!mime) return { error: "這種副檔名不從這條路徑提供", status: 415 };

  const st = await stat(abs).catch(() => null);
  if (!st?.isFile()) return { error: "不是檔案", status: 404 };
  if (st.size > MAX_FILE_BYTES) return { error: "檔案太大", status: 413 };

  const buf = await readFile(abs).catch(() => null);
  if (!buf) return { error: "讀不到這個檔案", status: 404 };
  return { data: buf, mime };
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
