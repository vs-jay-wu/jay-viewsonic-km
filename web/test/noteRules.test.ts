import { describe, expect, it } from "vitest";
import { calendarDaysAgo, isStale, relativeWording } from "@/lib/noteRules";

/** 以 2026-09-14（週一）14:00 當「現在」 */
const now = new Date(2026, 8, 14, 14, 0, 0);
const at = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m, 0);

describe("relativeWording — 說明性用詞，不出現日期", () => {
  it.each([
    [new Date(2026, 8, 14, 13, 59, 40), "剛剛"],  // 20 秒前
    [at(14, 13, 55), "5 分鐘前"],
    [at(14, 12, 30), "1 小時前"],
    [at(14, 9, 0), "5 小時前"],
    [at(13, 23, 30), "昨天"],
    [at(12, 10, 0), "2 天前"],
    [at(9, 10, 0), "5 天前"],
    [at(6, 10, 0), "上週"],
    [at(1, 10, 0), "上週"],
  ])("%s → %s", (when, expected) => {
    expect(relativeWording(when as Date, now)).toBe(expected);
  });

  it("跨午夜之後就講「昨天」，不再講小時 —— 那才是你想知道的事", () => {
    // 昨天 23:50 寫的、今天 00:30 看：只差 40 分鐘，但已經是昨天了
    const lateNight = new Date(2026, 8, 13, 23, 50);
    const justAfterMidnight = new Date(2026, 8, 14, 0, 30);
    expect(relativeWording(lateNight, justAfterMidnight)).toBe("40 分鐘前");
    // 再過一小時（跨過一小時的界線）就改口
    const later = new Date(2026, 8, 14, 1, 30);
    expect(relativeWording(lateNight, later)).toBe("昨天");
  });

  it("時鐘倒退時不要顯示負數", () => {
    expect(relativeWording(new Date(2026, 8, 14, 15, 0), now)).toBe("剛剛");
  });

  it("更久以前用週／月", () => {
    expect(relativeWording(new Date(2026, 7, 31, 10, 0), now)).toBe("兩週前");
    expect(relativeWording(new Date(2026, 7, 24, 10, 0), now)).toBe("三週前");
    expect(relativeWording(new Date(2026, 7, 10, 10, 0), now)).toBe("上個月");
    expect(relativeWording(new Date(2026, 5, 10, 10, 0), now)).toBe("3 個月前");
  });
});

describe("calendarDaysAgo — 照日曆日算，不是 24 小時", () => {
  it("差 40 分鐘但跨了午夜就是 1 天", () => {
    expect(calendarDaysAgo(new Date(2026, 8, 13, 23, 50), new Date(2026, 8, 14, 0, 30))).toBe(1);
  });

  it("差 23 小時但同一天就是 0 天", () => {
    expect(calendarDaysAgo(at(14, 0, 30), at(14, 23, 30))).toBe(0);
  });
});

describe("isStale — 決定要不要把時間標成天藍", () => {
  it("今天寫的不標", () => {
    expect(isStale(at(14, 9), now)).toBe(false);
  });

  it("昨天以前的都要標", () => {
    expect(isStale(at(13, 23, 50), now)).toBe(true);
    expect(isStale(at(1, 10), now)).toBe(true);
  });
});
