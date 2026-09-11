import { describe, expect, it } from "vitest";
import {
  UNGROUPED, filterRepos, groupByProduct, matchesQuery,
  type ReposOverview,
} from "@/lib/reposOverviewRules";

// 取自 data/repos-overview.json 的真實條目（節錄）
const OVERVIEW: ReposOverview = {
  _meta: { organization: "Viewsonic-EDU" },
  products: {
    classswift: {
      fullName: "ClassSwift",
      aliases: ["classswift", "cs"],
      description: "課堂互動與管理工具",
    },
    mvbf: { fullName: "myViewBoard Flutter", aliases: ["mvbf", "mvb flutter"] },
  },
  repos: [
    {
      name: "ocelot", product: "classswift", hostPrefix: "api-swift",
      aliases: ["api-swift", "cs backend"],
      description: "ClassSwift 平台後端服務", tech: ["Python", "FastAPI"],
    },
    {
      name: "fishing-cat", product: "classswift", hostPrefix: "learn-swift",
      aliases: ["learn-swift", "cs 學生端"],
      description: "ClassSwift 學生端 Web App", tech: ["TypeScript", "React"],
    },
    { name: "edu-droid-flutter", product: "mvbf", description: "Flutter 行動端 App", tech: ["Flutter"] },
    { name: "old-thing", product: "mvbf", description: "早期實驗", archived: true },
    { name: "some-fork", product: null, description: "上游 fork", type: "fork" },
    { name: "jay-viewsonic-km", product: null, org: "Self (jay.wj.wu)", description: "Jay 的知識中心" },
  ],
};

const q = (query: string) => filterRepos(OVERVIEW, { query, showArchived: false, showNonCode: false })
  .map((r) => r.name);

describe("matchesQuery", () => {
  it("用別名找得到（找 repo 時腦子裡想的是別名，不是 codename）", () => {
    expect(q("cs backend")).toEqual(["ocelot"]);
    expect(q("learn-swift")).toEqual(["fishing-cat"]);
  });

  it("用產品名或產品別名找得到整條線", () => {
    expect(q("classswift")).toEqual(["ocelot", "fishing-cat"]);
  });

  it("用技術找得到", () => {
    expect(q("flutter")).toEqual(["edu-droid-flutter"]);
  });

  it("多個詞是 AND —— 兩個詞要能收斂，不是放寬", () => {
    expect(q("classswift python")).toEqual(["ocelot"]);
    expect(q("classswift flutter")).toEqual([]);
  });

  it("大小寫不分、空字串等於不篩", () => {
    expect(matchesQuery(OVERVIEW.repos[0], OVERVIEW.products.classswift, "OCELOT")).toBe(true);
    expect(q("").length).toBe(4);
  });
});

describe("filterRepos", () => {
  it("已封存與 fork/keystore 預設不顯示", () => {
    expect(q("")).not.toContain("old-thing");
    expect(q("")).not.toContain("some-fork");
  });

  it("打開開關才出現", () => {
    const all = filterRepos(OVERVIEW, { query: "", showArchived: true, showNonCode: true })
      .map((r) => r.name);
    expect(all).toContain("old-thing");
    expect(all).toContain("some-fork");
  });
});

describe("groupByProduct", () => {
  const groups = groupByProduct(OVERVIEW, filterRepos(OVERVIEW, {
    query: "", showArchived: false, showNonCode: false,
  }));

  it("用 products 的顯示名，不是 key", () => {
    expect(groups[0].fullName).toBe("ClassSwift");
  });

  it("repo 多的排前面，未歸類永遠墊底", () => {
    expect(groups.map((g) => g.key)).toEqual(["classswift", "mvbf", UNGROUPED]);
  });

  it("組內照名字排，結果穩定", () => {
    expect(groups[0].repos.map((r) => r.name)).toEqual(["fishing-cat", "ocelot"]);
  });
});
