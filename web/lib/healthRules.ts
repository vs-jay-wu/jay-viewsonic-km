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

/**
 * 認證類的錯誤**不會自己好** —— token 過期就是過期，等一百次還是失敗。
 * 這種第一次就該講，不必等累積到門檻。
 */
export const AUTH_ALERT_THRESHOLD = 1;

export type ErrorKind = "auth" | "other";

/**
 * 這個錯誤需不需要人介入。
 *
 * 判斷順序有意義：**先排除流量限制**再看認證關鍵字。GitHub 的 rate limit
 * 也是 403，但那會自己好，不該叫人去重新產 token。
 */
export function classifyError(error: string | null): ErrorKind {
  if (!error) return "other";
  const e = error.toLowerCase();
  if (/rate limit|ratelimit|secondary limit|abuse detection|too many requests|429/.test(e)) {
    return "other";
  }
  if (/401|403|unauthorized|forbidden|authentication|bad credentials|token|gh auth|未登入|憑證|認證/.test(e)) {
    return "auth";
  }
  return "other";
}

export function thresholdFor(kind: ErrorKind): number {
  return kind === "auth" ? AUTH_ALERT_THRESHOLD : FAILURE_ALERT_THRESHOLD;
}

export function isUnhealthy(h: SourceHealth): boolean {
  return h.consecutiveFailures >= thresholdFor(classifyError(h.lastError));
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


/**
 * 從 PR 巡邏的執行紀錄推導連續失敗次數。
 *
 * 那一段是 shell 腳本 detached 跑的，TS 這邊看不到結果，只能事後從紀錄推。
 * 由新到舊走：
 *   clean / detected / handled → 成功，停止計數
 *   failed / detect-failed     → 失敗
 *   skipped / aborted          → **跳過不計**：被鎖擋掉根本沒試，
 *                                被中斷是人為停掉，都不是服務壞了
 */
export interface RunLike {
  status: string;
  startedAt: string;
  note?: string;
}

export function healthFromRuns(source: string, runsNewestFirst: RunLike[]): SourceHealth {
  const h = emptyHealth(source);
  let counting = true;
  for (const r of runsNewestFirst) {
    if (r.status === "skipped" || r.status === "aborted") continue;
    const failed = r.status === "failed" || r.status === "detect-failed";
    if (failed) {
      if (counting) {
        h.consecutiveFailures++;
        if (!h.lastError) {
          h.lastError = (r.note ?? r.status).slice(0, 500);
          h.lastErrorAt = r.startedAt;
        }
      }
    } else {
      counting = false;
      if (!h.lastSuccessAt) h.lastSuccessAt = r.startedAt;
      if (h.lastError) break;
    }
  }
  return h;
}
