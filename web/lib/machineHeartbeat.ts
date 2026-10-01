/**
 * 每分鐘登記一次「這台有哪些 session」。
 *
 * - **satellite**：POST 給 hub。這是它唯一會跑的排程（其餘在 `instrumentation.ts`
 *   就擋掉了）—— 它不抓任何遠端資料，只把本機事實送出去。
 * - **hub**：直接寫本機那份。**不能省** —— 少了它註冊表裡沒有 hub，於是
 *   satellite 上看不到 hub 的 session（在 B 上看不到 A 的），匯總變成單向的。
 *
 * timer 掛 `globalThis`，否則 dev 模式的 HMR 會留下孤兒 interval
 * （`web/AGENTS.md` 的既有規則）。
 */

import { kmConfig } from "@/lib/kmRole";
import { listSessions } from "@/lib/sessions";
import { applyHeartbeat } from "@/lib/machineRules";
import { updateMachines } from "@/lib/machines";

const EVERY_MS = 60_000;
const g = globalThis as unknown as { __kmHeartbeat?: NodeJS.Timeout };

async function beat(): Promise<void> {
  const cfg = kmConfig();
  if (!cfg) return;
  const sessions = await listSessions().catch(() => []);

  if (cfg.role === "hub") {
    await updateMachines((reg) =>
      applyHeartbeat(reg, cfg.machine, sessions, Date.now(), undefined, "hub"),
    ).catch(() => undefined);
    return;
  }

  if (!cfg.hubUrl) return;
  await fetch(`${cfg.hubUrl}/api/machines/heartbeat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ machine: cfg.machine, sessions, reversePort: cfg.reversePort }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined); // hub 不在是可預期的，下一次再試就好
}

export function initHeartbeat(): void {
  if (g.__kmHeartbeat) clearInterval(g.__kmHeartbeat);
  void beat();
  g.__kmHeartbeat = setInterval(() => void beat(), EVERY_MS);
}
