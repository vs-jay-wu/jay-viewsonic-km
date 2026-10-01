import { NextResponse } from "next/server";
import { runOnce } from "@/lib/myTickets";
import { refuseIfNotHub } from "@/lib/hubOnly";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const no = refuseIfNotHub("指派給我的單");
  if (no) return no;

  const body = (await request.json().catch(() => ({}))) as { full?: boolean };
  const res = await runOnce({ full: !!body.full });
  return NextResponse.json(res, { status: res.ok ? 200 : 500 });
}
