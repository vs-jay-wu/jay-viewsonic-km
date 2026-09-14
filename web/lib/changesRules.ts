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

export const KIND_LABEL: Record<ChangeKind, string> = {
  modified: "改", added: "新增", deleted: "刪除",
  renamed: "改名", untracked: "未追蹤", conflict: "衝突",
};

export const KIND_CLS: Record<ChangeKind, string> = {
  modified: "text-amber-600",
  added: "text-emerald-600",
  deleted: "text-red-600",
  renamed: "text-sky-600",
  untracked: "text-gray-400",
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
