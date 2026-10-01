import { describe, expect, it } from "vitest";
import { updateMessage, updatePlan, type KmVersionState } from "@/lib/kmVersionRules";

const base: KmVersionState = { behind: 0, ahead: 0, dirty: false, checkedAt: "2026-10-01T00:00:00Z" };
const s = (p: Partial<KmVersionState>): KmVersionState => ({ ...base, ...p });

describe("該不該更新、誰來更新", () => {
  it("沒落後就沒事，即使自己領先（hub 上開發本來就會）", () => {
    expect(updatePlan(s({ ahead: 7 }), "hub")).toEqual({ kind: "up-to-date" });
    expect(updatePlan(s({ ahead: 7, dirty: true }), "satellite")).toEqual({ kind: "up-to-date" });
  });

  it("hub 只提議，永遠不自動 —— km 就是開發 km 的地方", () => {
    // 自動 pull 等於在你編輯到一半時抽換程式碼
    expect(updatePlan(s({ behind: 3 }), "hub")).toEqual({ kind: "offer", behind: 3 });
    expect(updatePlan(s({ behind: 3, dirty: true }), "hub")).toEqual({ kind: "offer", behind: 3 });
  });

  it("satellite 工作區乾淨就自動", () => {
    expect(updatePlan(s({ behind: 2 }), "satellite")).toEqual({ kind: "auto", behind: 2 });
  });

  it("satellite 工作區不乾淨要講出來，不是默默跳過", () => {
    // 那正是「有人在這台上開發 km」的徵兆（規則明文不該發生）
    const p = updatePlan(s({ behind: 2, dirty: true }), "satellite");
    expect(p).toMatchObject({ kind: "blocked", behind: 2 });
    expect(updateMessage(p, "Tony")).toContain("工作區不乾淨");
  });

  it("沒設角色（單機）當 hub 看待", () => {
    expect(updatePlan(s({ behind: 1 }), undefined)).toEqual({ kind: "offer", behind: 1 });
  });

  it("查不到版本時不要假裝沒事", () => {
    // 沒網路／git 壞掉時 behind 會是 0，當成「最新」是錯的
    const p = updatePlan(s({ error: "git fetch 失敗" }), "satellite");
    expect(p).toEqual({ kind: "unknown", reason: "git fetch 失敗" });
    expect(updateMessage(p, "Tony")).toContain("查不到");
  });

  it("最新時不顯示任何東西", () => {
    expect(updateMessage({ kind: "up-to-date" }, "Tony")).toBeNull();
  });
});
