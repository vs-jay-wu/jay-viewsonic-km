import { describe, expect, it } from "vitest";
import { filterGroups, groupRepos, type GroupableRepo } from "@/lib/repoGroupRules";

const r = (o: Partial<GroupableRepo> & { name: string }): GroupableRepo => ({
  dir: `/x/${o.name}`, worktreeOf: null, pinned: false, lastCommitAt: "2026-09-01T00:00:00Z", ...o,
});

describe("groupRepos", () => {
  it("worktree 收到主 repo 底下", () => {
    const g = groupRepos([
      r({ name: "mvbf-vb-2267", worktreeOf: "mvbf" }),
      r({ name: "mvbf" }),
      r({ name: "other" }),
    ]);
    expect(g.map((x) => x.name).sort()).toEqual(["mvbf", "other"]);
    const mvbf = g.find((x) => x.name === "mvbf")!;
    expect(mvbf.main?.name).toBe("mvbf");
    expect(mvbf.worktrees.map((w) => w.name)).toEqual(["mvbf-vb-2267"]);
  });

  it("pin 主 repo → 整組排到最前面（worktree 跟著走）", () => {
    const g = groupRepos([
      r({ name: "newer", lastCommitAt: "2026-09-18T00:00:00Z" }),
      r({ name: "mvbf", pinned: true, lastCommitAt: "2026-09-01T00:00:00Z" }),
      r({ name: "mvbf-wt", worktreeOf: "mvbf", lastCommitAt: "2026-09-02T00:00:00Z" }),
    ]);
    expect(g[0].name).toBe("mvbf");
    expect(g[0].pinned).toBe(true);
    expect(g[0].worktrees).toHaveLength(1);
  });

  it("pin worktree **不會**把整組推到最前面（pin 分兩層）", () => {
    // 為了方便切換 pin 一條分支，不該讓整個 repo 跳到清單最上面 ——
    // 而且 repo 清單那一層根本看不到你 pin 的是誰
    const g = groupRepos([
      r({ name: "a", lastCommitAt: "2026-09-18T00:00:00Z" }),
      r({ name: "mvbf", lastCommitAt: "2026-09-01T00:00:00Z" }),
      r({ name: "mvbf-wt", worktreeOf: "mvbf", pinned: true, lastCommitAt: "2026-09-02T00:00:00Z" }),
    ]);
    expect(g[0].name).toBe("a");
    expect(g.find((x) => x.name === "mvbf")!.pinned).toBe(false);
  });

  it("pin 過的 worktree 排在組內最前面", () => {
    const g = groupRepos([
      r({ name: "mvbf" }),
      r({ name: "mvbf-old", worktreeOf: "mvbf", pinned: true, lastCommitAt: "2026-01-01T00:00:00Z" }),
      r({ name: "mvbf-new", worktreeOf: "mvbf", lastCommitAt: "2026-09-20T00:00:00Z" }),
    ]);
    // 沒有 pin 的話 mvbf-new 會在前面（它比較新）
    expect(g[0].worktrees.map((w) => w.name)).toEqual(["mvbf-old", "mvbf-new"]);
  });

  it("主 repo 不在清單裡時，worktree 的 pin 仍然算整組 pin", () => {
    // 那種組沒有主 repo 可以 pin，不退回去的話它永遠 pin 不了
    const g = groupRepos([
      r({ name: "a", lastCommitAt: "2026-09-18T00:00:00Z" }),
      r({ name: "poc", worktreeOf: "mac-playground", pinned: true, lastCommitAt: "2026-09-01T00:00:00Z" }),
    ]);
    expect(g[0].name).toBe("mac-playground");
    expect(g[0].pinned).toBe(true);
  });

  it("主 repo 不在清單裡時也要成組（被 offload 或在工作區外）", () => {
    const g = groupRepos([r({ name: "poc", worktreeOf: "edu-mvb-mac-playground" })]);
    expect(g[0].name).toBe("edu-mvb-mac-playground");
    expect(g[0].main).toBeNull();
    expect(g[0].worktrees).toHaveLength(1);
  });

  it("組的排序用組內最新的 commit，不是主 repo 的", () => {
    const g = groupRepos([
      r({ name: "b", lastCommitAt: "2026-09-10T00:00:00Z" }),
      r({ name: "a", lastCommitAt: "2026-09-01T00:00:00Z" }),
      r({ name: "a-wt", worktreeOf: "a", lastCommitAt: "2026-09-17T00:00:00Z" }),
    ]);
    expect(g.map((x) => x.name)).toEqual(["a", "b"]);
  });
});

describe("filterGroups", () => {
  const groups = groupRepos([
    r({ name: "mvbf" }),
    r({ name: "mvbf-vb-2267", worktreeOf: "mvbf" }),
    r({ name: "mvbf-vb-1945", worktreeOf: "mvbf" }),
    r({ name: "ragdoll-cat" }),
  ]);

  it("命中主 repo 名 → 整組留下（含全部 worktree）", () => {
    const out = filterGroups(groups, "mvbf");
    expect(out).toHaveLength(1);
    expect(out[0].worktrees).toHaveLength(2);
  });

  it("只命中某個 worktree → 只留那個", () => {
    const out = filterGroups(groups, "2267");
    expect(out).toHaveLength(1);
    expect(out[0].worktrees.map((w) => w.name)).toEqual(["mvbf-vb-2267"]);
    expect(out[0].main).toBeNull();
  });

  it("空字串全留；搜不到就空", () => {
    expect(filterGroups(groups, "  ")).toHaveLength(2);
    expect(filterGroups(groups, "zzz")).toHaveLength(0);
  });
});
