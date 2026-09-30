import { describe, expect, it } from "vitest";
import {
  applyPairRequest, approve, checkClaim, formatCode, isExpired, MAX_PENDING,
  PENDING_TTL_MS, prunePending, revoke, EMPTY_STORE, type DeviceStore,
} from "@/lib/deviceRules";

const NOW = Date.parse("2026-09-30T10:00:00Z");
const req = (n: number) => ({
  machineId: `id-${n}`, machineName: `機器 ${n}`, hostname: `host-${n}`,
  code: String(100000 + n), claim: `claim-${n}`,
});

function pend(store: DeviceStore, n: number, now = NOW): DeviceStore {
  const o = applyPairRequest(store, req(n), now);
  if (o.kind !== "pending") throw new Error(o.kind);
  return o.store;
}

describe("配對請求", () => {
  it("同一台重打是覆蓋自己那筆，不是新增", () => {
    // 重試是正常行為；每次都長一筆的話清單會被自己洗掉
    let s = pend(EMPTY_STORE, 1);
    s = pend(s, 1);
    expect(s.pending).toHaveLength(1);
  });

  it("待核可有上限", () => {
    let s = EMPTY_STORE;
    for (let i = 0; i < MAX_PENDING; i++) s = pend(s, i);
    expect(applyPairRequest(s, req(99), NOW)).toEqual({ kind: "too-many" });
    // 但已經在清單上的那台還是可以重打（不佔新名額）
    expect(applyPairRequest(s, req(0), NOW).kind).toBe("pending");
  });

  it("已核可的機器重新配對不會拿到新 token", () => {
    // 不然誰都能換一把新鑰匙；真的掉了要在 hub 上先撤銷
    const r = approve(pend(EMPTY_STORE, 1), "id-1", "tok", NOW)!;
    expect(applyPairRequest(r.store, req(1), NOW)).toMatchObject({ kind: "already-approved" });
  });

  it("過期的會被清掉", () => {
    const s = pend(EMPTY_STORE, 1);
    expect(isExpired(s.pending[0], NOW + PENDING_TTL_MS + 1)).toBe(true);
    expect(prunePending(s, NOW + PENDING_TTL_MS + 1).pending).toHaveLength(0);
    expect(prunePending(s, NOW + 1000).pending).toHaveLength(1);
  });
});

describe("取件（claim）", () => {
  it("claim 對才說得出在等，核可後才給 token", () => {
    const s = pend(EMPTY_STORE, 1);
    expect(checkClaim(s, "id-1", "claim-1")).toEqual({ kind: "waiting" });
    const r = approve(s, "id-1", "the-token", NOW)!;
    expect(checkClaim(r.store, "id-1", "claim-1")).toEqual({ kind: "approved", token: "the-token" });
  });

  it("claim 不對與「沒這台」回一樣的東西", () => {
    // 分開回的話，拿著錯 claim 的人就能用回應差異確認 machineId 存不存在
    const s = pend(EMPTY_STORE, 1);
    expect(checkClaim(s, "id-1", "wrong")).toEqual({ kind: "unknown" });
    expect(checkClaim(s, "id-nope", "claim-1")).toEqual({ kind: "unknown" });
  });
});

describe("核可與撤銷", () => {
  it("核可會把那筆從 pending 移走", () => {
    const r = approve(pend(EMPTY_STORE, 1), "id-1", "tok", NOW)!;
    expect(r.store.pending).toHaveLength(0);
    expect(r.store.devices).toHaveLength(1);
    expect(r.device).toMatchObject({ id: "id-1", name: "機器 1", token: "tok" });
  });

  it("核可不存在的那筆回 null（過期了就是這樣）", () => {
    expect(approve(EMPTY_STORE, "id-x", "tok", NOW)).toBeNull();
  });

  it("撤銷把兩邊都清掉（防守用：正常流程走不到兩邊同時有）", () => {
    // 正常流程產生不出「同一台同時在 pending 與 devices」——`approve` 會把它從
    // pending 移走，而 `applyPairRequest` 對已核可的直接回 already-approved。
    // 這條守的是手動改過 devices.json 之類的情況，所以 store 直接組出來。
    const s: DeviceStore = {
      pending: [{ ...req(1), requestedAt: new Date(NOW).toISOString() }],
      devices: [{ id: "id-1", name: "機器 1", token: "tok", approvedAt: new Date(NOW).toISOString() }],
    };
    const after = revoke(s, "id-1");
    expect(after.pending).toHaveLength(0);
    expect(after.devices).toHaveLength(0);
  });

  it("同一台再核可一次是換鑰匙，不是多一筆", () => {
    const s: DeviceStore = {
      pending: [{ ...req(1), requestedAt: new Date(NOW).toISOString() }],
      devices: [{ id: "id-1", name: "舊名字", token: "tok1", approvedAt: new Date(NOW).toISOString() }],
    };
    const r = approve(s, "id-1", "tok2", NOW)!;
    expect(r.store.devices).toHaveLength(1);
    expect(r.store.devices[0].token).toBe("tok2");
  });
});

it("配對碼分段比較好念", () => {
  expect(formatCode("418203")).toBe("418 203");
  expect(formatCode("42")).toBe("42");
});
