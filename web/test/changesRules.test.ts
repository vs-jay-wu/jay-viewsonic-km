import { describe, expect, it } from "vitest";
import {
  buildTree, contextGaps, countByKind, countByStage, diffStat, expandStep, formatBytes,
  patchWorktreeFiles,
  imageMimeOf, splitByStage, splitGap, languageOf, parseDiff, parseStatus, parseStatusLine, sortRepos,
  stageState,
  type ChangedFile, type DiffLine, type RepoChanges,
} from "@/lib/changesRules";

describe("parseStatusLine — 前兩個字元是固定欄位，不能用空白切", () => {
  it("工作區改動（` M`）與已 staged（`M `）分得出來", () => {
    expect(parseStatusLine(" M lib/a.ts")).toEqual({
      path: "lib/a.ts", kind: "modified", staged: false, unstaged: true, from: undefined,
    });
    expect(parseStatusLine("M  lib/a.ts")).toMatchObject({
      kind: "modified", staged: true, unstaged: false,
    });
  });

  /*
   * 索引與工作區是**兩個獨立欄位**。只有一個布林的時候，`MM` 會被記成單純的
   * staged —— 畫面上看不出工作區還有東西沒 add，而那正是 commit 不會帶走的部分。
   */
  it("`MM` ＝ 兩邊都有（只 add 了一部分）", () => {
    expect(parseStatusLine("MM lib/a.ts")).toMatchObject({ staged: true, unstaged: true });
    expect(stageState(parseStatusLine("MM lib/a.ts")!)).toBe("partial");
  });

  it("stageState 四種狀態", () => {
    expect(stageState(parseStatusLine("M  a.ts")!)).toBe("staged");
    expect(stageState(parseStatusLine(" M a.ts")!)).toBe("unstaged");
    expect(stageState(parseStatusLine("?? a.ts")!)).toBe("unstaged");
    // commit 裡的檔案沒有索引／工作區之分，兩軸都是 false
    expect(stageState({ path: "a.ts", kind: "modified", staged: false, unstaged: false }))
      .toBe("none");
  });

  it("`AM`（新增後又改）也是 partial；`UU` 衝突算在工作區", () => {
    expect(stageState(parseStatusLine("AM a.ts")!)).toBe("partial");
    expect(parseStatusLine("UU a.ts")).toMatchObject({
      kind: "conflict", staged: false, unstaged: true,
    });
  });

  it("countByStage 數得出各有幾個", () => {
    const files = parseStatus(["M  a.ts", " M b.ts", "MM c.ts", "?? d.ts"].join("\n"));
    expect(countByStage(files)).toEqual({ staged: 1, unstaged: 2, partial: 1, none: 0 });
  });

  it("未追蹤", () => {
    expect(parseStatusLine("?? new.ts")).toEqual({
      path: "new.ts", kind: "untracked", staged: false, unstaged: true,
    });
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

describe("imageMimeOf — 只認表上的副檔名", () => {
  it("認得常見的圖片", () => {
    expect(imageMimeOf("a/b/logo.png")).toBe("image/png");
    expect(imageMimeOf("shot.JPG")).toBe("image/jpeg");
    expect(imageMimeOf("icon.svg")).toBe("image/svg+xml");
  });

  it("不是圖片就回 null（猜錯 MIME 會讓 <img> 整個空白）", () => {
    expect(imageMimeOf("lib/changes.ts")).toBeNull();
    expect(imageMimeOf("Dockerfile")).toBeNull();
    expect(imageMimeOf("a.png.bak")).toBeNull();
    expect(imageMimeOf("png")).toBeNull();
  });
});

describe("formatBytes", () => {
  it("分三段", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("buildTree", () => {
  const f = (path: string): ChangedFile => ({ path, kind: "modified", staged: false, unstaged: true });

  it("照目錄分層，目錄排在檔案前面", () => {
    const t = buildTree([f("z.txt"), f("src/a.ts"), f("src/b.ts")]);
    expect(t.map((n) => n.name)).toEqual(["src", "z.txt"]);
    expect(t[0].children.map((n) => n.name)).toEqual(["a.ts", "b.ts"]);
    expect(t[0].file).toBeUndefined();
    expect(t[1].file?.path).toBe("z.txt");
  });

  it("只有一條路的目錄鏈壓成一行（VS Code 的 compact folders）", () => {
    const t = buildTree([f("app/build/intermediates/debug/x.bin")]);
    expect(t.map((n) => n.name)).toEqual(["app/build/intermediates/debug"]);
    expect(t[0].path).toBe("app/build/intermediates/debug");
    expect(t[0].children.map((n) => n.name)).toEqual(["x.bin"]);
  });

  it("分岔的地方就不壓縮", () => {
    const t = buildTree([f("a/b/x.ts"), f("a/c/y.ts")]);
    expect(t.map((n) => n.name)).toEqual(["a"]);
    expect(t[0].children.map((n) => n.name)).toEqual(["b", "c"]);
  });

  it("目錄底下同時有檔案和子目錄時不壓縮", () => {
    const t = buildTree([f("a/b/x.ts"), f("a/y.ts")]);
    expect(t[0].name).toBe("a");
    expect(t[0].children.map((n) => n.name)).toEqual(["b", "y.ts"]);
  });

  it("path 是完整路徑（收合狀態靠它當 key）", () => {
    const t = buildTree([f("a/b/x.ts")]);
    expect(t[0].path).toBe("a/b");
    expect(t[0].children[0].path).toBe("a/b/x.ts");
  });
});

describe("contextGaps — diff 裡沒顯示的那幾段", () => {
  const d = (kind: DiffLine["kind"], oldNo: number | null, newNo: number | null): DiffLine =>
    ({ kind, text: "", oldNo, newNo });

  it("兩個 hunk 之間、以及第一個 hunk 之前的缺口都算得出來", () => {
    // hunk @@ 10..12 @@，然後 hunk @@ 50..51 @@
    const lines: DiffLine[] = [
      d("hunk", null, null),
      d("context", 10, 10), d("add", null, 11), d("context", 11, 12),
      d("hunk", null, null),
      d("context", 49, 50), d("context", 50, 51),
    ];
    expect(contextGaps(lines)).toEqual([
      { atIndex: 0, from: 1, to: 9 },    // 檔頭到第一個 hunk
      { atIndex: 4, from: 13, to: 49 },  // 兩個 hunk 之間
      { atIndex: 7, from: 52, to: null },// 最後一段到檔尾
    ]);
  });

  it("hunk 從第 1 行開始時，前面沒有缺口", () => {
    const lines: DiffLine[] = [d("hunk", null, null), d("context", 1, 1)];
    expect(contextGaps(lines)).toEqual([{ atIndex: 2, from: 2, to: null }]);
  });

  it("整份被刪掉（沒有新側）就不給展開", () => {
    const lines: DiffLine[] = [d("hunk", null, null), d("del", 1, null), d("del", 2, null)];
    expect(contextGaps(lines)).toEqual([]);
  });
});

describe("expandStep", () => {
  it("缺口不到 20 行就一次補完", () => {
    expect(expandStep({ atIndex: 0, from: 5, to: 12 }, "up")).toEqual({ from: 5, to: 12 });
  });

  it("往上長＝貼著下面那段補；往下長＝貼著上面那段補", () => {
    const gap = { atIndex: 0, from: 1, to: 100 };
    expect(expandStep(gap, "up")).toEqual({ from: 81, to: 100 });
    expect(expandStep(gap, "down")).toEqual({ from: 1, to: 20 });
    expect(expandStep(gap, "all")).toEqual({ from: 1, to: 100 });
  });

  it("檔尾那一格不知道總行數，只能往下要一段", () => {
    expect(expandStep({ atIndex: 9, from: 52, to: null }, "down")).toEqual({ from: 52, to: 71 });
  });
});

describe("splitGap — 補到的行可能在缺口的任何位置", () => {
  const has = (...ns: number[]) => (n: number) => ns.includes(n);

  it("往上展開：補在缺口末端也要畫得出來（踩過的 bug）", () => {
    // 缺口 1–10，補到的是 8、9、10
    expect(splitGap({ atIndex: 0, from: 1, to: 10 }, has(8, 9, 10), null)).toEqual([
      { kind: "gap", from: 1, to: 7 },
      { kind: "line", no: 8 },
      { kind: "line", no: 9 },
      { kind: "line", no: 10 },
    ]);
  });

  it("往下展開：補在開頭", () => {
    expect(splitGap({ atIndex: 0, from: 1, to: 5 }, has(1, 2), null)).toEqual([
      { kind: "line", no: 1 },
      { kind: "line", no: 2 },
      { kind: "gap", from: 3, to: 5 },
    ]);
  });

  it("兩頭都補過、中間還缺一段", () => {
    expect(splitGap({ atIndex: 0, from: 1, to: 6 }, has(1, 6), null)).toEqual([
      { kind: "line", no: 1 },
      { kind: "gap", from: 2, to: 5 },
      { kind: "line", no: 6 },
    ]);
  });

  it("補滿了就不再留按鈕", () => {
    expect(splitGap({ atIndex: 0, from: 1, to: 3 }, has(1, 2, 3), null)).toEqual([
      { kind: "line", no: 1 }, { kind: "line", no: 2 }, { kind: "line", no: 3 },
    ]);
  });

  it("檔尾（不知道總行數）：補到的畫出來，後面還留一條", () => {
    expect(splitGap({ atIndex: 9, from: 5, to: null }, has(5, 6), null)).toEqual([
      { kind: "line", no: 5 },
      { kind: "line", no: 6 },
      { kind: "gap", from: 7, to: null },
    ]);
  });

  it("檔尾補到底之後按鈕消失", () => {
    expect(splitGap({ atIndex: 9, from: 5, to: null }, has(5, 6), 6)).toEqual([
      { kind: "line", no: 5 },
      { kind: "line", no: 6 },
    ]);
  });
});

describe("sortRepos — pin 只動順序，不會少掉任何 repo", () => {
  const repo = (name: string, total: number, pinned: boolean): RepoChanges =>
    ({ repo: name, worktrees: [], total, pinned });

  it("pin 住的排最前面，即使改動數比較少", () => {
    const out = sortRepos([repo("a", 9, false), repo("b", 1, true), repo("c", 5, false)]);
    expect(out.map((r) => r.repo)).toEqual(["b", "a", "c"]);
  });

  it("同一組（都 pin 或都沒 pin）內照改動數由多到少", () => {
    const out = sortRepos([repo("a", 2, true), repo("b", 7, true), repo("c", 3, false)]);
    expect(out.map((r) => r.repo)).toEqual(["b", "a", "c"]);
  });

  /* pin 取代的是「忽略這個 repo」——那顆會讓改動整個消失，這裡刻意不再有這種行為 */
  it("沒有任何 repo 被濾掉", () => {
    const input = [repo("a", 1, false), repo("b", 2, true)];
    expect(sortRepos(input)).toHaveLength(2);
    expect(input.map((r) => r.repo)).toEqual(["a", "b"]); // 不動到傳進來的陣列
  });
});

describe("splitByStage — Staged Changes／Changes 兩區", () => {
  const files = parseStatus(
    ["M  a.ts", " M b.ts", "MM c.ts", "?? d.ts", "UU e.ts", "A  f.ts"].join("\n")
  );
  const { index, worktree } = splitByStage(files);

  it("已 staged 的只在 index 區", () => {
    expect(index.map((f) => f.path)).toContain("a.ts");
    expect(worktree.map((f) => f.path)).not.toContain("a.ts");
    expect(index.map((f) => f.path)).toContain("f.ts");
  });

  it("只改工作區的、未追蹤的、衝突的都在 worktree 區", () => {
    expect(worktree.map((f) => f.path)).toEqual(expect.arrayContaining(["b.ts", "d.ts", "e.ts"]));
    expect(index.map((f) => f.path)).not.toContain("d.ts");
  });

  /*
   * 這條是整個分區的重點：`MM` 索引有一版、工作區還有沒 add 的改動，兩邊點開
   * 看到的 diff 不一樣（`git diff --cached` vs `git diff`），所以兩區都要列。
   */
  it("部分 staged（`MM`）兩區都出現", () => {
    expect(index.map((f) => f.path)).toContain("c.ts");
    expect(worktree.map((f) => f.path)).toContain("c.ts");
  });

  it("沒有檔案整筆消失（每個檔至少落在一區）", () => {
    const seen = new Set([...index, ...worktree].map((f) => f.path));
    expect([...seen].sort()).toEqual(files.map((f) => f.path).sort());
  });

  /* 兩軸都 false 是 `git status` 吐不出來的組合，但真的出現時寧可列在 Changes 也不要不見 */
  it("兩軸都 false 的歸到 Changes", () => {
    const odd = { path: "x.ts", kind: "modified" as const, staged: false, unstaged: false };
    expect(splitByStage([odd]).worktree).toHaveLength(1);
    expect(splitByStage([odd]).index).toHaveLength(0);
  });
});

describe("patchWorktreeFiles", () => {
  const f = (path: string): ChangedFile => ({
    path, kind: "modified", staged: false, unstaged: true,
  });
  const wt = (path: string, files: ChangedFile[]) =>
    ({ path, name: path, branch: "master", isMain: true, isSessionBound: false, files });
  const snap = () => ({
    repos: [
      { repo: "km", total: 2, pinned: false, worktrees: [wt("/km", [f("a"), f("b")])] },
      { repo: "mvbf", total: 1, pinned: false, worktrees: [wt("/mvbf", [f("c")])] },
    ],
  });

  it("換掉那個 worktree 的檔案，total 跟著重算", () => {
    const out = patchWorktreeFiles(snap(), "/km", [f("a")])!;
    expect(out.repos[0].worktrees[0].files.map((x) => x.path)).toEqual(["a"]);
    expect(out.repos[0].total).toBe(1);
  });

  it("沒碰到的 repo 原封不動", () => {
    const out = patchWorktreeFiles(snap(), "/km", [f("a")])!;
    expect(out.repos[1]).toEqual(snap().repos[1]);
  });

  it("改動清空就把 worktree 連同空掉的 repo 一起移掉，不留空殼", () => {
    const out = patchWorktreeFiles(snap(), "/km", [])!;
    expect(out.repos.map((r) => r.repo)).toEqual(["mvbf"]);
  });

  it("快照裡沒有、而且現在也沒改動 → 什麼都不用做", () => {
    const s = snap();
    expect(patchWorktreeFiles(s, "/never-seen", [])).toBe(s);
  });

  it("快照裡沒有、但現在有改動 → 回 null 要呼叫端去全掃", () => {
    // branch / isMain / isSessionBound 只有掃描端知道，這裡硬湊會生出錯的中繼資料
    expect(patchWorktreeFiles(snap(), "/never-seen", [f("a")])).toBeNull();
  });
});
