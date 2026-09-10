import { NextRequest, NextResponse } from "next/server";
import { readTranscript } from "@/lib/transcript";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const beforeRaw = req.nextUrl.searchParams.get("before");
  const before = beforeRaw ? Number(beforeRaw) : undefined;
  const page = await readTranscript(id, Number.isFinite(before) ? before : undefined);
  if (!page) return NextResponse.json({ error: "找不到這個 session" }, { status: 404 });
  return NextResponse.json(page);
}
