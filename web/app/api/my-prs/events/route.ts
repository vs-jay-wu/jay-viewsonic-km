import { NextRequest, NextResponse } from "next/server";
import { clearEvents, markEventsRead, readEvents } from "@/lib/myPrs";

export const dynamic = "force-dynamic";

/** action: "read"（標為已讀，可帶 ids）／"clear"（全部清掉） */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: "read" | "clear";
    ids?: string[];
  };
  if (body.action === "clear") {
    await clearEvents();
    return NextResponse.json({ ok: true, events: [] });
  }
  if (body.action === "read") {
    const events = await markEventsRead(body.ids);
    return NextResponse.json({ ok: true, events });
  }
  return NextResponse.json({ error: "action 要是 read 或 clear" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({ events: await readEvents() });
}
