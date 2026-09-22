/**
 * `/review-local` 執行紀錄的型別與純規則（客戶端也要用）。
 *
 * 紀錄由 `scripts/review-local.sh` 寫進 `data/review-local-runs/`，
 * **只有結論，沒有 diff 也沒有 prompt** —— diff 可能含機敏內容，也大得沒道理留著。
 */

export type ReviewVerdict = "ready" | "fix_first" | "needs_decision";
export type Severity = "MUST" | "SHOULD" | "NIT" | "QUESTION";

export interface ReviewFinding {
  severity: Severity;
  title: string;
  detail: string;
  evidence: string;
  file: string | null;
  line: number | null;
  confidence: "verified" | "read_code" | "inferred" | null;
  suggestion: string | null;
}

export interface ReviewRun {
  id: string;
  startedAt: string;
  finishedAt: string;
  /** 誰跑的 —— codex 與 claude 的輸出格式一樣，差別只有這個欄位與 costUsd */
  engine: "codex" | "claude";
  model: string | null;
  repo: string;
  repoRoot: string;
  branch: string;
  head: string;
  base: string;
  scope: string;
  onDefaultBranch: boolean;
  diffTruncated: boolean;
  sensitiveFilesTouched: string[];
  /** codex 沒有金額可回報 */
  costUsd: number | null;
  verdict: ReviewVerdict;
  summary: string;
  findings: ReviewFinding[];
  blockers: string[];
  claims_without_tests: string[];
  unresolved_questions: string[];
}

export const VERDICT_STYLE: Record<ReviewVerdict, { label: string; cls: string }> = {
  ready: { label: "可以送", cls: "border-ok/40 bg-ok-bg text-ok" },
  fix_first: { label: "先修再送", cls: "border-danger/40 bg-danger-bg text-danger" },
  needs_decision: { label: "要你決定", cls: "border-warn/40 bg-warn-bg text-warn" },
};

/** 嚴重度的顏色。MUST 紅、SHOULD 琥珀、其餘中性 —— 琥珀只給警告（web/AGENTS.md） */
export const SEVERITY_CLS: Record<Severity, string> = {
  MUST: "text-danger",
  SHOULD: "text-warn",
  NIT: "text-fg-muted",
  QUESTION: "text-accent",
};

export const SEVERITY_ORDER: Severity[] = ["MUST", "SHOULD", "QUESTION", "NIT"];

export function countBySeverity(findings: ReviewFinding[]): Record<Severity, number> {
  const out: Record<Severity, number> = { MUST: 0, SHOULD: 0, NIT: 0, QUESTION: 0 };
  for (const f of findings) if (out[f.severity] !== undefined) out[f.severity]++;
  return out;
}

/**
 * 同一個 repo＋分支只留最後一次當「現況」，更早的算歷史。
 *
 * 看紀錄時最常問的是「這條線上次驗出什麼」，而不是「兩小時前那次」。
 */
export function latestPerBranch(runs: ReviewRun[]): ReviewRun[] {
  const seen = new Set<string>();
  const out: ReviewRun[] = [];
  for (const r of [...runs].sort((a, b) => (a.id < b.id ? 1 : -1))) {
    const key = `${r.repoRoot}@${r.branch}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** 搜尋：repo、分支、摘要、findings 的標題都算 */
export function matchesReviewQuery(run: ReviewRun, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    run.repo, run.branch, run.summary, run.engine, run.scope,
    ...run.findings.map((f) => `${f.title} ${f.file ?? ""}`),
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}
