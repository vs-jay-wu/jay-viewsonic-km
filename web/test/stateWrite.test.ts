import { describe, expect, it, vi, beforeEach } from "vitest";

const config = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@/lib/kmRole", () => ({ kmConfig: () => config.value }));

import { stateWriteRefusal } from "@/lib/stateWrite";
import { statePath } from "@/lib/statePaths";

const HUB_FILE = statePath("my-prs.json");
const MACHINE_FILE = statePath("ui-settings.json");

beforeEach(() => { config.value = null; });

describe("satellite 不得寫 hub 的狀態", () => {
  it("satellite 寫 hub 檔會被擋", () => {
    config.value = { role: "satellite", hubUrl: "http://h", machine: { id: "i", name: "工作筆電" } };
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
