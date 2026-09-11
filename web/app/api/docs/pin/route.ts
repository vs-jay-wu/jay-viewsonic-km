import { NextResponse } from "next/server";
import { togglePin } from "@/lib/docs";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { dir?: string };
  if (!body.dir) return NextResponse.json({ error: "要指定 dir" }, { status: 400 });
  return NextResponse.json({ pinned: await togglePin(body.dir) });
}
