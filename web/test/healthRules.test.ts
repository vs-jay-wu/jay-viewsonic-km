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

import { classifyError, healthFromRuns, thresholdFor, AUTH_ALERT_THRESHOLD } from "@/lib/healthRules";

describe("classifyError：要不要人介入", () => {
  it("認證類 → auth（不會自己好）", () => {
    for (const e of [
      "HTTP 401 Unauthorized",
      "gh 未登入，先跑 gh auth login",
      "Bad credentials",
      "Atlassian 認證失敗（HTTP 403）",
      "ATLASSIAN_API_TOKEN 過期",
    ]) {
      expect(classifyError(e), e).toBe("auth");
    }
  });

  it("流量限制 → other，即使它也是 403", () => {
    // 這條是重點：rate limit 會自己好，不該叫人去重新產 token
    for (const e of [
      "HTTP 403: API rate limit exceeded",
      "You have exceeded a secondary rate limit",
      "429 Too Many Requests",
    ]) {
      expect(classifyError(e), e).toBe("other");
    }
  });

  it("一般錯誤 → other", () => {
    expect(classifyError("timeout")).toBe("other");
    expect(classifyError("HTTP 502 Bad Gateway")).toBe("other");
    expect(classifyError(null)).toBe("other");
  });

  it("認證類第一次就示警，其餘要連續 3 次", () => {
    expect(thresholdFor("auth")).toBe(AUTH_ALERT_THRESHOLD);
    expect(thresholdFor("auth")).toBe(1);
    expect(thresholdFor("other")).toBe(3);
  });
});

describe("healthFromRuns：從 PR 巡邏的執行紀錄推導", () => {
  const run = (status: string, startedAt = "2026-09-11T00:00:00Z", note?: string) =>
    ({ status, startedAt, note });

  it("由新到舊數連續失敗，遇到成功就停", () => {
    const h = healthFromRuns("pr-inbox", [
      run("detect-failed", "2026-09-11T03:00:00Z", "gh 未登入"),
      run("failed", "2026-09-11T02:00:00Z"),
      run("clean", "2026-09-11T01:00:00Z"),
      run("failed", "2026-09-11T00:00:00Z"), // 成功之前的不算
    ]);
    expect(h.consecutiveFailures).toBe(2);
    expect(h.lastError).toBe("gh 未登入");
    expect(h.lastSuccessAt).toBe("2026-09-11T01:00:00Z");
  });

  it("skipped 不計 —— 被鎖擋掉根本沒去試", () => {
    const h = healthFromRuns("pr-inbox", [
      run("skipped"), run("skipped"), run("clean"),
    ]);
    expect(h.consecutiveFailures).toBe(0);
  });

  it("aborted 不計 —— 那是人為中斷，不是服務壞了", () => {
    const h = healthFromRuns("pr-inbox", [
      run("aborted"), run("failed", "2026-09-11T02:00:00Z", "boom"), run("handled"),
    ]);
    expect(h.consecutiveFailures).toBe(1);
  });

  it("全部都失敗時也算得出來", () => {
    const h = healthFromRuns("pr-inbox", [run("failed"), run("failed"), run("failed")]);
    expect(h.consecutiveFailures).toBe(3);
    expect(h.lastSuccessAt).toBeNull();
  });

  it("沒有紀錄時是健康的", () => {
    expect(healthFromRuns("pr-inbox", []).consecutiveFailures).toBe(0);
  });
});
