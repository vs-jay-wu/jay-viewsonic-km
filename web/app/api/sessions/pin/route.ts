import { NextRequest, NextResponse } from "next/server";
import { setPinned } from "@/lib/sessions";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { id?: string; pinned?: boolean };
  if (!body.id) return NextResponse.json({ error: "缺 id" }, { status: 400 });
  const ok = await setPinned(body.id, !!body.pinned);
  if (!ok) return NextResponse.json({ error: "id 格式不對" }, { status: 400 });
  return NextResponse.json({ ok: true, id: body.id, pinned: !!body.pinned });
}
