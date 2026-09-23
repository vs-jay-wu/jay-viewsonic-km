import { describe, expect, it } from "vitest";
import {
  SORT_LABEL, needsFirstCommit, sortDateLabel, sortRepos, type SortKey, type SortableRepo,
} from "@/lib/repoSortRules";

const r = (o: Partial<SortableRepo> & { name: string }): SortableRepo => ({
  pinned: false, lastCommitAt: null, firstCommitAt: null, ...o,
});

describe("sortRepos", () => {
  it("pin 在任何排序下都在最前面", () => {
    const rows = [
      r({ name: "b", lastCommitAt: "2026-09-20T00:00:00Z" }),
      r({ name: "a", pinned: true, lastCommitAt: "2020-01-01T00:00:00Z" }),
    ];
    for (const k of ["default", "name", "updated", "createdAsc", "createdDesc"] as SortKey[]) {
      expect(sortRepos(rows, k)[0].name, k).toBe("a");
    }
  });

  it("預設＝最後 commit 由新到舊", () => {
    const rows = [
      r({ name: "old", lastCommitAt: "2026-01-01T00:00:00Z" }),
      r({ name: "new", lastCommitAt: "2026-09-01T00:00:00Z" }),
    ];
    expect(sortRepos(rows, "default").map((x) => x.name)).toEqual(["new", "old"]);
  });

  it("名稱排序", () => {
    const rows = [r({ name: "zebra" }), r({ name: "apple" })];
    expect(sortRepos(rows, "name").map((x) => x.name)).toEqual(["apple", "zebra"]);
  });

  it("最早建立／最晚建立是相反的方向", () => {
    const rows = [
      r({ name: "young", firstCommitAt: "2026-01-01T00:00:00Z" }),
      r({ name: "old", firstCommitAt: "2002-04-09T00:00:00Z" }),
    ];
    expect(sortRepos(rows, "createdAsc").map((x) => x.name)).toEqual(["old", "young"]);
    expect(sortRepos(rows, "createdDesc").map((x) => x.name)).toEqual(["young", "old"]);
  });

  it("沒有日期的一律排最後 —— 遞增也是", () => {
    // 外接的 repo 沒有 lastCommitAt（不跑 git）。空值當成「最小」的話，
    // 「最早建立」會變成一排沒有資料的 repo 佔滿畫面
    const rows = [
      r({ name: "none" }),
      r({ name: "has", firstCommitAt: "2020-01-01T00:00:00Z" }),
    ];
    expect(sortRepos(rows, "createdAsc").map((x) => x.name)).toEqual(["has", "none"]);
    expect(sortRepos(rows, "createdDesc").map((x) => x.name)).toEqual(["has", "none"]);
  });

  it("同分時照名字 —— 排序要穩定，重抓一次順序不該跳", () => {
    const rows = [r({ name: "b" }), r({ name: "a" }), r({ name: "c" })];
    expect(sortRepos(rows, "updated").map((x) => x.name)).toEqual(["a", "b", "c"]);
  });

  it("不動到原本的陣列", () => {
    const rows = [r({ name: "b" }), r({ name: "a" })];
    sortRepos(rows, "name");
    expect(rows.map((x) => x.name)).toEqual(["b", "a"]);
  });
});

describe("needsFirstCommit", () => {
  it("只有建立時間那兩個要算（那支 API 第一次要 9 秒）", () => {
    expect(needsFirstCommit("createdAsc")).toBe(true);
    expect(needsFirstCommit("createdDesc")).toBe(true);
    expect(needsFirstCommit("default")).toBe(false);
    expect(needsFirstCommit("name")).toBe(false);
    expect(needsFirstCommit("updated")).toBe(false);
  });

  it("每個排序都有中文標籤（新增時漏填會紅）", () => {
    for (const k of Object.keys(SORT_LABEL) as SortKey[]) expect(SORT_LABEL[k]).toBeTruthy();
  });
});

describe("sortDateLabel", () => {
  const now = new Date("2026-09-23T00:00:00Z").getTime();
  const row = (o: Partial<SortableRepo>) => r({ name: "x", ...o });

  it("預設與名稱不標日期（那時日期只是雜訊）", () => {
    const x = row({ lastCommitAt: "2026-09-20T00:00:00Z" });
    expect(sortDateLabel("default", x, now)).toBeNull();
    expect(sortDateLabel("name", x, now)).toBeNull();
  });

  it("最後更新用相對時間", () => {
    expect(sortDateLabel("updated", row({ lastCommitAt: "2026-09-23T00:00:00Z" }), now)!.text).toBe("今天");
    expect(sortDateLabel("updated", row({ lastCommitAt: "2026-09-22T00:00:00Z" }), now)!.text).toBe("昨天");
    expect(sortDateLabel("updated", row({ lastCommitAt: "2026-09-13T00:00:00Z" }), now)!.text).toBe("10 天前");
    expect(sortDateLabel("updated", row({ lastCommitAt: "2026-06-23T00:00:00Z" }), now)!.text).toBe("3 個月前");
  });

  it("超過一年就寫日期 —— 沒有人在心算「427 天前」", () => {
    expect(sortDateLabel("updated", row({ lastCommitAt: "2024-01-05T00:00:00Z" }), now)!.text).toBe("2024-01-05");
  });

  it("建立時間一律寫日期（動輒差好幾年，相對時間沒有解析度）", () => {
    const x = row({ firstCommitAt: "2002-04-09T15:14:06Z" });
    expect(sortDateLabel("createdAsc", x, now)!.text).toBe("2002-04-09");
    expect(sortDateLabel("createdDesc", x, now)!.text).toBe("2002-04-09");
  });

  it("各自看各自的欄位，不會拿錯", () => {
    const x = row({ lastCommitAt: "2026-09-20T00:00:00Z", firstCommitAt: "2020-01-01T00:00:00Z" });
    expect(sortDateLabel("updated", x, now)!.text).toBe("3 天前");
    expect(sortDateLabel("createdAsc", x, now)!.text).toBe("2020-01-01");
  });

  it("沒有值就是「—」，不是空白（空白看起來像壞了）", () => {
    expect(sortDateLabel("updated", row({}), now)).toEqual({ text: "—", title: "沒有紀錄" });
  });

  it("未來的日期不會變成「-3 天前」", () => {
    expect(sortDateLabel("updated", row({ lastCommitAt: "2027-01-01T00:00:00Z" }), now)!.text).toBe("2027-01-01");
  });
});
