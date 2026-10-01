import { NextRequest, NextResponse } from "next/server";
import { kmConfig } from "@/lib/kmRole";
import { applyHeartbeat, type MachineRef } from "@/lib/machineRules";
import { readMachines, writeMachines } from "@/lib/machines";

export const dynamic = "force-dynamic";

/**
 * satellite 的心跳：報到 ＋ 推上自己的 session 清單。
 *
 * **推而不是拉**，因為 `ssh -L` 只讓 satellite 連得到 hub，反過來不行
 * （`lib/machineRules.ts` 的檔頭）。
 */
export async function POST(req: NextRequest) {
  if (kmConfig()?.role === "satellite") {
    return NextResponse.json({ error: "這台是 satellite，不收心跳" }, { status: 409 });
  }
  const body = (await req.json().catch(() => null)) as {
    machine?: MachineRef;
    sessions?: unknown[];
    reversePort?: number;
  } | null;
  const id = body?.machine?.id?.trim();
  const name = body?.machine?.name?.trim();
  if (!id || !name) return NextResponse.json({ error: "要給 machine.id 與 machine.name" }, { status: 400 });

  const reg = applyHeartbeat(
    await readMachines(), { id, name }, body?.sessions ?? [], Date.now(), body?.reversePort,
  );
  await writeMachines(reg);
  return NextResponse.json({ ok: true, machines: reg.machines.length });
}
