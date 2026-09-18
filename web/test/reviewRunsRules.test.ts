import { describe, expect, it } from "vitest";
import {
  countBySeverity, latestPerBranch, matchesReviewQuery,
  type ReviewFinding, type ReviewRun,
} from "@/lib/reviewRunsRules";

const finding = (o: Partial<ReviewFinding>): ReviewFinding => ({
  severity: "MUST", title: "t", detail: "d", evidence: "e",
  file: null, line: null, confidence: null, suggestion: null, ...o,
});

const run = (o: Partial<ReviewRun> & { id: string }): ReviewRun => ({
  startedAt: "2026-09-18T00:00:00Z", finishedAt: "2026-09-18T00:01:00Z",
  engine: "codex", model: null, repo: "r", repoRoot: "/x/r", branch: "main",
  head: "abc", base: "origin/main", scope: "wip",
  onDefaultBranch: false, diffTruncated: false, sensitiveFilesTouched: [],
  costUsd: null, verdict: "ready", summary: "s", findings: [],
  blockers: [], claims_without_tests: [], unresolved_questions: [], ...o,
});

describe("countBySeverity", () => {
  it("四級各自數，沒有的是 0", () => {
    expect(
      countBySeverity([finding({}), finding({ severity: "SHOULD" }), finding({ severity: "SHOULD" })])
    ).toEqual({ MUST: 1, SHOULD: 2, NIT: 0, QUESTION: 0 });
  });
});

describe("latestPerBranch — 同一條線只留最後一次", () => {
  it("用 repoRoot＋branch 當 key，留 id 最大的那筆", () => {
    const out = latestPerBranch([
      run({ id: "20260918-090000", branch: "a" }),
      run({ id: "20260918-100000", branch: "a" }),
      run({ id: "20260918-080000", branch: "b" }),
    ]);
    expect(out.map((r) => r.id)).toEqual(["20260918-100000", "20260918-080000"]);
  });

  it("同名分支但不同 repo 不能被併掉", () => {
    const out = latestPerBranch([
      run({ id: "20260918-090000", repoRoot: "/x/one", branch: "main" }),
      run({ id: "20260918-080000", repoRoot: "/x/two", branch: "main" }),
    ]);
    expect(out).toHaveLength(2);
  });
});

describe("matchesReviewQuery", () => {
  const r = run({
    id: "20260918-090000", repo: "ragdoll-cat", branch: "jay/vb-2192",
    summary: "改動看起來沒問題", findings: [finding({ title: "除數為 0", file: "calc.py" })],
  });

  it("repo／分支／摘要／finding 標題／檔名都搜得到", () => {
    for (const q of ["ragdoll", "vb-2192", "沒問題", "除數", "calc.py", "codex"]) {
      expect(matchesReviewQuery(r, q), q).toBe(true);
    }
  });

  it("空字串全通過；搜不到就是 false", () => {
    expect(matchesReviewQuery(r, "   ")).toBe(true);
    expect(matchesReviewQuery(r, "zzz")).toBe(false);
  });
});
