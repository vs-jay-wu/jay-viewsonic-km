import { describe, expect, it } from "vitest";
import {
  countByKind, diffStat, languageOf, parseDiff, parseStatus, parseStatusLine,
} from "@/lib/changesRules";

describe("parseStatusLine — 前兩個字元是固定欄位，不能用空白切", () => {
  it("工作區改動（` M`）與已 staged（`M `）分得出來", () => {
    expect(parseStatusLine(" M lib/a.ts")).toEqual({
      path: "lib/a.ts", kind: "modified", staged: false, from: undefined,
    });
    expect(parseStatusLine("M  lib/a.ts")).toMatchObject({ kind: "modified", staged: true });
  });

  it("未追蹤", () => {
    expect(parseStatusLine("?? new.ts")).toEqual({ path: "new.ts", kind: "untracked", staged: false });
  });

  it("**檔名有空格**也要對（這是不能用 split(' ') 的原因）", () => {
    expect(parseStatusLine("?? docs/a b c.md")?.path).toBe("docs/a b c.md");
    expect(parseStatusLine(" M src/My File.tsx")?.path).toBe("src/My File.tsx");
  });

  it("新增與刪除", () => {
    expect(parseStatusLine("A  x.ts")).toMatchObject({ kind: "added", staged: true });
    expect(parseStatusLine(" D x.ts")).toMatchObject({ kind: "deleted", staged: false });
  });

  it("改名帶得出來源", () => {
    expect(parseStatusLine("R  old.ts -> new.ts")).toMatchObject({
      kind: "renamed", path: "new.ts", from: "old.ts",
    });
  });

  it("衝突（UU／AA／DD）自己一類", () => {
    expect(parseStatusLine("UU a.ts")?.kind).toBe("conflict");
    expect(parseStatusLine("AA a.ts")?.kind).toBe("conflict");
    expect(parseStatusLine("DD a.ts")?.kind).toBe("conflict");
  });

  it("太短的行不當成改動", () => {
    expect(parseStatusLine("")).toBeNull();
    expect(parseStatusLine(" M")).toBeNull();
  });
});

describe("parseStatus", () => {
  it("整批解析並照路徑排序", () => {
    const files = parseStatus(" M b.ts\n?? a.ts\nM  c.ts\n");
    expect(files.map((f) => f.path)).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  it("countByKind 數得出各類", () => {
    const files = parseStatus(" M a.ts\n?? b.ts\n?? c.ts\nA  d.ts");
    expect(countByKind(files)).toMatchObject({ modified: 1, untracked: 2, added: 1 });
  });
});

// 逐字取自 `git diff HEAD -- <file>` 的實際輸出
const DIFF = `diff --git a/lib/a.ts b/lib/a.ts
index acaa0c6..344c690 100644
--- a/lib/a.ts
+++ b/lib/a.ts
@@ -10,6 +10,7 @@ export function f() {
   const a = 1;
-  const b = 2;
+  const b = 3;
+  const c = 4;
   return a;
 }
`;

describe("parseDiff", () => {
  const lines = parseDiff(DIFF);

  it("meta 與 hunk 分開，內容行標成 add／del／context", () => {
    expect(lines.filter((l) => l.kind === "meta")).toHaveLength(4);
    expect(lines.filter((l) => l.kind === "hunk")).toHaveLength(1);
    expect(lines.filter((l) => l.kind === "add").map((l) => l.text))
      .toEqual(["  const b = 3;", "  const c = 4;"]);
    expect(lines.filter((l) => l.kind === "del").map((l) => l.text)).toEqual(["  const b = 2;"]);
  });

  it("行號從 hunk 標頭算：舊檔從 10、新檔從 10", () => {
    const first = lines.find((l) => l.kind === "context")!;
    expect(first).toMatchObject({ oldNo: 10, newNo: 10 });
    const add = lines.filter((l) => l.kind === "add");
    expect(add[0]).toMatchObject({ oldNo: null, newNo: 11 });
    expect(add[1]).toMatchObject({ oldNo: null, newNo: 12 });
    const del = lines.find((l) => l.kind === "del")!;
    expect(del).toMatchObject({ oldNo: 11, newNo: null });
  });

  it("diffStat 算增刪", () => {
    expect(diffStat(lines)).toEqual({ added: 2, deleted: 1 });
  });

  it("只有模式改變的 diff 解出來全是 meta（畫面要靠這個判斷改顯示說明）", () => {
    const modeOnly = parseDiff(
      "diff --git a/x.md b/x.md\nold mode 100644\nnew mode 100755\n"
    );
    expect(modeOnly.every((l) => l.kind === "meta")).toBe(true);
    expect(modeOnly.filter((l) => l.kind !== "meta")).toHaveLength(0);
  });

  it("尾端的空行會被去掉，不然每個 diff 最後都多一行", () => {
    const last = parseDiff(DIFF).at(-1)!;
    expect(last.text).not.toBe("");
  });
});

describe("languageOf — 認不得就不上色，不要猜", () => {
  it.each([
    ["lib/a.ts", "typescript"], ["a.tsx", "typescript"], ["s.py", "python"],
    ["x.dart", "dart"], ["b.sh", "bash"], ["Dockerfile", "dockerfile"],
    [".env.local", "bash"], ["a.md", "markdown"],
  ])("%s → %s", (p, lang) => {
    expect(languageOf(p)).toBe(lang);
  });

  it.each(["notes.unknownext", "LICENSE", "a.xyz"])("%s → null", (p) => {
    expect(languageOf(p)).toBeNull();
  });
});
