import { describe, expect, it } from "vitest";
import {
  buildMatrix, cellKey, PRIORITIES, STATUS_GROUPS, UNCATEGORISED,
  type BugIssue,
} from "@/lib/vbBugsRules";

const issue = (over: Partial<BugIssue> = {}): BugIssue => ({
  key: "VB-1", summary: "", status: "BACKLOG", statusCategory: "待辦事項",
  priority: "Medium", product: "Manager", updated: null, url: "", ...over,
});

describe("buildMatrix", () => {
  it("依產品 × 狀態分組 × 優先度歸位", () => {
    const m = buildMatrix([
      issue({ key: "VB-1", status: "BACKLOG", priority: "Urgent" }),
      issue({ key: "VB-2", status: "READY FOR DEV", priority: "Urgent" }),
      issue({ key: "VB-3", status: "IN CODE REVIEW", priority: "Medium" }),
    ]);
    const p = m.products.find((x) => x.name === "Manager")!;
    expect(p.total).toBe(3);
    // BACKLOG 與 READY FOR DEV 同屬「待處理」，所以同一格
    expect(p.cells[cellKey("todo", "Urgent")].count).toBe(2);
    expect(p.cells[cellKey("in_progress", "Medium")].count).toBe(1);
  });

  it("VB 的實際狀態名有對上 —— 舊 VSFT 的拼法不能用", () => {
    const m = buildMatrix([
      issue({ key: "A", status: "進行中" }),                    // 不是 In Progress
      issue({ key: "B", status: "STAGE READY(READY FOR QA)" }), // 括號前沒空格
      issue({ key: "C", status: "Pending" }),                   // 不是 PENDING
    ]);
    expect(m.unmappedStatuses).toEqual({});
    const p = m.products[0];
    expect(p.cells[cellKey("in_progress", "Medium")].count).toBe(1);
    expect(p.cells[cellKey("verifying", "Medium")].count).toBe(1);
    expect(p.cells[cellKey("on_hold", "Medium")].count).toBe(1);
  });

  it("舊 VSFT 的拼法會落到未歸類，不會被靜靜吞掉", () => {
    const m = buildMatrix([
      issue({ key: "A", status: "Open" }),
      issue({ key: "B", status: "In Progress" }),
      issue({ key: "C", status: "STAGE READY (READY FOR QA)" }),
    ]);
    expect(m.unmappedStatuses).toEqual({
      "Open": 1, "In Progress": 1, "STAGE READY (READY FOR QA)": 1,
    });
    expect(m.products).toEqual([]); // 沒有一筆進得了表
  });

  it("沒填產品的歸（未分類）", () => {
    const m = buildMatrix([issue({ product: "" }), issue({ key: "VB-2", product: UNCATEGORISED })]);
    expect(m.products.map((p) => p.name)).toEqual([UNCATEGORISED]);
    expect(m.products[0].total).toBe(2);
  });

  it("不認識的優先度當成 Medium，不要整筆消失", () => {
    const m = buildMatrix([issue({ priority: "Trivial" })]);
    expect(m.products[0].cells[cellKey("todo", "Medium")].count).toBe(1);
  });

  it("每一格都留著是哪幾張票（頁面要展開）", () => {
    const m = buildMatrix([issue({ key: "VB-42" })]);
    expect(m.products[0].cells[cellKey("todo", "Medium")].issues[0].key).toBe("VB-42");
  });

  it("空清單不會爆", () => {
    expect(buildMatrix([])).toEqual({ products: [], unmappedStatuses: {} });
  });
});

describe("分組表本身", () => {
  it("同一個狀態不會出現在兩組（會讓計數飄移）", () => {
    const seen = new Set<string>();
    for (const g of STATUS_GROUPS) {
      for (const s of g.statuses) {
        expect(seen.has(s), `${s} 重複出現`).toBe(false);
        seen.add(s);
      }
    }
  });

  it("優先度的 key 不重複", () => {
    expect(new Set(PRIORITIES.map((p) => p.key)).size).toBe(PRIORITIES.length);
  });
});
