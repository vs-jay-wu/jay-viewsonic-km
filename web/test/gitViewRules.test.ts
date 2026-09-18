import { describe, expect, it } from "vitest";
import {
  describeFetch, layoutGraph, parseBranches, parseCommits, parseFetchOutput, parseRefs,
  pushPlan, sortBranches,
  type Branch, type Commit,
} from "@/lib/gitViewRules";

const c = (sha: string, parents: string[] = []): Commit => ({
  sha, shortSha: sha.slice(0, 8), parents, author: "Jay", date: "2026-09-16T00:00:00Z",
  subject: sha, refs: [],
});

describe("parseRefs", () => {
  it("分得出 HEAD 指著誰、本地、遠端、tag", () => {
    expect(parseRefs("HEAD -> main, origin/main, tag: v1.2, feature/x", ["origin"])).toEqual([
      { name: "main", kind: "head" },
      { name: "origin/main", kind: "remote" },
      { name: "v1.2", kind: "tag" },
      { name: "feature/x", kind: "local" },
    ]);
  });

  it("本地分支有斜線也不能被當成遠端（Jay/VB-1945 這種是常態）", () => {
    expect(parseRefs("Jay/VB-1945, upstream/main", ["origin", "upstream"])).toEqual([
      { name: "Jay/VB-1945", kind: "local" },
      { name: "upstream/main", kind: "remote" },
    ]);
  });

  it("沒有裝飾就是空的", () => {
    expect(parseRefs("")).toEqual([]);
    expect(parseRefs("   ")).toEqual([]);
  });
});

describe("parseCommits", () => {
  it("拆得出 parent 清單（merge 有兩個）", () => {
    const rec = (sha: string, parents: string) =>
      [sha, parents, "Jay", "2026-09-16T00:00:00Z", "", "訊息"].join("\x1f") + "\x1e";
    const out = parseCommits(rec("a", "b c") + rec("b", ""));
    expect(out).toHaveLength(2);
    expect(out[0].parents).toEqual(["b", "c"]);
    expect(out[1].parents).toEqual([]);
  });
});

describe("parseBranches", () => {
  const line = (...f: string[]) => f.join("\x1f");

  it("上游沒設時 upstream 是 null，不是 0/0", () => {
    const out = parseBranches(
      [
        line("refs/heads/main", "main", "origin/main", "[ahead 2, behind 1]", "aaa", "d", "s"),
        line("refs/heads/wip", "wip", "", "", "bbb", "d", "s"),
      ].join("\n"),
      new Map()
    );
    expect(out[0]).toMatchObject({ upstream: "origin/main", ahead: 2, behind: 1, remote: false });
    expect(out[1]).toMatchObject({ upstream: null, ahead: 0, behind: 0 });
  });

  it("refs/remotes/*/HEAD 不是分支，要濾掉", () => {
    const out = parseBranches(
      [
        line("refs/remotes/origin/HEAD", "origin", "", "", "aaa", "d", "s"),
        line("refs/remotes/origin/main", "origin/main", "", "", "aaa", "d", "s"),
      ].join("\n"),
      new Map()
    );
    expect(out.map((b) => b.name)).toEqual(["origin/main"]);
  });

  it("認得遠端分支與「被哪個 worktree 簽出」", () => {
    const out = parseBranches(
      line("refs/remotes/origin/main", "origin/main", "", "", "aaa", "d", "s"),
      new Map([["origin/main", "/x"]])
    );
    expect(out[0].remote).toBe(true);
    expect(out[0].checkedOutAt).toBe("/x");
  });
});

describe("sortBranches — 簽出的最前、本地在遠端前面", () => {
  const b = (o: Partial<Branch> & { name: string }): Branch => ({
    ref: `refs/heads/${o.name}`, remote: false, upstream: null, ahead: 0, behind: 0,
    sha: "a", subject: "s", date: "2026-09-01T00:00:00Z", checkedOutAt: null, ...o,
  });

  it("排序", () => {
    const out = sortBranches([
      b({ name: "origin/main", remote: true, date: "2026-09-15T00:00:00Z" }),
      b({ name: "old", date: "2026-09-01T00:00:00Z" }),
      b({ name: "new", date: "2026-09-14T00:00:00Z" }),
      b({ name: "here", checkedOutAt: "/repo" }),
    ]);
    expect(out.map((x) => x.name)).toEqual(["here", "new", "old", "origin/main"]);
  });
});

