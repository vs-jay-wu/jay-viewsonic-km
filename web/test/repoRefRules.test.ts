import { describe, expect, it } from "vitest";
import { decodeRepoRef, encodeRepoRef, repoRefName, type RefRoot } from "@/lib/repoRefRules";

// A 機器
const A: RefRoot[] = [
  { id: "km", base: "/Users/jay/ProjectsWork_GitHub/jay-viewsonic-km" },
  { id: "Viewsonic-EDU", base: "/Users/jay/ProjectsWork_GitHub/Orgs/Viewsonic-EDU" },
  { id: "Viewsonic-EDU@external", base: "/Volumes/Crucial X9/ProjectsWork_GitHub/Orgs/Viewsonic-EDU" },
  { id: "home", base: "/Users/jay" },
];
// B 機器：短名不同、org 放在別的地方、沒有外接
const B: RefRoot[] = [
  { id: "km", base: "/Users/wu/code/km" },
  { id: "Viewsonic-EDU", base: "/Users/wu/code/Orgs/Viewsonic-EDU" },
  { id: "home", base: "/Users/wu" },
];

describe("repo 身分", () => {
  it("同一個身分在兩台機器解到各自的絕對路徑", () => {
    const ref = encodeRepoRef("/Users/jay/ProjectsWork_GitHub/Orgs/Viewsonic-EDU/ragdoll-cat", A);
    expect(ref).toBe("Viewsonic-EDU/ragdoll-cat");
    expect(decodeRepoRef(ref!, A)).toBe("/Users/jay/ProjectsWork_GitHub/Orgs/Viewsonic-EDU/ragdoll-cat");
    expect(decodeRepoRef(ref!, B)).toBe("/Users/wu/code/Orgs/Viewsonic-EDU/ragdoll-cat");
  });

  it("最長的 base 優先 —— org 一定也在 home 底下", () => {
    // 先比到 home 的話會變成 home/ProjectsWork_GitHub/Orgs/... ，在 B 上就解不開
    expect(encodeRepoRef("/Users/jay/ProjectsWork_GitHub/Orgs/Viewsonic-EDU/x", A))
      .toBe("Viewsonic-EDU/x");
    expect(encodeRepoRef("/Users/jay/ProjectsWork_GitHub/jay-viewsonic-km", A)).toBe("km");
  });

  it("兜底：放在別處的 linked worktree 走 home", () => {
    expect(encodeRepoRef("/Users/jay/.mvb-worktrees/poc", A)).toBe("home/.mvb-worktrees/poc");
  });

  it("外接碟上的 repo 有自己的 root", () => {
    expect(encodeRepoRef("/Volumes/Crucial X9/ProjectsWork_GitHub/Orgs/Viewsonic-EDU/old", A))
      .toBe("Viewsonic-EDU@external/old");
    // B 沒掛外接 → 解不開，而不是解到別的東西
    expect(decodeRepoRef("Viewsonic-EDU@external/old", B)).toBeNull();
  });

  it("完全對不到就回 null，不要硬湊", () => {
    expect(encodeRepoRef("/opt/somewhere", A)).toBeNull();
    expect(decodeRepoRef("Nope/x", A)).toBeNull();
    expect(decodeRepoRef("", A)).toBeNull();
  });

  it("`..` 在這一層就要擋掉", () => {
    // 後面那層比的是「解析後還在不在 repo 底下」，而這裡解出來的就是 repo 根目錄
    expect(decodeRepoRef("Viewsonic-EDU/../../../etc", A)).toBeNull();
    expect(decodeRepoRef("Viewsonic-EDU/./x", A)).toBeNull();
    expect(decodeRepoRef("Viewsonic-EDU//x", A)).toBeNull();
  });

  it("結尾斜線與前後空白不影響", () => {
    expect(encodeRepoRef("/Users/jay/ProjectsWork_GitHub/Orgs/Viewsonic-EDU/x/", A)).toBe("Viewsonic-EDU/x");
    expect(decodeRepoRef(" Viewsonic-EDU/x/ ", A)).toBe("/Users/jay/ProjectsWork_GitHub/Orgs/Viewsonic-EDU/x");
  });

  it("顯示用短名", () => {
    expect(repoRefName("Viewsonic-EDU/ragdoll-cat")).toBe("ragdoll-cat");
    expect(repoRefName("km")).toBe("km");
    expect(repoRefName("home/.mvb-worktrees/poc")).toBe("poc");
  });
});
