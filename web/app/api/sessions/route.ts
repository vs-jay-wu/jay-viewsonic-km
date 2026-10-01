import { NextResponse } from "next/server";
import { listSessions } from "@/lib/sessions";
import { kmConfig } from "@/lib/kmRole";
import { readMachines } from "@/lib/machines";
import { remoteSessions } from "@/lib/machineRules";

export const dynamic = "force-dynamic";

/**
 * 本機的 session ＋ 其他機器推上來的。
 *
 * **本機那批是現場掃的，別台的來自註冊表**（satellite 每分鐘推一次，
 * 見 `lib/machineRules.ts`）。所以別台的那批：
 *
 * - 帶 `machine`（哪一台）與 `machineLastSeenAt`（上次心跳）
 * - **一律 `remote: true`** —— 畫面要據此禁用刪除／開啟，那些動作只能在它自己那台做
 * - 不計入 `totalBytes`：那個數字是「**這台**磁碟上佔多少」，混進別台的會讓人
 *   以為清掉就能省空間
 */
export async function GET() {
  const sessions = await listSessions();
  const cfg = kmConfig();
  const reg = await readMachines().catch(() => ({ machines: [] }));
  const remote = remoteSessions(reg, cfg?.machine.id ?? null, Date.now()).map((r) => ({
    ...r.session,
    remote: true,
    machine: r.machine,
    machineLastSeenAt: r.lastSeenAt,
    machineStale: r.stale,
  }));

  return NextResponse.json({
    sessions: [...sessions.map((s) => ({ ...s, remote: false })), ...remote],
    totalBytes: sessions.reduce((n, s) => n + s.sizeBytes + s.sidecarBytes, 0),
    machines: reg.machines.map((m) => ({ id: m.id, name: m.name, lastSeenAt: m.lastSeenAt })),
  });
}
