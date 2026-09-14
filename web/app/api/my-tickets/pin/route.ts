import { NextResponse } from "next/server";
import { togglePin } from "@/lib/myTickets";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { key?: string };
  if (!body.key) return NextResponse.json({ error: "要指定 key" }, { status: 400 });
  return NextResponse.json({ pinned: await togglePin(body.key) });
}
