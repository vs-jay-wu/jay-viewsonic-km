import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * av-streaming 與 km 是掛在同一個 Next app 裡的**兩套系統**（見 `app/(av)/layout.tsx`）。
 * 邊界靠慣例維持，而慣例只要沒人守就會漏，所以在這裡釘住三件事：
 *
 * 1. av 的內部連結一定要帶 `/av-streaming` 前綴 —— 漏掉會安靜地跳到 km 的路由
 *    （例如 `/glossary` 在 km 是 404，`/repos` 則會直接把人丟進 km 工作台）
 * 2. av **不可以**連回 km —— Jay 要的是單向：km 開新分頁過去，那邊沒有回頭路
 * 3. av 不可以 import km 的 UI（`@/components`）—— 兩邊設計系統是分開的
 *
 * 這三條都是「壞掉時不會有錯誤訊息」的那種，所以值得用測試而不是靠記憶。
 */

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AV_DIRS = [path.join(WEB_ROOT, "av"), path.join(WEB_ROOT, "app", "(av)")];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const FILES = AV_DIRS.flatMap(sourceFiles).map((f) => ({
  rel: path.relative(WEB_ROOT, f),
  text: readFileSync(f, "utf8"),
}));

/** `href="/x"`、`href={`/x`}`、`href: '/x'` 三種寫法的路徑部分 */
const HREF_PATTERNS = [
  /href="(\/[^"]*)"/g,
  /href=\{`(\/[^`$]*)/g,
  /href:\s*'(\/[^']*)'/g,
];

function internalHrefs(text: string): string[] {
  const found: string[] = [];
  for (const re of HREF_PATTERNS) {
    for (const m of text.matchAll(re)) found.push(m[1]);
  }
  return found;
}

describe("av-streaming 的邊界", () => {
  it("掃得到 av 的原始碼（路徑寫錯的話下面的檢查會全部空過）", () => {
    expect(FILES.length).toBeGreaterThan(20);
  });

  it("所有內部連結都帶 /av-streaming 前綴", () => {
    const offenders: string[] = [];
    for (const { rel, text } of FILES) {
      for (const href of internalHrefs(text)) {
        if (href === "/av-streaming" || href.startsWith("/av-streaming/")) continue;
        offenders.push(`${rel}: ${href}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("沒有任何連回 km 的路徑", () => {
    // km 的路由一覽（app/(km)/ 底下那些）。av 連到這些就是把兩套系統接起來了
    const kmRoutes = [
      "/repos", "/sessions", "/tickets", "/my-prs", "/vb-bugs",
      "/pr-inbox", "/repo-sync", "/memory", "/chat",
    ];
    const offenders: string[] = [];
    for (const { rel, text } of FILES) {
      for (const href of internalHrefs(text)) {
        if (kmRoutes.some((r) => href === r || href.startsWith(`${r}/`))) {
          offenders.push(`${rel}: ${href}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("不 import km 的 UI 元件", () => {
    // `@/lib/repo` 這種純 server 工具是可以的（repo 根只該有一個答案），
    // 但元件與樣式必須各自獨立
    const offenders = FILES.filter(({ text }) =>
      /from ['"]@\/(components|app)\//.test(text)
    ).map(({ rel }) => rel);
    expect(offenders).toEqual([]);
  });
});

describe("km 不會用 client-side 導覽跳進 av", () => {
  it("km 連到 /av-streaming 時一定帶 target=_blank", () => {
    const kmFiles = [
      ...sourceFiles(path.join(WEB_ROOT, "app", "(km)")),
      ...sourceFiles(path.join(WEB_ROOT, "components")),
    ].map((f) => ({ rel: path.relative(WEB_ROOT, f), text: readFileSync(f, "utf8") }));

    const offenders: string[] = [];
    for (const { rel, text } of kmFiles) {
      if (!text.includes("/av-streaming")) continue;
      // 出現 av-streaming 的檔案裡，必須看得到 target="_blank"
      if (!text.includes('target="_blank"')) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});