describe("layoutGraph", () => {
  it("線性歷史全部走同一條 lane", () => {
    const g = layoutGraph([c("a", ["b"]), c("b", ["d"]), c("d")]);
    expect(g.width).toBe(1);
    expect(g.rows.map((r) => r.lane)).toEqual([0, 0, 0]);
  });

  it("分岔時第二條 lane 開出來，合流時收回去", () => {
    //   a (merge of b, x)
    //   |\
    //   b x
    //   |/
    //   d
    const g = layoutGraph([c("a", ["b", "x"]), c("b", ["d"]), c("x", ["d"]), c("d")]);
    expect(g.rows.map((r) => r.lane)).toEqual([0, 0, 1, 0]);
    expect(g.width).toBe(2);
    // a 這一列往下要分出兩條線：0→0（b）與 0→1（x）
    expect(g.rows[0].down).toEqual([{ from: 0, to: 0 }, { from: 0, to: 1 }]);
    // x 這一列：lane 0 已經在等 d（直線穿過），x 自己也接到 d（斜線併過去）——
    // 兩段線都要有。原本這裡只斷言斜線，正好把「主線斷一截」那個 bug 寫死進測試
    expect(g.rows[2].down).toEqual([
      { from: 0, to: 0 },
      { from: 1, to: 0 },
    ]);
    expect(g.rows[3].lane).toBe(0);
  });

  it("等著某個 commit 的 lane 會在它那一列收束到它的點上", () => {
    const g = layoutGraph([c("a", ["b", "x"]), c("b", ["d"]), c("x", ["d"]), c("d")]);
    // d 那一列：上面只剩 lane 0 在等它
    expect(g.rows[3].up).toEqual([{ from: 0, to: 0 }]);
  });

  it("分支結束後 lane 空出來，可以被之後的分支重用", () => {
    // a(0) → b(0)；x 是獨立的分支頭（沒人等它）
    const g = layoutGraph([c("a", ["b"]), c("b"), c("x")]);
    expect(g.rows.map((r) => r.lane)).toEqual([0, 0, 0]);
    expect(g.width).toBe(1);
  });

  it("被 merge 進來的分支與主線共用同一個 parent 時，主線的直線不能被斜線取代", () => {
    // 截圖回報的形狀：A 是 merge（parent = 主線 C ＋ 分支 B），而 B 的 parent 也是 C。
    // B 那一列要同時有「lane 0 直直穿過」與「B 併回 lane 0」兩段線，
    // 少了前者主線就會每隔一列斷一截。
    const g = layoutGraph([c("A", ["C", "B"]), c("B", ["C"]), c("C")]);
    expect(g.rows.map((r) => r.lane)).toEqual([0, 1, 0]);
    expect(g.rows[1].down).toEqual([
      { from: 0, to: 0 },
      { from: 1, to: 0 },
    ]);
  });

  it("兩條 lane 收束成一條時，被收掉的那條要有線斜過去", () => {
    // M 是 merge（parent = P、Q），而 P 的 parent 就是 Q：
    // 在 P 這一列，lane 1（等著 Q）要斜到 lane 0 去，不能整條憑空消失
    const g = layoutGraph([c("M", ["P", "Q"]), c("P", ["Q"]), c("Q")]);
    expect(g.rows.map((r) => r.lane)).toEqual([0, 0, 0]);
    expect(g.rows[1].down).toEqual([
      { from: 1, to: 0 },
      { from: 0, to: 0 },
    ]);
  });

  /**
   * 這條才是真正的保證：**上一列往下畫的線，下一列一定要接得上**。
   * 少任何一段畫面上就是斷線，而斷線有好幾種成因（已經踩到兩種），
   * 與其一個形狀一個形狀補，不如直接釘住這個不變量。
   */
  it("不變量：每一列的 down 終點＝下一列 up 起點（隨機 DAG 也要成立）", () => {
    // 固定種子的偽隨機，失敗時重跑結果一樣
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

    for (let iter = 0; iter < 200; iter++) {
      const n = 3 + Math.floor(rnd() * 25);
      // 照 git log 的順序產生：第 i 個只能以更後面的為 parent
      const commits: Commit[] = [];
      for (let i = 0; i < n; i++) {
        const parents: string[] = [];
        if (i < n - 1) {
          parents.push(`c${i + 1 + Math.floor(rnd() * Math.min(3, n - i - 1))}`);
          if (rnd() < 0.3) {
            const p2 = `c${i + 1 + Math.floor(rnd() * (n - i - 1))}`;
            if (p2 !== parents[0]) parents.push(p2);
          }
        }
        commits.push(c(`c${i}`, parents));
      }

      const g = layoutGraph(commits);
      for (let i = 0; i + 1 < g.rows.length; i++) {
        const ends = [...new Set(g.rows[i].down.map((l) => l.to))].sort();
        const starts = [...new Set(g.rows[i + 1].up.map((l) => l.from))].sort();
        expect(ends, `第 ${iter} 組第 ${i} 列接不上下一列`).toEqual(starts);
      }
      // 最後一列不該還有線往下（沒有下一列可以接）
      expect(g.rows[g.rows.length - 1].down).toEqual([]);
    }
  });

  it("空輸入不會爆", () => {
    expect(layoutGraph([])).toEqual({ rows: [], width: 0 });
  });
});

