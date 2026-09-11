import { describe, expect, it } from "vitest";
import {
  driftOf, matchesStorageFilter, moveDecision, progressPercent,
  type MoveContext, type MoveJob, type RepoStorage,
} from "@/lib/repoStorageRules";

function repo(over: Partial<RepoStorage> = {}): RepoStorage {
  return {
    name: "ocelot",
    org: "Viewsonic-EDU",
    placement: "local",
    listedOffloaded: false,
    excluded: false,
    protectedReason: null,
    ...over,
  };
}

const READY: MoveContext = {
  externalMounted: true,
  externalVolume: "/Volumes/Crucial X9",
  busyWith: null,
};

describe("moveDecision", () => {
  it("本機的 repo 給「搬到外接」，外接的給「搬回本機」", () => {
    expect(moveDecision(repo({ placement: "local" }), READY)).toMatchObject({
      action: "offload",
      enabled: true,
    });
    expect(moveDecision(repo({ placement: "external" }), READY)).toMatchObject({
      action: "restore",
      enabled: true,
    });
  });

  it("受保護的 repo 一律不可搬，而且理由要蓋過其他狀況", () => {
    // 外接碟沒掛載時也要顯示「禁止搬移」，不是「請接上硬碟」——
    // 後者會讓人以為接上就能搬
    const d = moveDecision(
      repo({ protectedReason: "在 excluded 清單裡", placement: "local" }),
      { ...READY, externalMounted: false }
    );
    expect(d.enabled).toBe(false);
    expect(d.action).toBeNull();
    expect(d.reason).toContain("excluded");
  });

  it("兩邊都有的時候不給任何自動動作", () => {
    const d = moveDecision(repo({ placement: "both" }), READY);
    expect(d.enabled).toBe(false);
    expect(d.action).toBeNull();
    expect(d.reason).toContain("不會自己刪");
  });

  it("沒 clone 過的沒得搬", () => {
    expect(moveDecision(repo({ placement: "absent" }), READY)).toMatchObject({
      action: null,
      enabled: false,
    });
  });

  it("外接碟沒掛載時按鈕仍顯示動作，但停用並說明原因", () => {
    const d = moveDecision(repo({ placement: "local" }), {
      ...READY,
      externalMounted: false,
    });
    expect(d.action).toBe("offload");
    expect(d.enabled).toBe(false);
    expect(d.reason).toContain("/Volumes/Crucial X9");
  });

  it("已經有搬移在跑就全部停用，而且分得出是不是同一個 repo", () => {
    const busy: MoveContext = {
      ...READY,
      busyWith: { repo: "fishing-cat", action: "offload" },
    };
    expect(moveDecision(repo({ name: "ocelot" }), busy).reason).toContain("fishing-cat");
    expect(moveDecision(repo({ name: "fishing-cat" }), busy).reason).toContain("這個 repo");
    expect(moveDecision(repo({ name: "ocelot" }), busy).enabled).toBe(false);
  });
});

describe("driftOf", () => {
  const known = { externalKnown: true };

  it("清單與實際一致時沒有警告", () => {
    expect(driftOf(repo({ placement: "local", listedOffloaded: false }), known)).toBeNull();
    expect(driftOf(repo({ placement: "external", listedOffloaded: true }), known)).toBeNull();
  });

  it("兩個方向的不一致都抓得到", () => {
    expect(driftOf(repo({ placement: "local", listedOffloaded: true }), known)).toContain("實際在本機");
    expect(driftOf(repo({ placement: "external", listedOffloaded: false }), known)).toContain("清單沒記");
  });

  it("外接碟沒掛載時不報不一致 —— 那時 placement 本來就是從清單推來的", () => {
    // 推測值拿去跟清單比對必然一致，報出來只會是假訊息
    expect(
      driftOf(repo({ placement: "external", listedOffloaded: true }), { externalKnown: false })
    ).toBeNull();
    expect(
      driftOf(repo({ placement: "local", listedOffloaded: true }), { externalKnown: false })
    ).toBeNull();
  });

  it("兩邊都有的時候，即使外接碟狀態未知也要警告", () => {
    expect(driftOf(repo({ placement: "both" }), { externalKnown: false })).toContain("各有一份");
  });
});

describe("matchesStorageFilter", () => {
  it("both 同時算在本機與外接裡", () => {
    expect(matchesStorageFilter("both", "local")).toBe(true);
    expect(matchesStorageFilter("both", "external")).toBe(true);
  });

  it("沒有儲存資料的當成未 clone", () => {
    expect(matchesStorageFilter(undefined, "absent")).toBe(true);
    expect(matchesStorageFilter(undefined, "local")).toBe(false);
  });

  it("不限位置時全過", () => {
    expect(matchesStorageFilter("external", "all")).toBe(true);
    expect(matchesStorageFilter(undefined, "all")).toBe(true);
  });
});

describe("progressPercent", () => {
  function job(over: Partial<MoveJob> = {}): MoveJob {
    return {
      id: "1", repo: "ocelot", org: "Viewsonic-EDU", action: "offload",
      state: "running", startedAt: "", totalBytes: 1000, copiedBytes: 250,
      fileCount: 10, message: "",
      ...over,
    };
  }

  it("總量還不知道時回 null（UI 要改顯示不定長度的條）", () => {
    expect(progressPercent(job({ totalBytes: 0 }))).toBeNull();
  });

  it("du 出來的量比來源大時不會超過 100", () => {
    // 目的地檔案系統的配置單位比較大時真的會這樣
    expect(progressPercent(job({ copiedBytes: 1500 }))).toBe(100);
  });

  it("結束就是 100", () => {
    expect(progressPercent(job({ state: "done", totalBytes: 0 }))).toBe(100);
  });
});
