import { describe, expect, it, vi, beforeEach } from "vitest";

const config = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@/lib/kmRole", () => ({ kmConfig: () => config.value }));

import { stateWriteRefusal } from "@/lib/stateWrite";
import { statePath } from "@/lib/statePaths";

const HUB_FILE = statePath("my-prs.json");
const MACHINE_FILE = statePath("ui-settings.json");

beforeEach(() => { config.value = null; });

describe("satellite 不得就地寫 hub 的狀態", () => {
  it("有 hub 可以轉送時不算拒絕 —— 它會寫到 hub 去", () => {
    // 2026-10-01 階段 1 起：satellite 改 pin／便條是**轉送**，不是擋掉。
    // pin 歸 hub 就是為了「在 A pin 的在 B 看得到」，本機寫一份誰也看不到
    config.value = { role: "satellite", hubUrl: "http://h", machine: { id: "i", name: "工作筆電" } };
    expect(stateWriteRefusal(HUB_FILE)).toBeNull();
  });

  it("不知道 hub 是誰才真的拒絕", () => {
    config.value = { role: "satellite", machine: { id: "i", name: "工作筆電" } };
    expect(stateWriteRefusal(HUB_FILE)).toContain("工作筆電");
  });

  it("satellite 寫自己的檔沒問題", () => {
    config.value = { role: "satellite", hubUrl: "http://h", machine: { id: "i", name: "工作筆電" } };
    expect(stateWriteRefusal(MACHINE_FILE)).toBeNull();
  });

  it("hub 什麼都能寫", () => {
    config.value = { role: "hub", machine: { id: "i", name: "主機" } };
    expect(stateWriteRefusal(HUB_FILE)).toBeNull();
    expect(stateWriteRefusal(MACHINE_FILE)).toBeNull();
  });

  it("還沒設定角色的單機一律放行", () => {
    // 擋下來只會讓還沒做多機器設定的 km 整個壞掉，而單機本來就沒有這個問題
    expect(stateWriteRefusal(HUB_FILE)).toBeNull();
  });

  it("不在 data/ 底下的路徑不歸這條管", () => {
    config.value = { role: "satellite", hubUrl: "http://h", machine: { id: "i", name: "工作筆電" } };
    expect(stateWriteRefusal("/tmp/whatever.json")).toBeNull();
  });
});
