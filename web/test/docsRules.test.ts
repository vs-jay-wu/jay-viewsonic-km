import { describe, expect, it } from "vitest";
import {
  groupSetsByRepo, kindFromName, matchesDocQuery, parseDocHead, scopeOf, sortFiles, sortSets, type DocFile, type DocSet, docIcon, KIND_ICON, SUBJECT_ICON, DOC_KINDS,
} from "@/lib/docsRules";
import { resolveDocPath } from "@/lib/docs";

const file = (o: Partial<DocFile> & { name: string }): DocFile => ({
  path: `docs/features/x/${o.name}`, title: o.name, kind: "reference", status: "active",
  tickets: [], icon: null, sizeBytes: 1000, updated: "2026-09-01", ...o,
});

const set = (o: Partial<DocSet> & { dir: string }): DocSet => ({
  feature: "x", repo: null, entry: null, files: [], updated: "2026-09-01",
  tickets: [], status: "active", totalBytes: 0, ...o,
});

// 逐字取自實際文件的 head（正規化之後的樣子）
const HEAD = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8" />
<title>VSFT-6964 文字字級絕對值顯示 — 總覽</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="km-doc-kind" content="overview">
<meta name="km-doc-status" content="active">
<meta name="km-doc-tickets" content="VSFT-6964">`;

describe("parseDocHead", () => {
  it("讀得到標題與三個 meta", () => {
    expect(parseDocHead(HEAD, "index.html")).toEqual({
      title: "VSFT-6964 文字字級絕對值顯示 — 總覽",
      kind: "overview", status: "active", tickets: ["VSFT-6964"], icon: null,
    });
  });

  it("沒有 meta 的舊文件退回用檔名推 kind，狀態當 active", () => {
    const r = parseDocHead("<title>調查</title>", "findings.html");
    expect(r).toMatchObject({ title: "調查", kind: "findings", status: "active", tickets: [] });
  });

  it("meta 寫了不認得的 kind 就不採信，改用檔名", () => {
    const head = '<title>x</title><meta name="km-doc-kind" content="亂寫">';
    expect(parseDocHead(head, "verify.html").kind).toBe("verify");
  });

  it("狀態只認 done / superseded，其餘一律 active", () => {
    const mk = (v: string) => parseDocHead(`<title>x</title><meta name="km-doc-status" content="${v}">`, "a.html").status;
    expect(mk("done")).toBe("done");
    expect(mk("superseded")).toBe("superseded");
    expect(mk("wip")).toBe("active");
  });

  it("沒有 title 就用檔名，標題的換行會收成單行", () => {
    expect(parseDocHead("<p>no head</p>", "goal.html").title).toBe("goal.html");
    expect(parseDocHead("<title>兩行\n  標題</title>", "a.html").title).toBe("兩行 標題");
  });

  it("多個票號用逗號分隔，一律轉大寫", () => {
    const head = '<title>x</title><meta name="km-doc-tickets" content="vsft-7538, VB-1945">';
    expect(parseDocHead(head, "a.html").tickets).toEqual(["VSFT-7538", "VB-1945"]);
  });
});

describe("kindFromName", () => {
  it.each([
    ["index.html", "overview"], ["findings.html", "findings"], ["verify.html", "verify"],
    ["test-checklist.html", "test"], ["manual-test.html", "test"],
    ["investigation-quiz-types.html", "investigation"], ["stakeholder-report.html", "report"],
    ["dm-handoff.html", "handoff"], ["superseded-2026-07-29.html", "superseded"],
    ["basics.html", "reference"],
  ])("%s → %s", (name, kind) => {
    expect(kindFromName(name)).toBe(kind);
  });
});

describe("scopeOf", () => {
  it("repo-bound 的路徑抓得到 repo 與 feature", () => {
    expect(scopeOf("docs/repositories/Viewsonic-EDU/ragdoll-cat/features/quiz-tool-flow-v2"))
      .toEqual({ repo: "ragdoll-cat", feature: "quiz-tool-flow-v2" });
  });

  it("跨產品的沒有 repo", () => {
    expect(scopeOf("docs/features/phet-cc-by-attribution"))
      .toEqual({ repo: null, feature: "phet-cc-by-attribution" });
  });
});

describe("sortFiles", () => {
  it("總覽永遠第一、已被取代永遠最後", () => {
    const files = [
      file({ name: "findings.html", kind: "findings" }),
      file({ name: "superseded-2026-07-29.html", kind: "superseded", status: "superseded" }),
      file({ name: "index.html", kind: "overview" }),
      file({ name: "goal.html", kind: "goal" }),
    ];
    expect(sortFiles(files).map((f) => f.name))
      .toEqual(["index.html", "goal.html", "findings.html", "superseded-2026-07-29.html"]);
  });
});

describe("sortSets", () => {
  const a = set({ dir: "a", updated: "2026-09-01" });
  const b = set({ dir: "b", updated: "2026-09-04" });
  const c = set({ dir: "c", updated: "2026-08-01" });

  it("預設照最後更新新到舊", () => {
    expect(sortSets([a, b, c], []).map((s) => s.dir)).toEqual(["b", "a", "c"]);
  });

  it("pin 的排最前面，而且照 pin 的順序（不是更新時間）", () => {
    expect(sortSets([a, b, c], ["c", "a"]).map((s) => s.dir)).toEqual(["c", "a", "b"]);
  });
});

describe("matchesDocQuery", () => {
  const s = set({
    dir: "docs/repositories/Viewsonic-EDU/edu-droid-flutter/features/text-absolute-font-size",
    feature: "text-absolute-font-size", repo: "edu-droid-flutter", tickets: ["VSFT-6964"],
    files: [file({ name: "index.html", title: "VSFT-6964 文字字級絕對值顯示 — 總覽" })],
  });

  it("吃 feature、repo、票號、文件標題", () => {
    for (const q of ["font-size", "edu-droid", "vsft-6964", "字級"]) {
      expect(matchesDocQuery(s, q), q).toBe(true);
    }
  });

  it("多個詞是 AND", () => {
    expect(matchesDocQuery(s, "flutter 字級")).toBe(true);
    expect(matchesDocQuery(s, "flutter 不存在的詞")).toBe(false);
  });
});

describe("resolveDocPath — 只能碰 docs/ 底下", () => {
  it("正常路徑解得出來", () => {
    expect(resolveDocPath(["features", "phet-cc-by-attribution", "index.html"]))
      .toMatch(/\/docs\/features\/phet-cc-by-attribution\/index\.html$/);
  });

  it("往上跳出去的一律擋掉", () => {
    expect(resolveDocPath(["..", "local.workspace.json"])).toBeNull();
    expect(resolveDocPath(["features", "..", "..", ".env"])).toBeNull();
    expect(resolveDocPath(["/etc/passwd"])).toBeNull();
    expect(resolveDocPath(["..", "..", "..", "etc", "passwd"])).toBeNull();
  });

  it("resolve 之後才比對，所以繞路的寫法也擋得住", () => {
    expect(resolveDocPath(["features", "x", "..", "..", "..", "web", "package.json"])).toBeNull();
    // 這條是繞路但仍在 docs/ 底下，應該放行
    expect(resolveDocPath(["features", "x", "..", "phet-cc-by-attribution", "index.html"]))
      .toMatch(/\/docs\/features\/phet-cc-by-attribution\/index\.html$/);
  });
});

describe("groupSetsByRepo — 依 repo 分群", () => {
  const mk = (dir: string, repo: string | null, updated: string) =>
    set({ dir, repo, feature: dir, updated });

  const list = [
    mk("a", "ragdoll-cat", "2026-09-04"),
    mk("b", null, "2026-08-21"),
    mk("c", "edu-droid-flutter", "2026-09-10"),
    mk("d", "edu-droid-flutter", "2026-08-01"),
  ];

  it("同一個 repo 併成一群", () => {
    const groups = groupSetsByRepo(list);
    expect(groups.map((g) => g.label)).toEqual(["edu-droid-flutter", "ragdoll-cat", "跨產品"]);
    expect(groups[0].sets.map((s) => s.dir)).toEqual(["c", "d"]);
  });

  it("群照「群裡最新的更新」由新到舊", () => {
    expect(groupSetsByRepo(list).map((g) => g.updated))
      .toEqual(["2026-09-10", "2026-09-04", "2026-08-21"]);
  });

  it("跨產品是正當分類，不特別往後（它照樣照時間排）", () => {
    const recent = [mk("x", null, "2026-09-20"), mk("y", "ragdoll-cat", "2026-09-01")];
    expect(groupSetsByRepo(recent)[0].label).toBe("跨產品");
  });

  it("pin 的在群內排最前面", () => {
    const groups = groupSetsByRepo(list, ["d"]);
    expect(groups.find((g) => g.repo === "edu-droid-flutter")!.sets.map((s) => s.dir))
      .toEqual(["d", "c"]);
  });
});

/*
 * 圖示分兩層：kind 是必填所以一定有圖，`km-doc-icon` 是選填的主題覆寫。
 * 重點在**不認得的值要退回 kind**，而不是畫出破掉的東西 ——
 * 這是「忘了標／打錯字」時唯一安全的失敗方向。
 */
describe("docIcon — 主題優先，退回 kind", () => {
  it("沒標 icon 就用 kind 的", () => {
    expect(docIcon({ kind: "test" })).toBe("flask");
    expect(docIcon({ kind: "open-questions" })).toBe("help");
    expect(docIcon({ kind: "overview", icon: null })).toBe("layers");
  });

  it("標了白名單內的主題就用它", () => {
    expect(docIcon({ kind: "findings", icon: "slides" })).toBe("slides");
    expect(docIcon({ kind: "overview", icon: "font" })).toBe("font");
  });

  it("**不認得的值退回 kind**，不是畫不出來", () => {
    expect(docIcon({ kind: "verify", icon: "pptx" })).toBe(KIND_ICON.verify);
    expect(docIcon({ kind: "verify", icon: "" })).toBe(KIND_ICON.verify);
    expect(docIcon({ kind: "verify", icon: "打錯的名字" })).toBe(KIND_ICON.verify);
  });

  it("每個 kind 都有圖示（新增 kind 時不會漏）", () => {
    for (const k of DOC_KINDS) expect(KIND_ICON[k]).toBeTruthy();
  });

  it("白名單指到的圖示名不可以是空的", () => {
    for (const [subject, icon] of Object.entries(SUBJECT_ICON)) {
      expect(icon, `${subject} 沒有對應的圖示`).toBeTruthy();
    }
  });

  it("`km-doc-icon` 會被解析出來（大小寫與空白都收斂）", () => {
    const head = '<title>x</title><meta name="km-doc-icon" content="  SLIDES ">';
    expect(parseDocHead(head, "a.html").icon).toBe("slides");
  });
});
