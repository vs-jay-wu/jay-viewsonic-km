import { describe, expect, it } from "vitest";
import hljs from "@/lib/highlight";
import { LANG, languageOf, shebangLanguage,
} from "@/lib/changesRules";

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
    languageOf(".gitignore")!,
    languageOf("Makefile")!,
  ]),
];

describe("highlight 的語言表", () => {
  it.each(NAMES)("%s 有註冊", (name) => {
    expect(hljs.getLanguage(name)).toBeTruthy();
  });

  it("表裡有那幾個 common 沒附的（dart / groovy / dockerfile / dos / nginx / properties）", () => {
    for (const n of ["dart", "groovy", "dockerfile", "dos", "nginx", "properties"]) {
      expect(NAMES).toContain(n);
    }
  });

  it("Jay 2026-09-30 指名的那幾種", () => {
    expect(languageOf("gradle.properties")).toBe("properties");
    expect(languageOf("gradlew.bat")).toBe("dos");
    expect(languageOf("nginx/nginx.conf")).toBe("nginx");
    expect(languageOf("deploy/nginx-lodestar.conf")).toBe("nginx");
    expect(languageOf("public/icon.svg")).toBe("xml");
    // Flutter 專案根目錄那個（內容是 YAML），不是通用副檔名
    expect(languageOf(".metadata")).toBe("yaml");
    expect(languageOf("edu-droid-flutter/.metadata")).toBe("yaml");
  });

  it("整個檔名就是「副檔名」的那些也認得（`.gitignore` 之類）", () => {
    expect(languageOf(".gitignore")).toBe("ini");
    expect(languageOf("web/.dockerignore")).toBe("ini");
    expect(languageOf(".gitattributes")).toBe("ini");
    expect(languageOf("Makefile")).toBe("makefile");
    // 大小寫不該影響（`Dockerfile` 與 `dockerfile` 都有人用）
    expect(languageOf("dockerfile")).toBe("dockerfile");
    // 認不得的還是要回 null，不要亂猜一個語言
    expect(languageOf("LICENSE")).toBeNull();
  });

  it("多重副檔名取最後一段（`build.gradle.kts` 是 Kotlin，不是 Groovy）", () => {
    expect(languageOf("build.gradle.kts")).toBe("kotlin");
    expect(languageOf("settings.gradle")).toBe("groovy");
  });
});

describe("shebangLanguage — 沒有副檔名的腳本", () => {
  it("認得常見的直譯器", () => {
    expect(shebangLanguage("#!/bin/sh\nexit 0")).toBe("bash");
    expect(shebangLanguage("#!/usr/bin/env bash\n")).toBe("bash");
    expect(shebangLanguage("#!/usr/bin/env python3\n")).toBe("python");
    expect(shebangLanguage("#!/usr/bin/env node\n")).toBe("javascript");
  });

  it("`env` 後面那個字才是直譯器", () => {
    expect(shebangLanguage("#!/usr/bin/env -S ruby -w\n")).toBeNull();
    expect(shebangLanguage("#!/usr/bin/env ruby\n")).toBe("ruby");
  });

  it("沒有 shebang、或認不得的一律 null（不要猜）", () => {
    expect(shebangLanguage("echo hi\n")).toBeNull();
    expect(shebangLanguage("#!/usr/bin/env fish\n")).toBeNull();
    expect(shebangLanguage("")).toBeNull();
  });

  it("`#!` 一定要在第一行的開頭", () => {
    expect(shebangLanguage("\n#!/bin/sh\n")).toBeNull();
    expect(shebangLanguage("  #!/bin/sh\n")).toBeNull();
  });
});
