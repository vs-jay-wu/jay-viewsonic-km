import { NextResponse } from "next/server";
import { runOnce } from "@/lib/myTickets";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { full?: boolean };
  const res = await runOnce({ full: !!body.full });
  return NextResponse.json(res, { status: res.ok ? 200 : 500 });
}
