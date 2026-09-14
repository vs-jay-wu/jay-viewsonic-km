import { describe, expect, it } from "vitest";
import { formatGB, isLow, levelOf, parseDf, type DiskUsage } from "@/lib/diskRules";

// 逐字取自這台機器的 `df -k` 輸出
const HOME_DF = `Filesystem   1024-blocks      Used Available Capacity iused     ifree %iused  Mounted on
/dev/disk3s1   482797652 346442924  93317752    79% 5279054 933177520    1%   /System/Volumes/Data`;

const EXTERNAL_DF = `Filesystem 1024-blocks      Used Available Capacity iused ifree %iused  Mounted on
/dev/disk4s2   976729344 446699008 530030336    46%     1     0  100%   /Volumes/Crucial X9`;

describe("parseDf", () => {
  it("算出來的剩餘比例用 available/(used+available)，不是 df 的 Capacity 欄", () => {
    const d = parseDf(HOME_DF, "本機")!;
    // df 這一行的 Capacity 是 79%（已用），剩餘應該是 21% 左右
    expect(d.freePercent).toBeCloseTo(21.2, 1);
    expect(d.mount).toBe("/System/Volumes/Data");
  });

  it("**掛載點有空格也要對** —— 用最後一個 token 會變成「X9」", () => {
    expect(parseDf(EXTERNAL_DF, "外接")!.mount).toBe("/Volumes/Crucial X9");
  });

  it("壞輸入回 null，不要硬解", () => {
    expect(parseDf("", "x")).toBeNull();
    expect(parseDf("只有一行", "x")).toBeNull();
    expect(parseDf("head\nnot enough cols", "x")).toBeNull();
  });

  it("總量是 used + available（APFS 的容器是共用的，不能信 blocks 欄）", () => {
    const d = parseDf(HOME_DF, "本機")!;
    expect(d.totalBytes).toBe(d.usedBytes + d.freeBytes);
  });
});

const usage = (freePercent: number): DiskUsage => ({
  mount: "/", label: "本機", totalBytes: 100, usedBytes: 100 - freePercent,
  freeBytes: freePercent, freePercent,
});

describe("levelOf — 10% 以下警告、5% 以下要馬上處理", () => {
  it.each([
    [50, "ok"], [10.1, "ok"], [10, "ok"],
    [9.9, "warn"], [5, "warn"],
    [4.9, "critical"], [0, "critical"],
  ])("剩 %s%% → %s", (pct, level) => {
    expect(levelOf(usage(pct as number))).toBe(level);
  });

  it("isLow 只在 warn／critical 時為真", () => {
    expect(isLow(usage(21))).toBe(false);
    expect(isLow(usage(9))).toBe(true);
    expect(isLow(usage(1))).toBe(true);
  });
});

describe("formatGB", () => {
  it("100 GB 以上不給小數，以下給一位", () => {
    expect(formatGB(95_506_198_528)).toBe("88.9 GB");
    expect(formatGB(542_751_064_064)).toBe("505 GB");
  });
});
