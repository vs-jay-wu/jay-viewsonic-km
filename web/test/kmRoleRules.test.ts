import { describe, expect, it } from "vitest";
import { hubWriteRefusal, parseKmConfig } from "@/lib/kmRoleRules";

const ok = { role: "hub", machine: { id: "uuid-1", name: "工作筆電" } };

describe("角色設定的解析", () => {
  it("合法的 hub 設定", () => {
    const r = parseKmConfig({ km: ok });
    expect(r).toEqual({ config: { role: "hub", hubUrl: undefined, machine: { id: "uuid-1", name: "工作筆電" } } });
  });

  it("satellite 一定要有 hubUrl —— 不然它要向誰取資料", () => {
    const bad = parseKmConfig({ km: { ...ok, role: "satellite" } });
    expect(bad).toEqual({ error: expect.stringContaining("hubUrl") });
    const good = parseKmConfig({ km: { ...ok, role: "satellite", hubUrl: "http://mac-hub:9487" } });
    expect(good).toEqual({ config: expect.objectContaining({ role: "satellite", hubUrl: "http://mac-hub:9487" }) });
  });

  it("沒設定不猜一個預設角色", () => {
    // 猜錯的後果是資料同步方向反了，比開不起來貴得多
    for (const ws of [{}, { km: null }, { km: { machine: ok.machine } }, { km: { role: "primary", machine: ok.machine } }]) {
      expect(parseKmConfig(ws), JSON.stringify(ws)).toHaveProperty("error");
    }
  });

  it("machine.id 與 name 都是必要的，空白不算", () => {
    expect(parseKmConfig({ km: { role: "hub", machine: { name: "x" } } })).toEqual({ error: expect.stringContaining("machine.id") });
    expect(parseKmConfig({ km: { role: "hub", machine: { id: "  ", name: "x" } } })).toEqual({ error: expect.stringContaining("machine.id") });
    expect(parseKmConfig({ km: { role: "hub", machine: { id: "x" } } })).toEqual({ error: expect.stringContaining("machine.name") });
  });

  it("拒絕訊息要講得出機器名與檔名，人才知道是哪一台在擋什麼", () => {
    const msg = hubWriteRefusal("my-prs.json", "工作筆電");
    expect(msg).toContain("工作筆電");
    expect(msg).toContain("my-prs.json");
  });
});
