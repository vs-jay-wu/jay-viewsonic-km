/**
 * 「未提交的改動」的純規則：解析 git status／diff、分類、語言判斷。
 *
 * 純函式（客戶端要用，不能帶 fs/promises）。
 */

export type ChangeKind = "modified" | "added" | "deleted" | "renamed" | "untracked" | "conflict";

export interface ChangedFile {
  /** 相對 worktree 根目錄 */
  path: string;
  kind: ChangeKind;
  /**
   * 只有檔案模式變了（100644 → 100755），內容一個字都沒改。
   *
   * 這不是罕見情況：maine-coon-cat 實測 1239 個 modified **全部**是這種，
   * 真正有內容差異的只有 17 個。不分出來的話，真的改動會被完全埋掉。
   */
  modeOnly?: boolean;
  /** 改動在索引區（已 git add）還是工作區 */
  staged: boolean;
  /** rename 的來源 */
  from?: string;
}

export interface WorktreeChanges {
  /** 絕對路徑 */
  path: string;
  /** 顯示名（最後一段） */
  name: string;
  branch: string | null;
  /** 這個 worktree 是不是 repo 的主要工作區 */
  isMain: boolean;
  /** session 綁的 worktree（`<repo>/.claude/worktrees/<name>`），結束時可能整個消失 */
  isSessionBound: boolean;
  files: ChangedFile[];
}

export interface RepoChanges {
  /** repo 名（主 worktree 的資料夾名） */
  repo: string;
  worktrees: WorktreeChanges[];
  /** 全部 worktree 加起來的改動數 */
  total: number;
}

/**
 * 狀態代號照 VS Code 的 Source Control：M／A／D／R／U／C（Jay 2026-09-14）。
 * 中文字（改／新增／刪除）看起來像說明文字，單字母才一眼認得出是狀態欄。
 */
export const KIND_LABEL: Record<ChangeKind, string> = {
  modified: "M", added: "A", deleted: "D",
  renamed: "R", untracked: "U", conflict: "C",
};

/** 完整說明，給 tooltip 用 */
export const KIND_TITLE: Record<ChangeKind, string> = {
  modified: "Modified — 有內容改動",
  added: "Added — 新增（已 git add）",
  deleted: "Deleted — 已刪除",
  renamed: "Renamed — 改名",
  untracked: "Untracked — 還沒被 git 追蹤",
  conflict: "Conflict — 合併衝突",
};

/** 顏色也照 VS Code：M 金、A／U 綠、D 紅、衝突深紅 */
export const KIND_CLS: Record<ChangeKind, string> = {
  modified: "text-amber-600",
  added: "text-emerald-600",
  deleted: "text-red-600",
  renamed: "text-sky-600",
  untracked: "text-emerald-500",
  conflict: "text-red-700",
};

/**
 * 解析 `git status --porcelain=v1` 的一行。
 *
 * 格式是 `XY <path>`，X 是索引區、Y 是工作區的狀態。**前兩個字元是固定欄位，
 * 不能用空白切**（`?? a b.txt` 的檔名有空格；` M x` 的第一欄是空白）。
 */
export function parseStatusLine(line: string): ChangedFile | null {
  if (line.length < 4) return null;
  const x = line[0];
  const y = line[1];
  let rest = line.slice(3);
  let from: string | undefined;

  // rename 是 `R  old -> new`
  const arrow = rest.indexOf(" -> ");
  if (arrow !== -1) {
    from = rest.slice(0, arrow);
    rest = rest.slice(arrow + 4);
  }
  const path = rest.replace(/^"|"$/g, "");

  if (x === "?" && y === "?") return { path, kind: "untracked", staged: false };
  if (x === "U" || y === "U" || (x === "A" && y === "A") || (x === "D" && y === "D")) {
    return { path, kind: "conflict", staged: false };
  }
  const code = x !== " " ? x : y;
  const staged = x !== " " && x !== "?";
  const kind: ChangeKind =
    code === "A" ? "added" : code === "D" ? "deleted" : code === "R" ? "renamed" : "modified";
  return { path, kind, staged, from };
}

