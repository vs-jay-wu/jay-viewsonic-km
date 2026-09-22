import { readFileSync, readdirSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/*
 * `docs/assets/icons/*.svg` 是從 `components/Icon.tsx` 產出來的
 * （`scripts/gen-doc-favicons.py`）。這支測試重跑同一段擷取並比對磁碟上的檔。
 *
 * **為什麼需要**：手上有兩份同樣的圖形資料，改了 Icon.tsx 之後 favicon 不會跟著變，
 * 而且沒有任何徵兆 —— 清單上是新圖、分頁上是舊圖。漂移時這裡會紅，訊息會告訴你
 * 重跑產生器。
 */
const ROOT = path.resolve(__dirname, "../..");
const ICON_TSX = path.join(ROOT, "web/components/Icon.tsx");
const ICON_DIR = path.join(ROOT, "docs/assets/icons");

function bodyOf(src: string, name: string): string {
  const m = new RegExp(`^\\s+${name}: <>([\\s\\S]*?)</>,\\s*$`, "m").exec(src);
  if (!m) throw new Error(`Icon.tsx 裡找不到 ${name}`);
  return m[1].trim();
}

describe("文件的 favicon 與 Icon.tsx 不能漂移", () => {
  const src = readFileSync(ICON_TSX, "utf8");
  const files = readdirSync(ICON_DIR).filter((f) => f.endsWith(".svg"));

  it("產出的檔不是空的", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files)("%s 的圖形與 Icon.tsx 一致", (file) => {
    const name = file.replace(/\.svg$/, "");
    const svg = readFileSync(path.join(ICON_DIR, file), "utf8");
    // 產生器唯一會改寫的是 `currentColor`（獨立 SVG 沒有繼承來源），比對前套同一條
    const expected = bodyOf(src, name).replace(/currentColor/g, "var(--c)");
    expect(svg, `${file} 與 Icon.tsx 不一致 —— 重跑 ./scripts/gen-doc-favicons.py`)
      .toContain(expected);
  });

  it("每個 svg 都自帶顏色（favicon 沒有 currentColor 可以繼承）", () => {
    for (const f of files) {
      const svg = readFileSync(path.join(ICON_DIR, f), "utf8");
      expect(svg, f).toContain("prefers-color-scheme: dark");
      expect(svg, f).not.toContain("currentColor");
    }
  });
});
