import { describe, expect, it } from "vitest";
import { foldRanges, hiddenLines, xmlFoldRanges,
} from "@/lib/foldRules";

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

describe("xmlFoldRanges", () => {
  it("跨行的元素可以收，同一行開關的不算", () => {
    expect(xmlFoldRanges(L("<a>\n  <b>x</b>\n</a>"))).toEqual([{ start: 0, end: 2 }]);
  });

  it("巢狀的每一層都算", () => {
    const src = L("<a>\n  <b>\n    <c/>\n  </b>\n</a>");
    expect(xmlFoldRanges(src)).toEqual([
      { start: 0, end: 4 },
      { start: 1, end: 3 },
    ]);
  });

  it("自閉標籤、宣告、DOCTYPE 都不是開標籤", () => {
    expect(xmlFoldRanges(L('<?xml version="1.0"?>\n<!DOCTYPE x>\n<a/>\n<b />'))).toEqual([]);
  });

  it("屬性裡的 `/` 不會被當成自閉（路徑很常見）", () => {
    expect(xmlFoldRanges(L('<a href="x/y">\n1\n</a>'))).toEqual([{ start: 0, end: 2 }]);
  });

  it("註解裡的標籤不參與配對（含跨行註解）", () => {
    expect(xmlFoldRanges(L("<!--\n<a>\n-->\n<b>\n1\n</b>"))).toEqual([{ start: 3, end: 5 }]);
  });

  it("對不起來的收標籤丟掉，不要硬配", () => {
    expect(xmlFoldRanges(L("</x>\n<a>\n1\n</a>"))).toEqual([{ start: 1, end: 3 }]);
  });
});
