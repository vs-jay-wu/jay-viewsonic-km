import { describe, expect, it } from "vitest";
import {
  findItemBySession, prDecisionLabel, prStateStyle, sortWorkItems,
  type IndexedPr, type WorkItem,
} from "@/lib/workIndexRules";

const pr = (o: Partial<IndexedPr> & { number: number }): IndexedPr => ({
  repo: "Viewsonic-EDU/edu-droid-flutter",
  title: "[Task VB-1945] 字體",
  url: `https://github.com/Viewsonic-EDU/edu-droid-flutter/pull/${o.number}`,
  state: "OPEN", updatedAt: "2026-09-11T00:00:00.000Z", reviewDecision: null, ...o,
});

const item = (o: Partial<WorkItem> & { key: string }): WorkItem => ({
  ticketKey: o.key.startsWith("PR:") ? null : o.key,
  ticketGuessed: false, sessions: [], prs: [], latestAt: "2026-09-11T00:00:00.000Z", ...o,
});

const session = (id: string) => ({
  id, title: "[km/mvbf] VB-1945", cwd: "/x", repo: "edu-droid-flutter",
  modifiedAt: "2026-09-11T00:00:00.000Z", pinned: false,
});

describe("findItemBySession", () => {
  const items = [
    item({ key: "VB-1945", sessions: [session("aaa"), session("bbb")] }),
    item({ key: "VSFT-9718", sessions: [session("ccc")] }),
  ];

  it("找得到掛著這個 session 的工作項目", () => {
    expect(findItemBySession(items, "bbb")?.key).toBe("VB-1945");
    expect(findItemBySession(items, "ccc")?.key).toBe("VSFT-9718");
  });

  it("沒掛上任何項目的 session 回 undefined（標題不符合慣例就是這樣）", () => {
    expect(findItemBySession(items, "zzz")).toBeUndefined();
    expect(findItemBySession([], "aaa")).toBeUndefined();
  });
});

describe("prStateStyle", () => {
  it("只有 open 亮色，merged／closed 是背景資訊", () => {
    expect(prStateStyle("OPEN").cls).toContain("emerald");
    expect(prStateStyle("MERGED").cls).toContain("violet");
    expect(prStateStyle("CLOSED").cls).toContain("gray");
  });

  it("標籤是小寫的狀態字", () => {
    expect(prStateStyle("OPEN").label).toBe("open");
    expect(prStateStyle("MERGED").label).toBe("merged");
    expect(prStateStyle("CLOSED").label).toBe("closed");
  });
});

describe("prDecisionLabel", () => {
  it("open 的 PR 上，review 結論比狀態更有資訊量", () => {
    expect(prDecisionLabel(pr({ number: 1, reviewDecision: "APPROVED" }))).toBe("approved");
    expect(prDecisionLabel(pr({ number: 2, reviewDecision: "CHANGES_REQUESTED" }))).toBe("要求修改");
  });

  it("還沒有結論就不顯示", () => {
    expect(prDecisionLabel(pr({ number: 3, reviewDecision: null }))).toBeNull();
    expect(prDecisionLabel(pr({ number: 4, reviewDecision: "REVIEW_REQUIRED" }))).toBeNull();
  });

  it("merged／closed 一律不顯示 —— 那時候 review 結論已經沒有意義", () => {
    expect(prDecisionLabel(pr({ number: 5, state: "MERGED", reviewDecision: "APPROVED" }))).toBeNull();
    expect(prDecisionLabel(pr({ number: 6, state: "CLOSED", reviewDecision: "CHANGES_REQUESTED" }))).toBeNull();
  });
});

describe("sortWorkItems", () => {
  it("有動靜的排前面；同時間時有 PR 的優先", () => {
    const a = item({ key: "A", latestAt: "2026-09-10T00:00:00.000Z" });
    const b = item({ key: "B", latestAt: "2026-09-11T00:00:00.000Z" });
    const c = item({ key: "C", latestAt: "2026-09-11T00:00:00.000Z", prs: [pr({ number: 9 })] });
    expect(sortWorkItems([a, b, c]).map((x) => x.key)).toEqual(["C", "B", "A"]);
  });
});
