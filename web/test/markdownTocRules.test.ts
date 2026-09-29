import { describe, expect, it } from "vitest";
import { dedupe, slugify } from "@/lib/markdownTocRules";

describe("slugify", () => {
  it("中文標題的 slug 不能變成空字串（只留 a-z0-9 的話會全部互撞）", () => {
    expect(slugify("第一章：開始")).toBe("第一章開始");
    expect(slugify("四階接觸面積閾值未測量 — 白板 port 切片 S2")).toBe(
      "四階接觸面積閾值未測量-白板-port-切片-s2"
    );
  });

  it("英文照 GitHub 的樣子：小寫、空白換 -、標點丟掉", () => {
    expect(slugify("Hello World!")).toBe("hello-world");
    expect(slugify("`code` and **bold**")).toBe("code-and-bold");
  });
});

describe("dedupe", () => {
  it("同名標題加序號，第一個不加", () => {
    const seen = new Map<string, number>();
    expect([dedupe("x", seen), dedupe("x", seen), dedupe("x", seen)]).toEqual(["x", "x-1", "x-2"]);
  });

  it("不同名各自從 0 開始", () => {
    const seen = new Map<string, number>();
    expect([dedupe("a", seen), dedupe("b", seen), dedupe("a", seen)]).toEqual(["a", "b", "a-1"]);
  });
});
