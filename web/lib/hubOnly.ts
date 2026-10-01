/**
 * 「這件事只有 hub 做得了」的守衛。
 *
 * **第一類資料（PR／Jira／VB Bug）只有 hub 抓**（Jay 2026-09-30，
 * `docs/ideas/km-multi-machine.md` §2）。排程在 `instrumentation.ts` 就擋住了，
 * 但**手動觸發的 refresh 端點沒有** —— 2026-10-01 實際咬到：
 *
 * ```
 * satellite 沒有 .env（gitignored，從來沒複製過去）
 *   → 在 satellite 上觸發 my-tickets → 缺少 ATLASSIAN_API_TOKEN
 *   → recordFailure 寫 health.json → 那時 health 是 hub 擁有的 → 轉送到 hub
 *   → hub 的首頁跳警告，看起來像「hub 自己失敗了」
 * ```
 *
 * 所以守衛要在**動作的入口**，不是只在排程。
 */

import { NextResponse } from "next/server";
import { kmConfig } from "@/lib/kmRole";

/** 不是 hub 就回一個講得清楚的 409；是 hub 就回 null，呼叫端照常往下走 */
export function refuseIfNotHub(what: string): NextResponse | null {
  const cfg = kmConfig();
  if (cfg?.role !== "satellite") return null;
  return NextResponse.json(
    {
      error: `「${cfg.machine.name}」是 satellite，不自己抓${what} —— 這類資料只有 hub 抓。要重新整理請到 hub 上做。`,
    },
    { status: 409 },
  );
}
