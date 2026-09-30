import { describe, expect, it } from "vitest";
import { STATE_OWNER, cachePath, statePath, stateDir } from "@/lib/statePaths";

describe("狀態檔的歸屬", () => {
  it("沒登記的名字要丟例外，不要安靜放到預設位置", () => {
    // 這是整個機制的重點：新增狀態檔時被迫先回答「這東西屬於誰」
    expect(() => statePath("something-new.json")).toThrow(/未登記歸屬/);
  });

  it("路徑落在自己那一塊底下", () => {
    expect(statePath("my-prs.json")).toMatch(/\/data\/hub\/my-prs\.json$/);
    expect(statePath("ui-settings.json")).toMatch(/\/data\/machine\/ui-settings\.json$/);
    expect(cachePath("my-prs.json")).toMatch(/\/data\/cache\/my-prs\.json$/);
    expect(stateDir("hub")).toMatch(/\/data\/hub$/);
  });

  it("目錄型的可以再接子路徑", () => {
    expect(statePath("jira-upload", "VB-2413", "a.png"))
      .toMatch(/\/data\/machine\/jira-upload\/VB-2413\/a\.png$/);
  });

  it("同一個功能的兩半可以歸屬不同", () => {
    // 要同步哪些 org 是共用設定，這台抓了什麼是本機事實
    expect(STATE_OWNER["repo-sync-config.json"]).toBe("hub");
    expect(STATE_OWNER["repo-sync.json"]).toBe("machine");
  });

  it("pin 與便條歸 hub（在 A pin 的要在 B 看得到），主題留 machine", () => {
    for (const f of ["changes-pinned.json", "git-pinned.json", "docs-pins.json",
                     "session-pins.json", "ticket-pins.json", "note.json"]) {
      expect(STATE_OWNER[f], f).toBe("hub");
    }
    expect(STATE_OWNER["ui-settings.json"]).toBe("machine");
  });

  it("遠端來的資料一律 hub —— satellite 不得自己去抓", () => {
    for (const f of ["my-prs.json", "my-tickets.json", "vb-bugs.json",
                     "pr-inbox-handled.json", "work-index.json"]) {
      expect(STATE_OWNER[f], f).toBe("hub");
    }
  });
});
