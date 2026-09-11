import { describe, expect, it } from "vitest";
import { inQuietHours, taipeiHour, type QuietHours } from "@/lib/prInboxScheduler";

/** 台北時間的某個整點（台北 = UTC+8，沒有日光節約） */
function taipeiAt(hour: number): Date {
  return new Date(Date.UTC(2026, 8, 11, (hour - 8 + 24) % 24, 30));
}

const on = (startHour: number, endHour: number): QuietHours => ({
  enabled: true, startHour, endHour,
});

describe("taipeiHour", () => {
  it("用台北時區算，不跟機器的 TZ 走", () => {
    // 這個瞬間在 UTC 是 9/10 16:00，台北是 9/11 00:00
    expect(taipeiHour(new Date("2026-09-10T16:00:00Z"))).toBe(0);
    expect(taipeiHour(new Date("2026-09-11T00:00:00Z"))).toBe(8);
    expect(taipeiHour(new Date("2026-09-11T15:59:59Z"))).toBe(23);
  });
});

describe("inQuietHours — 不跨午夜的窗口（預設 00:00–08:00）", () => {
  const q = on(0, 8);

  it("窗口內的都算靜音", () => {
    for (const h of [0, 1, 5, 7]) {
      expect(inQuietHours(q, taipeiAt(h)), `台北 ${h} 點`).toBe(true);
    }
  });

  it("endHour 不含 —— 設 8 代表 08:00 就恢復巡邏", () => {
    expect(inQuietHours(q, taipeiAt(8))).toBe(false);
  });

  it("窗口外的都不算", () => {
    for (const h of [8, 9, 15, 23]) {
      expect(inQuietHours(q, taipeiAt(h)), `台北 ${h} 點`).toBe(false);
    }
  });
});

describe("inQuietHours — 跨午夜的窗口（22:00–06:00）", () => {
  const q = on(22, 6);

  it("午夜前後都要算進去", () => {
    for (const h of [22, 23, 0, 3, 5]) {
      expect(inQuietHours(q, taipeiAt(h)), `台北 ${h} 點`).toBe(true);
    }
  });

  it("白天不算", () => {
    for (const h of [6, 7, 12, 21]) {
      expect(inQuietHours(q, taipeiAt(h)), `台北 ${h} 點`).toBe(false);
    }
  });
});

describe("inQuietHours — 開關", () => {
  it("停用時任何時間都不靜音", () => {
    // 這條專門守 jq `//` 那個坑的 TS 對照：false 不能被當成「沒設定」
    const q: QuietHours = { enabled: false, startHour: 0, endHour: 8 };
    for (const h of [0, 3, 7, 12]) {
      expect(inQuietHours(q, taipeiAt(h)), `台北 ${h} 點`).toBe(false);
    }
  });

  it("start === end 視為整天靜音（因為窗口長度是 0，不會誤判成整天巡邏）", () => {
    // 目前的實作在 start === end 時走「不跨午夜」分支，h >= x && h < x 恆為 false，
    // 也就是整天都不靜音。這條測試釘住現況，改行為時會紅。
    const q = on(3, 3);
    expect(inQuietHours(q, taipeiAt(3))).toBe(false);
    expect(inQuietHours(q, taipeiAt(15))).toBe(false);
  });
});