export function parseStatus(stdout: string): ChangedFile[] {
  return stdout
    .split("\n")
    .map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l))
    .filter(Boolean)
    .map(parseStatusLine)
    .filter((f): f is ChangedFile => !!f)
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** 未追蹤的通常是產物（build、快取），量大時會洗版，所以可以單獨關掉 */
/** 只改模式的（通常是整個 repo 被 chmod 過，例如在外接硬碟上待過） */
export function isNoise(f: ChangedFile): boolean {
  return !!f.modeOnly;
}

export function countByKind(files: ChangedFile[]): Record<ChangeKind, number> {
  const out = { modified: 0, added: 0, deleted: 0, renamed: 0, untracked: 0, conflict: 0 };
  for (const f of files) out[f.kind]++;
  return out;
}

// ─── diff ────────────────────────────────────────────────────────────────────

export type DiffLineKind = "add" | "del" | "context" | "hunk" | "meta";

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  /** 舊檔行號（add 的行沒有） */
  oldNo: number | null;
  /** 新檔行號（del 的行沒有） */
  newNo: number | null;
}

/**
 * 把 unified diff 解析成一行一行，順便算出兩邊的行號。
 *
 * 只認 `@@ -a,b +c,d @@`；`diff --git`、`index`、`+++`、`---` 這些歸到 meta，
 * 畫面上不顯示（檔名已經在標題列了）。
 */
export function parseDiff(diff: string): DiffLine[] {
  const out: DiffLine[] = [];
  let oldNo = 0;
  let newNo = 0;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("@@")) {
      const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
      oldNo = m ? Number(m[1]) : 0;
      newNo = m ? Number(m[2]) : 0;
      out.push({ kind: "hunk", text: raw, oldNo: null, newNo: null });
      continue;
    }
    if (
      raw.startsWith("diff --git") || raw.startsWith("index ") ||
      raw.startsWith("--- ") || raw.startsWith("+++ ") ||
      raw.startsWith("new file") || raw.startsWith("deleted file") ||
      raw.startsWith("similarity index") || raw.startsWith("rename ") ||
      raw.startsWith("old mode") || raw.startsWith("new mode")
    ) {
      out.push({ kind: "meta", text: raw, oldNo: null, newNo: null });
      continue;
    }
    if (raw.startsWith("+")) {
      out.push({ kind: "add", text: raw.slice(1), oldNo: null, newNo: newNo++ });
    } else if (raw.startsWith("-")) {
      out.push({ kind: "del", text: raw.slice(1), oldNo: oldNo++, newNo: null });
    } else if (raw.startsWith(" ") || raw === "") {
      out.push({ kind: "context", text: raw.slice(1), oldNo: oldNo++, newNo: newNo++ });
    } else if (raw.startsWith("\\")) {
      // "\ No newline at end of file"
      out.push({ kind: "meta", text: raw, oldNo: null, newNo: null });
    }
  }
  // 去掉尾端的空行，不然每個 diff 最後都多一行空的
  while (out.length && out[out.length - 1].kind === "context" && out[out.length - 1].text === "") {
    out.pop();
  }
  return out;
}

export function diffStat(lines: DiffLine[]): { added: number; deleted: number } {
  return {
    added: lines.filter((l) => l.kind === "add").length,
    deleted: lines.filter((l) => l.kind === "del").length,
  };
}

/** 副檔名 → highlight.js 的語言名。認不得就回 null（不上色，不要猜錯） */
const LANG: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
  mjs: "javascript", cjs: "javascript", json: "json", md: "markdown",
  py: "python", sh: "bash", zsh: "bash", bash: "bash", yml: "yaml", yaml: "yaml",
  dart: "dart", kt: "kotlin", java: "java", swift: "swift", rs: "rust", go: "go",
  css: "css", scss: "scss", html: "xml", xml: "xml", sql: "sql", toml: "ini",
  gradle: "groovy", rb: "ruby", php: "php", cs: "csharp", c: "c", h: "c",
  cpp: "cpp", hpp: "cpp", m: "objectivec", mm: "objectivec", plist: "xml",
};

