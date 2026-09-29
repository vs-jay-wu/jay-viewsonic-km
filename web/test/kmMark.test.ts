import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/**
 * 側邊欄的標記與分頁圖示必須長得一樣。
 *
 * 兩邊是兩個檔（Next 的 metadata 圖示網址帶雜湊，前端引用不到），所以只能靠
 * 這條把色碼與 path 釘住 —— 不然改了一邊，另一邊會安靜地繼續用舊的樣子。
 */
const root = path.resolve(__dirname, "..");
const svg = readFileSync(path.join(root, "app/(km)/icon.svg"), "utf8");
const tsx = readFileSync(path.join(root, "components/KmMark.tsx"), "utf8");

const pick = (src: string, re: RegExp) => {
  const m = re.exec(src);
  expect(m, `在 ${src.length} 字的檔案裡找不到 ${re}`).toBeTruthy();
  return m![1];
};

describe("KmMark 與 app/(km)/icon.svg", () => {
  it("底色相同", () => {
    expect(pick(tsx, /rect[^>]*fill="(#[0-9a-f]{6})"/i)).toBe(
      pick(svg, /<rect[^>]*fill="(#[0-9a-f]{6})"/i)
    );
  });

  it("線條顏色相同", () => {
    expect(pick(tsx, /stroke="(#[0-9a-f]{6})"/i)).toBe(pick(svg, /stroke="(#[0-9a-f]{6})"/i));
  });

  it("path 的 d 相同", () => {
    expect(pick(tsx, /d="([^"]+)"/)).toBe(pick(svg, /d="([^"]+)"/));
  });
});
