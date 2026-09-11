import { describe, expect, it } from "vitest";
import { sortProducts, UNCATEGORISED } from "@/lib/vbBugsRules";

const P = (name: string, total: number) => ({ name, total });

describe("sortProducts", () => {
  const base = [P("Manager", 110), P("myViewBoard", 59), P(UNCATEGORISED, 22), P("AirSync", 20)];

  it("沒 pin 時照總數由多到少", () => {
    expect(sortProducts(base, []).map((p) => p.name))
      .toEqual(["Manager", "myViewBoard", "AirSync", UNCATEGORISED]);
  });

  it("（未分類）永遠墊底，即使它比別人多", () => {
    const many = [P(UNCATEGORISED, 999), P("Hub", 1)];
    expect(sortProducts(many, []).map((p) => p.name)).toEqual(["Hub", UNCATEGORISED]);
  });

  it("pin 住的排前面，順序照 pin 的順序（不是總數）", () => {
    expect(sortProducts(base, ["AirSync", "myViewBoard"]).map((p) => p.name))
      .toEqual(["AirSync", "myViewBoard", "Manager", UNCATEGORISED]);
  });

  it("pin（未分類）也會被拉到前面 —— pin 的意思就是我要先看到它", () => {
    expect(sortProducts(base, [UNCATEGORISED])[0].name).toBe(UNCATEGORISED);
  });

  it("pin 到不存在的產品不影響其他排序", () => {
    expect(sortProducts(base, ["不存在的東西"]).map((p) => p.name))
      .toEqual(["Manager", "myViewBoard", "AirSync", UNCATEGORISED]);
  });

  it("不改動傳進來的陣列", () => {
    const input = [...base];
    sortProducts(input, ["AirSync"]);
    expect(input.map((p) => p.name)).toEqual(base.map((p) => p.name));
  });
});
