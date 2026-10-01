import { NextRequest, NextResponse } from "next/server";
import { listSessions } from "@/lib/sessions";
import { openSession } from "@/lib/orca";
import { readMachines } from "@/lib/machines";
import { machineCommandUrl } from "@/lib/machineRules";

export const dynamic = "force-dynamic";

/**
 * 在 Orca 開啟（resume）這個 session。
 *
 * cwd 一律從本機掃出來的 session 資料取，不吃前端傳來的路徑 ——
 * 那個值會被當成 `terminal create --worktree path:<cwd>` 的參數。
 *
 * **本機找不到就轉給擁有它的那台機器**（`machineId`）。轉送只帶 session id，
 * **對面自己再查一次 cwd** —— 上面那條「不吃前端傳來的路徑」因此在跨機器時
 * 一樣成立。走的是 `ssh -R` 轉回去的 loopback（`lib/machineRules.ts`）。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    registerRepo?: boolean;
    /** 這筆是別台的（`/api/sessions` 回的 `machine.id`） */
    machineId?: string;
  };

  const session = (await listSessions()).find((s) => s.id === id);

  if (!session) {
    if (!body.machineId) {
      return NextResponse.json({ error: "找不到這個 session" }, { status: 404 });
    }
    const reg = await readMachines();
    const target = machineCommandUrl(reg, body.machineId, Date.now());
    if ("error" in target) return NextResponse.json({ error: target.error }, { status: 409 });

    const name = reg.machines.find((m) => m.id === body.machineId)?.name ?? "另一台";
    const res = await fetch(`${target.url}/api/sessions/${encodeURIComponent(id)}/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // machineId 不往下傳：對面是那台機器本人，它一定在本機找得到，
      // 傳了只會讓它有機會再轉一次（無限轉送）
      body: JSON.stringify({ registerRepo: !!body.registerRepo }),
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null);

    if (!res) return NextResponse.json({ error: `連不到「${name}」` }, { status: 502 });
    const out = (await res.json().catch(() => ({ error: "對面回了看不懂的東西" }))) as Record<string, unknown>;
    return NextResponse.json({ ...out, openedOn: name }, { status: res.status });
  }

  const outcome = await openSession({
    sessionId: id,
    cwd: session.cwd,
    registerRepo: !!body.registerRepo,
  });
  return NextResponse.json(outcome);
}
