import { NextRequest, NextResponse } from "next/server";
import { readRunLog } from "@/lib/prInbox";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const log = await readRunLog(id);
  if (log === null) return NextResponse.json({ error: "沒有 log" }, { status: 404 });
  return NextResponse.json({ id, log });
}
