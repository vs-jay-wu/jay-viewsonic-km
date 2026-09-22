import { describe, expect, it } from "vitest";
import { combine, shouldRefetch } from "@/lib/gitFingerprintRules";

describe("combine", () => {
  it("同樣的輸入給同樣的值", () => {
    expect(combine(["a", "b"])).toBe(combine(["a", "b"]));
  });

  it("任何一個片段變了，值就變", () => {
    const base = combine(["HEAD:abc", "index:100:200"]);
    expect(combine(["HEAD:abd", "index:100:200"])).not.toBe(base);
    expect(combine(["HEAD:abc", "index:100:201"])).not.toBe(base);
  });

  it("片段的切法不同也要不同值", () => {
    // 沒有分隔符的話 ["ab","c"] 與 ["a","bc"] 會壓成同一個字串，
    // 「檔名結尾的字元跑到下一段開頭」這種改動就會被漏掉
    expect(combine(["ab", "c"])).not.toBe(combine(["a", "bc"]));
  });

  it("順序不同就是不同（呼叫端要自己排序才穩定）", () => {
    expect(combine(["a", "b"])).not.toBe(combine(["b", "a"]));
  });

  it("空清單也有值，不會炸", () => {
    expect(typeof combine([])).toBe("string");
  });
});

describe("shouldRefetch", () => {
  it("第一次拿到不算變動", () => {
    // 進頁面時資料與指紋是一起來的，當成變動會多打一次全掃
    expect(shouldRefetch(null, "x")).toBe(false);
  });

  it("一樣就不動", () => {
    expect(shouldRefetch("x", "x")).toBe(false);
  });

  it("不一樣才重抓", () => {
    expect(shouldRefetch("x", "y")).toBe(true);
  });
});
