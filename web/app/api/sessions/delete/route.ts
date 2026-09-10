import { NextRequest, NextResponse } from "next/server";
import { deleteSessions } from "@/lib/sessions";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { ids?: string[] };
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: "缺 ids" }, { status: 400 });
  }
  const results = await deleteSessions(body.ids);
  return NextResponse.json({
    results,
    deleted: results.filter((r) => r.ok).length,
    freedBytes: results.reduce((n, r) => n + r.freedBytes, 0),
  });
}
