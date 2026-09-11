import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIEW, UNCATEGORISED, applyView, groupByProduct, groupKeyOf, issueTypeStyle,
  matchesTicketQuery, priorityIndexOf, sortBy, sortTickets, type MyTicket,
} from "@/lib/myTicketsRules";

// 狀態與 issueType 逐字取自實際抓到的 VB 單
const t = (o: Partial<MyTicket> & { key: string }): MyTicket => ({
  summary: "某個問題", status: "BACKLOG", statusCategory: "待辦事項",
  priority: "Medium", issueType: "漏洞", product: "myViewBoard",
  updated: "2026-09-01T00:00:00.000+0800",
  url: `https://viewsonic-vsi.atlassian.net/browse/${o.key}`, ...o,
});

const SAMPLE: MyTicket[] = [
  t({ key: "VB-2158", status: "READY FOR DEV", priority: "High", updated: "2026-09-05T00:00:00.000+0800" }),
  t({ key: "VB-2169", status: "IN CODE REVIEW", priority: "Medium", updated: "2026-09-09T00:00:00.000+0800" }),
  t({ key: "VB-2098", status: "Pending", priority: "Urgent", updated: "2026-09-10T00:00:00.000+0800" }),
  t({ key: "VB-999", status: "BACKLOG", priority: "Low", updated: "2026-09-02T00:00:00.000+0800" }),
];

describe("分組", () => {
  it("狀態對得到分組", () => {
    expect(groupKeyOf("IN CODE REVIEW")).toBe("in_progress");
    expect(groupKeyOf("STAGE READY(READY FOR QA)")).toBe("verifying");
    expect(groupKeyOf("Pending")).toBe("on_hold");
  });

  it("沒列進分組表的狀態回 null（代表 VB 加了新狀態）", () => {
    expect(groupKeyOf("SOMETHING NEW")).toBeNull();
  });

  it("預設排序：進行中在前、擱置墊底", () => {
    expect(sortTickets(SAMPLE).map((x) => x.key)).toEqual(["VB-2169", "VB-2158", "VB-999", "VB-2098"]);
  });
});

describe("sortBy", () => {
  it("最近更新／最久沒動", () => {
    expect(sortBy(SAMPLE, "updated").map((x) => x.key)).toEqual(["VB-2098", "VB-2169", "VB-2158", "VB-999"]);
    expect(sortBy(SAMPLE, "updatedAsc").map((x) => x.key)).toEqual(["VB-999", "VB-2158", "VB-2169", "VB-2098"]);
  });

  it("優先度：Urgent → Low，同級照最近更新", () => {
    expect(sortBy(SAMPLE, "priority").map((x) => x.priority))
      .toEqual(["Urgent", "High", "Medium", "Low"]);
    expect(priorityIndexOf("Urgent")).toBeLessThan(priorityIndexOf("Low"));
  });

  it("認不得的優先度排最後，不是排最前面", () => {
    const odd = [...SAMPLE, t({ key: "VB-1", priority: "沒看過的" })];
    expect(sortBy(odd, "priority").at(-1)?.key).toBe("VB-1");
  });

  it("單號照數字比，VB-999 不會排到 VB-1000 後面", () => {
    const list = [t({ key: "VB-999" }), t({ key: "VB-1000" })];
    expect(sortBy(list, "key").map((x) => x.key)).toEqual(["VB-1000", "VB-999"]);
  });
});

describe("applyView", () => {
  it("預設不過濾任何東西", () => {
    expect(applyView(SAMPLE, DEFAULT_VIEW)).toHaveLength(4);
  });

  it("依分組過濾", () => {
    expect(applyView(SAMPLE, { ...DEFAULT_VIEW, groups: ["on_hold"] }).map((x) => x.key))
      .toEqual(["VB-2098"]);
  });

  it("依優先度過濾（多選是聯集）", () => {
    expect(applyView(SAMPLE, { ...DEFAULT_VIEW, priorities: ["Urgent", "Low"] }).map((x) => x.key))
      .toEqual(["VB-999", "VB-2098"]);
  });

  it("搜尋與過濾是交集", () => {
    expect(applyView(SAMPLE, { ...DEFAULT_VIEW, query: "VB-2098", groups: ["in_progress"] }))
      .toEqual([]);
  });

  it("有選分組時，沒歸到分組的狀態不顯示", () => {
    const odd = [...SAMPLE, t({ key: "VB-7", status: "SOMETHING NEW" })];
    expect(applyView(odd, { ...DEFAULT_VIEW, groups: ["todo"] }).map((x) => x.key))
      .not.toContain("VB-7");
  });

  it("過濾之後仍照選定的排序", () => {
    expect(applyView(SAMPLE, { ...DEFAULT_VIEW, sort: "updated", groups: ["todo", "in_progress"] })
      .map((x) => x.key)).toEqual(["VB-2169", "VB-2158", "VB-999"]);
  });
});

describe("matchesTicketQuery", () => {
  it("吃單號、標題、狀態、類型", () => {
    const x = t({ key: "VB-2158", summary: "text size is not absolute", status: "READY FOR DEV" });
    expect(matchesTicketQuery(x, "2158")).toBe(true);
    expect(matchesTicketQuery(x, "absolute")).toBe(true);
    expect(matchesTicketQuery(x, "ready")).toBe(true);
    expect(matchesTicketQuery(x, "漏洞")).toBe(true);
  });

  it("多個詞是 AND", () => {
    const x = t({ key: "VB-2158", summary: "text size" });
    expect(matchesTicketQuery(x, "text 2158")).toBe(true);
    expect(matchesTicketQuery(x, "text 9999")).toBe(false);
  });
});

describe("groupByProduct — 照 Jira 的 Project 欄位分群", () => {
  const list: MyTicket[] = [
    t({ key: "VB-1", product: "myViewBoard" }),
    t({ key: "VB-2", product: "Quiz Tool" }),
    t({ key: "VB-3", product: "myViewBoard" }),
    t({ key: "VB-4", product: UNCATEGORISED }),
    t({ key: "VB-5", product: "myViewBoard" }),
  ];

  it("單多的排前面，未分類墊底", () => {
    expect(groupByProduct(list).map((g) => g.product))
      .toEqual(["myViewBoard", "Quiz Tool", UNCATEGORISED]);
  });

  it("每張單只會出現在一個群裡", () => {
    const total = groupByProduct(list).reduce((n, g) => n + g.tickets.length, 0);
    expect(total).toBe(list.length);
  });

  it("沒填 Project 的（空字串）也歸到未分類", () => {
    expect(groupByProduct([t({ key: "VB-9", product: "" })])[0].product).toBe(UNCATEGORISED);
  });
});

describe("issueTypeStyle — 貼近 Jira 的顏色", () => {
  it.each([
    ["漏洞", "bug"], ["Bug", "bug"],
    ["故事", "story"], ["Story", "story"],
    ["Spike", "spike"], ["Ops Task", "ops"],
    ["任務", "task"], ["沒看過的類型", "task"],
  ])("%s → %s", (type, icon) => {
    expect(issueTypeStyle(type).icon).toBe(icon);
  });

  it("漏洞是紅的、任務是藍的", () => {
    expect(issueTypeStyle("漏洞").cls).toContain("red");
    expect(issueTypeStyle("任務").cls).toContain("sky");
  });
});
