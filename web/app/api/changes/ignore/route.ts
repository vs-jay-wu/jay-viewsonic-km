import { NextResponse } from "next/server";
import { toggleIgnored } from "@/lib/changes";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { repo?: string };
  if (!body.repo) return NextResponse.json({ error: "要指定 repo" }, { status: 400 });
  return NextResponse.json({ ignored: await toggleIgnored(body.repo) });
}
