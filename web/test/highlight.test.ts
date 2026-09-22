import { describe, expect, it } from "vitest";
import hljs from "@/lib/highlight";
import { LANG, languageOf } from "@/lib/changesRules";

/**
 * 副檔名表裡的每個語言都要真的註冊得起來。
 *
 * 沒對上的話畫面不會壞（上色失敗會被吞掉），但 highlight.js 會在丟例外**之前**
 * 印一行 console.error，Next 的錯誤浮層就會一直跳。加新副檔名時這條會抓到。
 *
 * ⚠️ 不要寫「直接問 `highlight.js/lib/common` 應該抓不到」當對照組 ——
 * `lib/highlight.ts` 的 `registerLanguage` 就是註冊在**那個單例**上，
 * 兩邊是同一個物件，對照組永遠成立、等於什麼都沒驗（寫過，回傳 `[]`）。
 * 這批斷言是用變異驗的：拿掉一行 `registerLanguage` 就會紅。
 */
const NAMES = [
  ...new Set([
    ...Object.values(LANG),
    languageOf("Dockerfile")!,
    languageOf(".env.example")!,
  ]),
];

describe("highlight 的語言表", () => {
  it.each(NAMES)("%s 有註冊", (name) => {
    expect(hljs.getLanguage(name)).toBeTruthy();
  });

  it("表裡有那三個 common 沒附的（dart / groovy / dockerfile）", () => {
    for (const n of ["dart", "groovy", "dockerfile"]) expect(NAMES).toContain(n);
  });
});
