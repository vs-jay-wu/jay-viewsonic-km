import { describe, expect, it } from "vitest";
import {
  afterFailure, afterSuccess, emptyHealth, isUnhealthy, FAILURE_ALERT_THRESHOLD,
} from "@/lib/healthRules";

describe("連續失敗的判準", () => {
  it(`門檻是 ${FAILURE_ALERT_THRESHOLD} 次`, () => {
    expect(FAILURE_ALERT_THRESHOLD).toBe(3);
  });

  it("偶爾失敗不算壞 —— 網路抖一下不該跳警告", () => {
    let h = emptyHealth("vb-bugs");
    h = afterFailure(h, "timeout");
    expect(isUnhealthy(h)).toBe(false);
    h = afterFailure(h, "timeout");
    expect(isUnhealthy(h)).toBe(false);
  });

  it("連續到門檻才算壞（token 過期是每次都失敗）", () => {
    let h = emptyHealth("vb-bugs");
    for (let i = 0; i < 3; i++) h = afterFailure(h, "401 Unauthorized");
    expect(isUnhealthy(h)).toBe(true);
    expect(h.lastError).toBe("401 Unauthorized");
  });

  it("成功一次就歸零 —— 中間成功過就不是「連續」", () => {
    let h = emptyHealth("vb-bugs");
    h = afterFailure(h, "e");
    h = afterFailure(h, "e");
    h = afterSuccess(h);
    expect(h.consecutiveFailures).toBe(0);
    expect(isUnhealthy(h)).toBe(false);
    h = afterFailure(h, "e");
    expect(isUnhealthy(h)).toBe(false); // 重新數，不是接續 2+1
  });

  it("成功之後仍保留上次的錯誤內容供回顧", () => {
    let h = afterFailure(emptyHealth("x"), "boom");
    h = afterSuccess(h);
    expect(h.lastError).toBe("boom");
    expect(h.lastSuccessAt).not.toBeNull();
  });

  it("錯誤訊息會截斷，不要把整份 stack 塞進狀態檔", () => {
    const h = afterFailure(emptyHealth("x"), "x".repeat(9999));
    expect(h.lastError!.length).toBe(500);
  });
});
