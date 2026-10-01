import { describe, expect, it } from "vitest";
import {
  applyHeartbeat, forgetMachine, isStale, machineCommandUrl, machineLabel,
  remoteSessions, renameMachine, EMPTY_REGISTRY, MACHINE_STALE_MS, type MachineRegistry,
} from "@/lib/machineRules";

const NOW = Date.parse("2026-10-01T10:00:00Z");
const A = { id: "uuid-a", name: "主機" };
const B = { id: "uuid-b", name: "工作筆電" };

describe("心跳", () => {
  it("同一台是覆蓋，不是新增", () => {
    // id 是一次性 uuid，改名字不該變成另一台
    let r = applyHeartbeat(EMPTY_REGISTRY, B, [{ id: "s1" }], NOW);
    r = applyHeartbeat(r, { ...B, name: "改了名字" }, [{ id: "s2" }], NOW + 1000);
    expect(r.machines).toHaveLength(1);
    expect(r.machines[0].name).toBe("改了名字");
    expect(r.machines[0].sessions).toEqual([{ id: "s2" }]);
  });

  it("不同機器各自一筆", () => {
    let r = applyHeartbeat(EMPTY_REGISTRY, A, [], NOW);
    r = applyHeartbeat(r, B, [], NOW);
    expect(r.machines.map((m) => m.id).sort()).toEqual(["uuid-a", "uuid-b"]);
  });

  it("超過寬容時間就算離線", () => {
    const r = applyHeartbeat(EMPTY_REGISTRY, B, [], NOW);
    expect(isStale(r.machines[0], NOW + MACHINE_STALE_MS - 1)).toBe(false);
    expect(isStale(r.machines[0], NOW + MACHINE_STALE_MS + 1)).toBe(true);
  });
});

describe("攤平成別台的 session", () => {
  const reg: MachineRegistry = applyHeartbeat(
    applyHeartbeat(EMPTY_REGISTRY, A, [{ id: "a1" }], NOW),
    B, [{ id: "b1" }, { id: "b2" }], NOW,
  );

  it("排除自己 —— 自己的是現場掃的，別再讀一份", () => {
    // 兩份會不一致，而且同一個 session 會出現兩次
    const out = remoteSessions(reg, "uuid-a", NOW);
    expect(out.map((r) => (r.session as { id: string }).id)).toEqual(["b1", "b2"]);
    expect(out[0].machine.name).toBe("工作筆電");
  });

  it("每一筆都帶得出「這是多久前的」", () => {
    const out = remoteSessions(reg, "uuid-a", NOW + MACHINE_STALE_MS + 1);
    expect(out[0].lastSeenAt).toBe(new Date(NOW).toISOString());
    expect(out[0].stale).toBe(true);
  });

  it("沒有 selfId（還沒設角色）就全部都算別台的", () => {
    expect(remoteSessions(reg, null, NOW)).toHaveLength(3);
  });
});

describe("要把動作送到某台機器上", () => {
  const live = applyHeartbeat(EMPTY_REGISTRY, B, [], NOW, 9501);
  const noReverse = applyHeartbeat(EMPTY_REGISTRY, B, [], NOW);

  it("活著又有反向轉發才給得出網址", () => {
    expect(machineCommandUrl(live, "uuid-b", NOW)).toEqual({ url: "http://localhost:9501" });
  });

  it("三種做不到的理由要分得出來", () => {
    // 下一步完全不同：沒這台 vs 沒開反向轉發 vs 離線了
    expect(machineCommandUrl(live, "uuid-zzz", NOW)).toEqual({ error: expect.stringContaining("不認得") });
    expect(machineCommandUrl(noReverse, "uuid-b", NOW)).toEqual({ error: expect.stringContaining("反向轉發") });
    expect(machineCommandUrl(live, "uuid-b", NOW + MACHINE_STALE_MS + 1)).toEqual({
      error: expect.stringContaining("離線"),
    });
  });
});

describe("在 hub 上改名", () => {
  it("心跳不會把改過的名字蓋回去", () => {
    // 這是整件事的重點：`name` 每分鐘被那台自己報的值覆寫一次
    let r = applyHeartbeat(EMPTY_REGISTRY, B, [], NOW, 9501);
    r = renameMachine(r, "uuid-b", "工作筆電");
    r = applyHeartbeat(r, { ...B, name: "VIM-999" }, [{ id: "s" }], NOW + 60_000, 9501);
    expect(machineLabel(r.machines[0])).toBe("工作筆電");
    expect(r.machines[0].name).toBe("VIM-999"); // 自己報的那個還留著
  });

  it("改成空字串＝取消覆寫，回到自己報的名字", () => {
    let r = renameMachine(applyHeartbeat(EMPTY_REGISTRY, B, [], NOW), "uuid-b", "工作筆電");
    r = renameMachine(r, "uuid-b", "   ");
    expect(machineLabel(r.machines[0])).toBe(B.name);
    expect(r.machines[0].displayName).toBeUndefined();
  });

  it("別台 session 的徽章用改過的名字", () => {
    let r = applyHeartbeat(EMPTY_REGISTRY, B, [{ id: "b1" }], NOW);
    r = renameMachine(r, "uuid-b", "工作筆電");
    expect(remoteSessions(r, "uuid-a", NOW)[0].machine.name).toBe("工作筆電");
  });

  it("移除之後下一次心跳會自己回來 —— 這是清單，不是封鎖", () => {
    let r = applyHeartbeat(EMPTY_REGISTRY, B, [], NOW);
    r = forgetMachine(r, "uuid-b");
    expect(r.machines).toHaveLength(0);
    r = applyHeartbeat(r, B, [], NOW + 60_000);
    expect(r.machines).toHaveLength(1);
  });
});
