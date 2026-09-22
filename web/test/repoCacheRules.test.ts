import { describe, expect, it } from "vitest";
import {
  REPO_CACHE_TTL_MS, cacheState, canServeCached, shouldRescan,
} from "@/lib/repoCacheRules";

describe("cacheState", () => {
  it("沒掃過就是 missing", () => {
    expect(cacheState(null, 1_000)).toBe("missing");
  });

  it("TTL 之內是 fresh", () => {
    expect(cacheState(1_000, 1_000 + REPO_CACHE_TTL_MS - 1)).toBe("fresh");
  });

  it("剛好到 TTL 就算過期（邊界含在 stale 這邊）", () => {
    expect(cacheState(1_000, 1_000 + REPO_CACHE_TTL_MS)).toBe("stale");
  });

  it("時鐘倒退時當成 stale，不是超新鮮", () => {
    // 睡眠喚醒／改系統時間會讓 now 比 computedAt 還早。
    // 若回 fresh，快取會一直不更新直到時間追上來。
    expect(cacheState(10_000, 5_000)).toBe("stale");
  });

  it("TTL 明顯大於一次全掃的時間（2.6 秒），否則等於沒有快取", () => {
    expect(REPO_CACHE_TTL_MS).toBeGreaterThan(10_000);
  });
});

describe("shouldRescan / canServeCached", () => {
  it("fresh：不掃，直接給快取", () => {
    expect(shouldRescan("fresh", false)).toBe(false);
    expect(canServeCached("fresh", false)).toBe(true);
  });

  it("stale：先給舊的，同時要掃（stale-while-revalidate）", () => {
    expect(shouldRescan("stale", false)).toBe(true);
    expect(canServeCached("stale", false)).toBe(true);
  });

  it("missing：只能等掃完", () => {
    expect(shouldRescan("missing", false)).toBe(true);
    expect(canServeCached("missing", false)).toBe(false);
  });

  it("force：一律重掃、而且要等新的（重新掃描按鈕）", () => {
    for (const s of ["missing", "fresh", "stale"] as const) {
      expect(shouldRescan(s, true)).toBe(true);
      expect(canServeCached(s, true)).toBe(false);
    }
  });
});
