import { describe, expect, it } from "vitest";
import { foldRanges, hiddenLines } from "@/lib/foldRules";

const L = (s: string) => s.split("\n");

describe("foldRanges", () => {
  it("一層物件", () => {
    expect(foldRanges(L('{\n  "a": 1\n}'))).toEqual([{ start: 0, end: 2 }]);
  });

  it("巢狀的每一層都可以收", () => {
    const src = L('{\n  "a": {\n    "b": 1\n  }\n}');
    expect(foldRanges(src)).toEqual([
      { start: 0, end: 4 },
      { start: 1, end: 3 },
    ]);
  });

  it("同一行就結束的不算（收起來也不會少佔一行）", () => {
    expect(foldRanges(L('{ "a": 1 }'))).toEqual([]);
  });

  it("字串裡的括號不算", () => {
    // 不處理的話這裡會多出一段假的，收起來會把後面的內容藏掉
    expect(foldRanges(L('{\n  "a": "}{[",\n  "b": 1\n}'))).toEqual([{ start: 0, end: 3 }]);
  });

  it("跳脫的引號不會讓字串沒收掉", () => {
    // `"\\""` 之後仍在字串外；漏處理的話後面整份都被當字串，一段都收不到
    expect(foldRanges(L('{\n  "a": "say \\"hi\\"",\n  "b": [\n    1\n  ]\n}'))).toEqual([
      { start: 0, end: 5 },
      { start: 2, end: 4 },
    ]);
  });

  it("陣列跟物件一樣", () => {
    expect(foldRanges(L("[\n  1,\n  2\n]"))).toEqual([{ start: 0, end: 3 }]);
  });

  it("一行開兩層時只留最外面那一層（一行一個把手）", () => {
    const src = L('{\n  "a": [{\n    "b": 1\n  }]\n}');
    expect(foldRanges(src)).toEqual([
      { start: 0, end: 4 },
      { start: 1, end: 3 },
    ]);
  });

  it("括號不成對就當作沒有那一段，不要硬湊", () => {
    expect(foldRanges(L('{\n  "a": 1'))).toEqual([]);
    expect(foldRanges(L('  "a": 1\n}'))).toEqual([]);
  });

  it("空檔案不會炸", () => {
    expect(foldRanges([])).toEqual([]);
  });
});

describe("hiddenLines", () => {
  const ranges = [
    { start: 0, end: 4 },
    { start: 1, end: 3 },
  ];

  it("收起來的區段藏內容，起始行留著", () => {
    expect([...hiddenLines(ranges, new Set([1]))]).toEqual([2, 3]);
  });

  it("收外層就整段藏起來（內層收沒收都一樣）", () => {
    expect([...hiddenLines(ranges, new Set([0]))]).toEqual([1, 2, 3, 4]);
  });

  it("沒收就什麼都不藏", () => {
    expect(hiddenLines(ranges, new Set()).size).toBe(0);
  });
});
