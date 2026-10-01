import { NextRequest, NextResponse } from "next/server";
import { kmConfig } from "@/lib/kmRole";
import { forgetMachine, isStale, machineLabel, renameMachine } from "@/lib/machineRules";
import { readMachines, writeMachines } from "@/lib/machines";

export const dynamic = "force-dynamic";

/**
 * 有哪些機器、各自的狀態。
 *
 * **不回 `sessions`** —— 那是整包 session 清單（實測 89 筆約 35 KB／台），
 * 這個畫面只需要數量。要看內容走 `/api/sessions`。
 */
export async function GET() {
  const now = Date.now();
  const cfg = kmConfig();
  const reg = await readMachines();
  return NextResponse.json({
    self: cfg ? { id: cfg.machine.id, name: cfg.machine.name, role: cfg.role } : null,
    machines: reg.machines.map((m) => ({
      id: m.id,
      label: machineLabel(m),
      /** 那台自己報的名字。改過名之後這個還留著 —— 要連過去時需要它 */
      selfName: m.name,
      renamed: !!m.displayName,
      lastSeenAt: m.lastSeenAt,
      online: !isStale(m, now),
      reversePort: m.reversePort ?? null,
      sessionCount: m.sessions.length,
    })),
  });
}

/** 改名（`displayName`，心跳不會覆寫）或移除 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    action?: string;
    machineId?: string;
    displayName?: string;
  } | null;
  const id = body?.machineId?.trim();
  if (!id) return NextResponse.json({ error: "要給 machineId" }, { status: 400 });

  const reg = await readMachines();
  if (!reg.machines.some((m) => m.id === id)) {
    return NextResponse.json({ error: "不認得這台機器" }, { status: 404 });
  }

  if (body?.action === "rename") {
    await writeMachines(renameMachine(reg, id, body.displayName ?? ""));
    return NextResponse.json({ ok: true });
  }
  if (body?.action === "forget") {
    await writeMachines(forgetMachine(reg, id));
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "action 要是 rename / forget" }, { status: 400 });
}