export function languageOf(path: string): string | null {
  const name = path.split("/").pop() ?? "";
  if (name === "Dockerfile") return "dockerfile";
  if (name.startsWith(".env")) return "bash";
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return LANG[ext] ?? null;
}

// ─── 圖片 ────────────────────────────────────────────────────────────────────

/**
 * 副檔名 → MIME。認得的才會走「看圖」那條路（2-up／滑桿／洋蔥皮）。
 *
 * **不在這張表裡的一律當一般檔案**：猜錯 MIME 會讓 `<img>` 什麼都畫不出來，
 * 比顯示「二進位檔」還糟（看起來像壞掉）。
 */
const IMAGE_MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", avif: "image/avif", bmp: "image/bmp", ico: "image/x-icon",
  svg: "image/svg+xml",
};

export function imageMimeOf(filePath: string): string | null {
  const name = filePath.split("/").pop() ?? "";
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return IMAGE_MIME[ext] ?? null;
}

/**
 * 兩張都在才比得起來；只有一張的（新增／刪除）直接顯示那一張。
 *
 * 「有沒有這一側」是**用 git／檔案系統實際問出來的**（`lib/changes.ts` 的
 * `imageSides`），不從 status 的代號推 —— 代號是掃描當下的，點開來已經可能不一樣了。
 */
export type ImageCompareMode = "two-up" | "swipe" | "onion";

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ─── 樹狀檢視 ────────────────────────────────────────────────────────────────

export interface TreeNode<T extends { path: string } = ChangedFile> {
  /** 這一層顯示的名字（壓縮過的目錄會是 `a/b/c`） */
  name: string;
  /** 完整相對路徑，也當 React key 與收合狀態的 key */
  path: string;
  /** 有值就是檔案（葉節點）。泛型是為了讓「這條線的改動」帶著自己的欄位（C／W）進來 */
  file?: T;
  children: TreeNode<T>[];
}

function sortNodes<T extends { path: string }>(nodes: TreeNode<T>[]): void {
  nodes.sort((a, b) => {
    const aDir = !a.file;
    const bDir = !b.file;
    if (aDir !== bDir) return aDir ? -1 : 1; // 目錄在前，跟 VS Code 一樣
    return a.name.localeCompare(b.name);
  });
  for (const n of nodes) sortNodes(n.children);
}

/**
 * 只有一個子目錄的目錄壓成一行（`a` → `a/b` → `a/b/c` 顯示成 `a/b/c`）。
 *
 * VS Code 的 compact folders，對 gradle 那種 `build/intermediates/…/debug/` 的深路徑
 * 差別很大 —— 不壓縮的話光是點開就要點七八層，而中間每層都只有一條路。
 */
function compact<T extends { path: string }>(nodes: TreeNode<T>[]): TreeNode<T>[] {
  return nodes.map((n) => {
    let cur = n;
    while (!cur.file && cur.children.length === 1 && !cur.children[0].file) {
      const only = cur.children[0];
      cur = { name: `${cur.name}/${only.name}`, path: only.path, children: only.children };
    }
    return { ...cur, children: compact(cur.children) };
  });
}

/** 一串檔案 → 樹。目錄在前、同層照字母排，單一子目錄的鏈會被壓成一行 */
export function buildTree<T extends { path: string }>(files: T[]): TreeNode<T>[] {
  const root: TreeNode<T> = { name: "", path: "", children: [] };
  for (const f of files) {
    const parts = f.path.split("/");
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts.slice(0, i + 1).join("/");
      let next = cur.children.find((c) => !c.file && c.path === p);
      if (!next) {
        next = { name: parts[i], path: p, children: [] };
        cur.children.push(next);
      }
      cur = next;
    }
    cur.children.push({ name: parts[parts.length - 1], path: f.path, file: f, children: [] });
  }
  sortNodes(root.children);
  return compact(root.children);
}
