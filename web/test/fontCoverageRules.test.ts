import { describe, expect, it } from "vitest";
import { fontCoverage, fontTables, hasCodePoint } from "@/lib/fontCoverageRules";

/**
 * 自己組一份最小的字型：表目錄 ＋ 一張 cmap。
 * **不拿工作區裡的真字型當 fixture** —— 那些檔在別的 repo，搬走或改版測試就壞了，
 * 而且「為什麼紅」會變得很難查。
 */
function buildFont(sub: Uint8Array): ArrayBuffer {
  const dirLen = 12 + 16; // 一張表
  const buf = new ArrayBuffer(dirLen + sub.length + 4);
  const v = new DataView(buf);
  v.setUint32(0, 0x00010000); // sfnt version
  v.setUint16(4, 1); // numTables
  // 表紀錄：tag 'cmap'
  for (const [i, c] of [..."cmap"].entries()) v.setUint8(12 + i, c.charCodeAt(0));
  v.setUint32(12 + 8, dirLen); // offset
  v.setUint32(12 + 12, sub.length + 4); // length
  // cmap 標頭：version(2) numTables(2) ＋ 一筆 encoding record
  const cmapAt = dirLen;
  v.setUint16(cmapAt, 0);
  v.setUint16(cmapAt + 2, 1);
  new Uint8Array(buf).set(sub, cmapAt + 4);
  return buf;
}

/** encoding record（8 byte）＋ format 4 子表，涵蓋 [start, end] */
function format4(start: number, end: number): Uint8Array {
  const segs = [
    [start, end],
    [0xffff, 0xffff],
  ];
  const segX2 = segs.length * 2;
  const len = 16 + segX2 * 4;
  const out = new Uint8Array(8 + len);
  const v = new DataView(out.buffer);
  v.setUint16(0, 3); // platform
  v.setUint16(2, 1); // encoding
  // 子表位移是**從 cmap 表開頭**算的：4（標頭）＋ 8（這筆 record）= 12
  v.setUint32(4, 12);
  const s = 8;
  v.setUint16(s, 4);
  v.setUint16(s + 2, len);
  v.setUint16(s + 4, 0);
  v.setUint16(s + 6, segX2);
  segs.forEach(([, e], i) => v.setUint16(s + 14 + i * 2, e));
  v.setUint16(s + 14 + segX2, 0);
  segs.forEach(([st], i) => v.setUint16(s + 16 + segX2 + i * 2, st));
  segs.forEach((_, i) => v.setUint16(s + 16 + segX2 * 2 + i * 2, 1)); // idDelta=1 → 有字
  segs.forEach((_, i) => v.setUint16(s + 16 + segX2 * 3 + i * 2, 0)); // idRangeOffset=0
  return out;
}

/** encoding record ＋ format 12 子表，涵蓋 [start, end]（含增補平面） */
function format12(start: number, end: number): Uint8Array {
  const len = 16 + 12;
  const out = new Uint8Array(8 + len);
  const v = new DataView(out.buffer);
  v.setUint16(0, 3);
  v.setUint16(2, 10);
  v.setUint32(4, 12);
  const s = 8;
  v.setUint16(s, 12);
  v.setUint32(s + 4, len);
  v.setUint32(s + 12, 1); // nGroups
  v.setUint32(s + 16, start);
  v.setUint32(s + 20, end);
  v.setUint32(s + 24, 1); // startGlyphID
  return out;
}

describe("fontTables", () => {
  it("讀得到表目錄", () => {
    const t = fontTables(buildFont(format4(0x41, 0x5a)));
    expect(t.has("cmap")).toBe(true);
  });

  it("壞掉／太短的檔不會炸，回空的", () => {
    expect(fontTables(new ArrayBuffer(4)).size).toBe(0);
    expect(fontCoverage(new ArrayBuffer(0))).toEqual([]);
  });
});

describe("fontCoverage", () => {
  it("只含拉丁字母的字型：只報 latin", () => {
    expect(fontCoverage(buildFont(format4(0x41, 0x5a)))).toEqual(["latin"]);
  });

  it("含漢字的字型會報 cjk", () => {
    const cov = fontCoverage(buildFont(format4(0x4e00, 0x9fff)));
    expect(cov).toContain("cjk");
    expect(cov).not.toContain("latin");
  });

  it("format 12 才涵蓋得到的增補平面（emoji）", () => {
    expect(fontCoverage(buildFont(format12(0x1f300, 0x1faff)))).toContain("emoji");
  });

  it("範圍外的碼位要回 false，不是「有就算有」", () => {
    const buf = buildFont(format4(0x41, 0x5a));
    const cmap = fontTables(buf).get("cmap")!;
    expect(hasCodePoint(buf, cmap, 0x41)).toBe(true);
    expect(hasCodePoint(buf, cmap, 0x61)).toBe(false); // 小寫 a 不在 [A-Z]
    expect(hasCodePoint(buf, cmap, 0x4e2d)).toBe(false);
  });
});
