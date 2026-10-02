import { NextRequest, NextResponse } from "next/server";
import { kmConfig } from "@/lib/kmRole";
import { listSessions } from "@/lib/sessions";
import { sendToSession } from "@/lib/orca";
import { readMachines } from "@/lib/machines";
import { machineCommandUrl } from "@/lib/machineRules";

export const dynamic = "force-dynamic";

/**
 * 對**正在跑的** session 送一段 prompt。
 *
 * 跟 `/open` 同一個形狀：本機找不到就照 `machineId` 轉給擁有它的那台，
 * 而且**轉送只帶 id 與文字**，對面自己查自己的記帳 —— 分頁 handle 是那台的本機
 * 概念，帶過去沒有意義。
 *
 * ⚠️ 實際的送出只給 km 自己開的分頁（見 `lib/orca.ts` 的 `sendToSession`）。
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { text?: string; machineId?: string };
  const text = (body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "要給 text" }, { status: 400 });

  const local = (await listSessions()).some((s) => s.id === id);
  if (!local) {
    if (!body.machineId) return NextResponse.json({ error: "找不到這個 session" }, { status: 404 });
    const reg = await readMachines();
    const cfg = kmConfig();
    const target = machineCommandUrl(reg, body.machineId, Date.now(), {
      role: cfg?.role,
      hubUrl: cfg?.hubUrl,
    });
    if ("error" in target) return NextResponse.json({ error: target.error }, { status: 409 });

    const name = reg.machines.find((m) => m.id === body.machineId)?.name ?? "另一台";
    const res = await fetch(`${target.url}/api/sessions/${encodeURIComponent(id)}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(30_000),
    }).catch(() => null);
    if (!res) return NextResponse.json({ error: `連不到「${name}」` }, { status: 502 });
    const out = (await res.json().catch(() => ({ error: "對面回了看不懂的東西" }))) as Record<string, unknown>;
    return NextResponse.json({ ...out, sentTo: name }, { status: res.status });
  }

  const outcome = await sendToSession(id, text);
  const status = outcome.status === "sent" ? 200 : outcome.status === "error" ? 500 : 409;
  return NextResponse.json(outcome, { status });
}
