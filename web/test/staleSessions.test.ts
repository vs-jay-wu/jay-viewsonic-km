import { describe, expect, it } from "vitest";
import { isDefaultWorkContext, isStale, STALE_DAYS } from "@/lib/sessionRules";

const NOW = Date.parse("2026-09-11T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

describe("isStale", () => {
  it(`預設門檻是 ${STALE_DAYS} 天`, () => {
    expect(STALE_DAYS).toBe(30);
  });

  it("超過門檻才算", () => {
    expect(isStale({ pinned: false, modifiedAt: daysAgo(31) }, 30, NOW)).toBe(true);
    expect(isStale({ pinned: false, modifiedAt: daysAgo(29) }, 30, NOW)).toBe(false);
  });

  it("剛好等於門檻不算（要「超過」）", () => {
    expect(isStale({ pinned: false, modifiedAt: daysAgo(30) }, 30, NOW)).toBe(false);
  });

  it("pin 住的永遠不算 —— 再舊也不列入可刪", () => {
    expect(isStale({ pinned: true, modifiedAt: daysAgo(999) }, 30, NOW)).toBe(false);
  });

  it("時間壞掉就不要歸類成可刪", () => {
    expect(isStale({ pinned: false, modifiedAt: "not-a-date" }, 30, NOW)).toBe(false);
    expect(isStale({ pinned: false, modifiedAt: "" }, 30, NOW)).toBe(false);
  });

  it("門檻可調", () => {
    expect(isStale({ pinned: false, modifiedAt: daysAgo(45) }, 60, NOW)).toBe(false);
    expect(isStale({ pinned: false, modifiedAt: daysAgo(45) }, 30, NOW)).toBe(true);
  });
});

describe("isDefaultWorkContext", () => {
  const km = "/Users/jay/ProjectsWork_GitHub/jay-viewsonic-km";

  it("km 的主 checkout ＋ master 是日常，不用顯示", () => {
    expect(isDefaultWorkContext(km, "master")).toBe(true);
  });

  it("同一個 repo 但在別的分支 → 要顯示（那才是值得看的資訊）", () => {
    expect(isDefaultWorkContext(km, "Jay/VB-1234-x")).toBe(false);
  });

  it("別的 repo 一律顯示", () => {
    expect(isDefaultWorkContext("/x/Orgs/Viewsonic-EDU/edu-droid-flutter", "master")).toBe(false);
  });

  it("km 的 worktree 不算日常 —— 名字很像，但那是另一個工作區", () => {
    expect(isDefaultWorkContext(`${km}-vb-2193`, "master")).toBe(false);
  });

  it("結尾有斜線也要認得", () => {
    expect(isDefaultWorkContext(`${km}/`, "master")).toBe(true);
  });

  it("沒有分支資訊（detached／不是 git）就顯示", () => {
    expect(isDefaultWorkContext(km, null)).toBe(false);
  });
});
