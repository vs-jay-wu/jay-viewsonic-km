/**
 * 「這條線的改動」的純規則：解析 git log／diff 的輸出、判斷分支屬不屬於某張票。
 *
 * 純函式（客戶端也要用，不能帶 fs/promises）。
 */

import type { ChangeKind, ChangedFile } from "@/lib/changesRules";
import { keyNumber } from "@/lib/workItemRules";

export interface LineCommit {
  sha: string;
  shortSha: string;
  subject: string;
  author: string;
  /** ISO 8601 */
  date: string;
  /**
   * commit 訊息的 `Claude-Session:` trailer 解出來的 session id。
   *
   * 這是**唯一精確**的 session ↔ commit 關聯（其餘都是靠票號／分支推的），
   * UI 要讓人分得出來。
   */
  sessionId: string | null;
}

export interface LineFile extends ChangedFile {
  /** 出現在 base..HEAD 的 commit 裡 */
  inCommits: boolean;
  /** 工作區也有動（未提交） */
  inWip: boolean;
}

export interface LineBranch {
  repo: string;
  /** worktree 絕對路徑 */
  worktree: string;
  worktreeName: string;
  branch: string | null;
  /** 拿來比的基準分支（`origin/main`、`origin/develop`…），動態問出來的 */
  base: string | null;
  /** base 與 HEAD 的分歧點 */
  mergeBase: string | null;
  commits: LineCommit[];
  files: LineFile[];
  /** 為什麼這條分支被列進來 —— UI 要標，關聯強度不一樣 */
  why: LineReason[];
  error?: string;
}

/** 這條分支被收進來的理由。`trailer` 最硬，`manual` 是人加的，其餘是推的 */
export type LineReason = "trailer" | "branch-name" | "pr" | "manual";

export const REASON_LABEL: Record<LineReason, string> = {
  trailer: "commit 帶 Claude-Session",
  "branch-name": "分支名含票號",
  pr: "這條線的 PR",
  manual: "手動加入",
};

export interface WorkChanges {
  key: string;
  ticketKey: string | null;
  scannedAt: string;
  branches: LineBranch[];
  /** 找過但沒有收進來的 worktree —— 給「手動加入」用 */
  candidates: { repo: string; worktree: string; worktreeName: string; branch: string | null }[];
}

// ─── 解析 ────────────────────────────────────────────────────────────────────

/**
 * commit 訊息裡的 `Claude-Session: https://claude.ai/code/session_<id>`。
 *
 * 只認完整的 trailer 形狀；沒有就回 null（**不要**用作者時間之類的東西去猜是誰做的）。
 */
export function parseSessionTrailer(message: string): string | null {
  const m = /^Claude-Session:\s*\S*session_([A-Za-z0-9]+)\s*$/m.exec(message);
  return m ? m[1] : null;
}

/** `git log --format=<SEP 分隔>` 的輸出 → commit 清單 */
export const LOG_FORMAT = "%H%x1f%an%x1f%aI%x1f%s%x1f%B%x1e";

export function parseLog(stdout: string): LineCommit[] {
  return stdout
    .split("\x1e")
    .map((rec) => rec.replace(/^\n+/, ""))
    .filter((rec) => rec.trim())
    .map((rec) => {
      const [sha = "", author = "", date = "", subject = "", body = ""] = rec.split("\x1f");
      return {
        sha,
        shortSha: sha.slice(0, 8),
        subject,
        author,
        date,
        sessionId: parseSessionTrailer(body),
      };
    })
    .filter((c) => c.sha);
}

/** `git diff --name-status` 的一行 → 路徑與種類 */
export function parseNameStatus(stdout: string): ChangedFile[] {
  const out: ChangedFile[] = [];
  for (const raw of stdout.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (!line) continue;
    const parts = line.split("\t");
    const code = parts[0]?.[0] ?? "";
    // rename 是 `R100\told\tnew`
    if (code === "R" && parts.length >= 3) {
      out.push({ path: parts[2], kind: "renamed", staged: false, unstaged: false, from: parts[1] });
      continue;
    }
    if (parts.length < 2) continue;
    const kind: ChangeKind =
      code === "A" ? "added" : code === "D" ? "deleted" : code === "C" ? "added" : "modified";
    out.push({ path: parts[1], kind, staged: false, unstaged: false });
  }
  return out;
}

/**
 * 把「base..工作區的整體差異」與「工作區現在的狀態」併成一份清單。
 *
 * 兩件事分開來源是有原因的：
 * - `git diff <base>` **看不到未追蹤的檔案**（實測 poc-desktop-mode：status 有 17 筆，
 *   `diff --name-only <merge-base>` 只有 1 筆），所以未追蹤的要從 status 補進來。
 * - 同一個檔案可能既在 commit 裡改過、工作區又再改一次；整體 diff 只會出現一次，
 *   但要標出它兩邊都有，不然看不出「這個檔案還有沒 commit 的部分」。
 */
export function mergeLineFiles(
  overall: ChangedFile[],
  committedPaths: Iterable<string>,
  status: ChangedFile[]
): LineFile[] {
  const committed = new Set(committedPaths);
  const wip = new Map(status.map((f) => [f.path, f]));
  const out = new Map<string, LineFile>();

  for (const f of overall) {
    out.set(f.path, {
      ...f,
      modeOnly: wip.get(f.path)?.modeOnly,
      inCommits: committed.has(f.path),
      inWip: wip.has(f.path),
    });
  }
  // 未追蹤的檔案 `git diff` 看不到，從 status 補
  for (const f of status) {
    if (out.has(f.path)) continue;
    if (f.kind !== "untracked" && f.kind !== "conflict") continue;
    out.set(f.path, { ...f, inCommits: false, inWip: true });
  }
  return [...out.values()].sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * 分支名看起來是在做這張票嗎。
 *
 * 比對**票號數字**而不是整個 key：`Jay/VSFT-6310`、`jay/vb-1945-font`、
 * `feature/1945_fix` 都要中，而 `Jay/VB-19450` 不能中（所以數字要前後有邊界）。
 * 大小寫一律不管 —— 分支前綴的大小寫本來就依 repo 而異（見 memory
 * `branch-naming-capitalised-owner`）。
 */
export function branchMatchesTicket(branch: string | null, ticketKey: string | null): boolean {
  const num = keyNumber(ticketKey);
  if (!branch || !num) return false;
  return new RegExp(`(^|[^0-9])${num}([^0-9]|$)`).test(branch);
}

/** 這條線的檔案在畫面上怎麼標：只在 commit 裡／只在工作區／兩邊都有 */
export function fileOrigin(f: LineFile): { label: string; title: string; cls: string } {
  if (f.inCommits && f.inWip) {
    return {
      label: "C+W",
      title: "已 commit，而且工作區還有沒提交的改動",
      cls: "text-info",
    };
  }
  if (f.inCommits) return { label: "C", title: "只在 commit 裡", cls: "text-accent" };
  return { label: "W", title: "只在工作區（還沒 commit）", cls: "text-warn" };
}
