import { describe, expect, it } from "vitest";
import {
  applyHeartbeat, isStale, remoteSessions, EMPTY_REGISTRY, MACHINE_STALE_MS,
  type MachineRegistry,
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
