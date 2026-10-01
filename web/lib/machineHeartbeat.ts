/**
 * satellite 的心跳排程：每分鐘把自己的 session 清單推給 hub。
 *
 * **這是 satellite 唯一會跑的排程**（其餘在 `instrumentation.ts` 就被擋掉了）——
 * 它不抓任何遠端資料，只是把本機事實送出去，所以不違反「第一類資料只有 hub 抓」。
 *
 * timer 掛 `globalThis`，否則 dev 模式的 HMR 會留下孤兒 interval
 * （`web/AGENTS.md` 的既有規則）。
 */

import { kmConfig } from "@/lib/kmRole";
import { listSessions } from "@/lib/sessions";

const EVERY_MS = 60_000;
const g = globalThis as unknown as { __kmHeartbeat?: NodeJS.Timeout };

async function beat(): Promise<void> {
  const cfg = kmConfig();
  if (cfg?.role !== "satellite" || !cfg.hubUrl) return;
  const sessions = await listSessions().catch(() => []);
  await fetch(`${cfg.hubUrl}/api/machines/heartbeat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ machine: cfg.machine, sessions }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined); // hub 不在是可預期的，下一次再試就好
}

export function initHeartbeat(): void {
  if (g.__kmHeartbeat) clearInterval(g.__kmHeartbeat);
  void beat();
  g.__kmHeartbeat = setInterval(() => void beat(), EVERY_MS);
}
