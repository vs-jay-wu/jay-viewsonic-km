import { describe, expect, it } from "vitest";
import {
  nextWindowStart, parseSummary, shouldRun, taipeiHour, windowStart,
} from "@/lib/repoSyncRules";

/** 台北時間某天某點（台北 = UTC+8，沒有日光節約） */
function taipei(day: number, hour: number, minute = 0): Date {
  return new Date(Date.UTC(2026, 8, day, hour - 8, minute));
}

describe("windowStart", () => {
  it("窗口內：20:00 之後算今天開始的窗口", () => {
    expect(windowStart(taipei(11, 20))?.toISOString()).toBe(taipei(11, 20).toISOString());
    expect(windowStart(taipei(11, 23, 59))?.toISOString()).toBe(taipei(11, 20).toISOString());
  });

  it("跨午夜：凌晨屬於**前一天**開始的窗口", () => {
    expect(windowStart(taipei(12, 0, 10))?.toISOString()).toBe(taipei(11, 20).toISOString());
    expect(windowStart(taipei(12, 6, 59))?.toISOString()).toBe(taipei(11, 20).toISOString());
  });

  it("窗口外回 null（07:00 不含，20:00 含）", () => {
    expect(windowStart(taipei(12, 7))).toBeNull();
    expect(windowStart(taipei(12, 12))).toBeNull();
    expect(windowStart(taipei(12, 19, 59))).toBeNull();
  });
});

describe("shouldRun", () => {
  it("窗口內、今晚還沒跑過 → 跑", () => {
    expect(shouldRun(taipei(11, 20, 5), null)).toBe(true);
    expect(shouldRun(taipei(11, 21), taipei(10, 21).toISOString())).toBe(true);
  });

  it("同一個窗口內已經跑過 → 不再跑（跨午夜也算同一晚）", () => {
    const ranAt = taipei(11, 20, 30).toISOString();
    expect(shouldRun(taipei(11, 23), ranAt)).toBe(false);
    expect(shouldRun(taipei(12, 3), ranAt)).toBe(false);
    expect(shouldRun(taipei(12, 6, 59), ranAt)).toBe(false);
  });

  it("窗口外一律不跑 —— 即使從來沒跑過，也不補做", () => {
    expect(shouldRun(taipei(12, 9), null)).toBe(false);
    expect(shouldRun(taipei(12, 19, 59), null)).toBe(false);
  });

  it("隔一晚又會跑", () => {
    expect(shouldRun(taipei(12, 20, 1), taipei(11, 20, 30).toISOString())).toBe(true);
  });

  it("lastRunAt 壞掉時當成沒跑過（寧可多跑一次，也不要靜靜不跑）", () => {
    expect(shouldRun(taipei(11, 21), "not-a-date")).toBe(true);
  });
});

describe("nextWindowStart", () => {
  it("白天問 → 今晚 20:00", () => {
    expect(nextWindowStart(taipei(12, 9)).toISOString()).toBe(taipei(12, 20).toISOString());
  });

  it("已經在窗口裡 → 下一個是明晚", () => {
    expect(nextWindowStart(taipei(11, 22)).toISOString()).toBe(taipei(12, 20).toISOString());
    // 凌晨問的時候，「明晚」是指當天晚上（窗口起點是前一天 20:00 ＋ 24h）
    expect(nextWindowStart(taipei(12, 3)).toISOString()).toBe(taipei(12, 20).toISOString());
  });
});

describe("taipeiHour", () => {
  it("不跟機器的 TZ 走", () => {
    expect(taipeiHour(new Date("2026-09-10T16:00:00Z"))).toBe(0);
    expect(taipeiHour(new Date("2026-09-11T15:59:59Z"))).toBe(23);
  });
});

// 逐字取自 scripts/sync-org-repos.sh 的實際輸出格式
const OUTPUT_WITH_EXTERNAL = `
Done.
Org: Viewsonic-EDU
Target: /Users/x/Orgs/Viewsonic-EDU
Total: 42
Cloned: 1
Pulled: 38
Fetched-only (dirty working tree): 2
Offloaded (skipped): 0
Offloaded (synced on external): 5
Failed: 1

Dirty repos (fetched only, please commit/stash/reset manually):
  - edu-droid-flutter
  - ragdoll-cat
`;

const OUTPUT_NO_EXTERNAL = `
Note: external path not mounted or missing: /Volumes/KM
Note: syncing local repos only; offloaded repos are skipped.
Done.
Total: 42
Cloned: 0
Pulled: 40
Fetched-only (dirty working tree): 0
Offloaded (skipped): 5
Failed: 0
`;

describe("parseSummary", () => {
  it("有掛外接：讀得到 synced 那一行", () => {
    const s = parseSummary(OUTPUT_WITH_EXTERNAL);
    expect(s.total).toBe(42);
    expect(s.cloned).toBe(1);
    expect(s.pulled).toBe(38);
    expect(s.fetchedDirty).toBe(2);
    expect(s.failed).toBe(1);
    expect(s.offloadedSynced).toBe(5);
    expect(s.externalAvailable).toBe(true);
    expect(s.dirtyRepos).toEqual(["edu-droid-flutter", "ragdoll-cat"]);
  });

  it("沒掛外接：offloaded 全部跳過，而且不是失敗", () => {
    const s = parseSummary(OUTPUT_NO_EXTERNAL);
    expect(s.externalAvailable).toBe(false);
    expect(s.offloadedSynced).toBeNull();
    expect(s.offloadedSkipped).toBe(5);
    expect(s.failed).toBe(0);
    expect(s.dirtyRepos).toEqual([]);
  });

  it("輸出對不上時回 0，不要丟例外（摘要壞掉不該讓整輪變成失敗）", () => {
    const s = parseSummary("something went sideways");
    expect(s.total).toBe(0);
    expect(s.dirtyRepos).toEqual([]);
  });
});