describe("pushPlan — 刻意保守", () => {
  const b = (o: Partial<Branch>): Branch => ({
    name: "main", ref: "refs/heads/main", remote: false, upstream: "origin/main",
    ahead: 0, behind: 0, sha: "a", subject: "s", date: "d", checkedOutAt: null, ...o,
  });

  it("遠端追蹤分支不能推", () => {
    expect(pushPlan(b({ remote: true })).ok).toBe(false);
  });

  it("沒領先就沒東西可推", () => {
    expect(pushPlan(b({ ahead: 0 })).ok).toBe(false);
  });

  it("落後就不給推（那要先 rebase／merge，不是這裡的事）", () => {
    const p = pushPlan(b({ ahead: 1, behind: 2 }));
    expect(p.ok).toBe(false);
    expect(p.reason).toContain("落後上游 2");
  });

  it("領先就給推，refspec 不 force、不刪除", () => {
    const p = pushPlan(b({ ahead: 3 }));
    expect(p).toMatchObject({ ok: true, remote: "origin", refspec: "refs/heads/main:refs/heads/main" });
    expect(p.refspec).not.toContain("+");
    expect(p.refspec).not.toMatch(/^:/);
  });

  it("沒有上游的新分支可以推，remote 用預設的", () => {
    const p = pushPlan(b({ name: "wip", ref: "refs/heads/wip", upstream: null }));
    expect(p.ok).toBe(true);
    expect(p.remote).toBe("origin");
    expect(p.reason).toContain("還沒有上游");
  });
});


describe("parseFetchOutput — 用真實輸出的形狀", () => {
  // 這幾行取自實際的 `git fetch --dry-run --prune`（edu-droid-flutter，2026-09-17）
  const real = [
    "From https://github.com/Viewsonic-EDU/edu-droid-flutter",
    " - [deleted]             (none)     -> origin/Jay/VSFT-9785-spike-classswift-fusion",
    " * [new branch]          jay/VSFT-9785-spike-classswift-fusion -> origin/jay/VSFT-9785-spike-classswift-fusion",
    "   ab3af7d54..6dbcc8516  master     -> origin/master",
  ].join("\n");

  it("認得刪除、新分支、更新，並跳過 `From` 標題行", () => {
    expect(parseFetchOutput(real)).toEqual([
      { ref: "origin/Jay/VSFT-9785-spike-classswift-fusion", kind: "deleted" },
      { ref: "origin/jay/VSFT-9785-spike-classswift-fusion", kind: "created" },
      {
        ref: "origin/master",
        kind: "updated",
        range: { from: "ab3af7d54", to: "6dbcc8516" },
      },
    ]);
  });

  it("強制覆寫與 tag", () => {
    const out = parseFetchOutput(
      [
        " + 1234abc...5678def  b          -> origin/b  (forced update)",
        " * [new tag]          v1.2       -> v1.2",
      ].join("\n")
    );
    expect(out[0]).toMatchObject({ kind: "forced", range: { from: "1234abc", to: "5678def" } });
    expect(out[1]).toMatchObject({ ref: "v1.2", kind: "tag" });
  });

  it("什麼都沒有時是空的（fetch 沒輸出代表已是最新）", () => {
    expect(parseFetchOutput("")).toEqual([]);
    expect(parseFetchOutput("From https://github.com/x/y")).toEqual([]);
  });
});

describe("describeFetch — 一句話，不要倒原始輸出", () => {
  it("沒有變動", () => {
    expect(describeFetch([])).toEqual({ text: "已是最新" });
  });

  it("有 commit 數就寫進去", () => {
    const out = describeFetch(
      [
        { ref: "origin/master", kind: "updated", range: { from: "a", to: "b" } },
        { ref: "origin/x", kind: "created" },
        { ref: "origin/y", kind: "deleted" },
      ],
      { "origin/master": 12 }
    );
    expect(out.text).toBe("1 條分支更新（12 個 commit）、新增 1 條、刪掉 1 條");
    expect(out.detail).toBe("master +12");
  });

  it("更新很多條時只列三條", () => {
    const changes = ["a", "b", "c", "d", "e"].map((r) => ({
      ref: `origin/${r}`, kind: "updated" as const, range: { from: "1", to: "2" },
    }));
    const out = describeFetch(changes);
    expect(out.text).toBe("5 條分支更新");
    expect(out.detail).toBe("a、b、c …還有 2 條");
  });
});
