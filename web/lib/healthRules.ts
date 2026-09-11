/**
 * 「這個資料來源是不是壞了」的判準。純函式，客戶端與 server 共用
 * （不能帶 fs/promises 進客戶端，sessionRules 踩過）。
 */

export interface SourceHealth {
  source: string;
  /** 連續失敗幾次。成功一次就歸零 */
  consecutiveFailures: number;
  lastError: string | null;
  lastErrorAt: string | null;
  lastSuccessAt: string | null;
}

/**
 * 連續失敗幾次才算「壞了」。
 *
 * 1–2 次多半是網路抖一下或 Jira 短暫 5xx，跳出來只會讓人學會忽略警告。
 * token 過期那種是**每次都失敗**，很快就會累積到門檻。
 */
export const FAILURE_ALERT_THRESHOLD = 3;

export function isUnhealthy(
  h: SourceHealth,
  threshold = FAILURE_ALERT_THRESHOLD
): boolean {
  return h.consecutiveFailures >= threshold;
}

export function emptyHealth(source: string): SourceHealth {
  return {
    source,
    consecutiveFailures: 0,
    lastError: null,
    lastErrorAt: null,
    lastSuccessAt: null,
  };
}

/** 記一次成功：計數歸零，但保留上次的錯誤內容供回顧 */
export function afterSuccess(h: SourceHealth, at = new Date().toISOString()): SourceHealth {
  return { ...h, consecutiveFailures: 0, lastSuccessAt: at };
}

export function afterFailure(
  h: SourceHealth,
  error: string,
  at = new Date().toISOString()
): SourceHealth {
  return {
    ...h,
    consecutiveFailures: h.consecutiveFailures + 1,
    lastError: error.slice(0, 500),
    lastErrorAt: at,
  };
}
