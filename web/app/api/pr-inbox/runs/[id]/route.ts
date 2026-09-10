import { NextRequest, NextResponse } from "next/server";
import { deleteRun, isValidRunId } from "@/lib/prInbox";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidRunId(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const deleted = await deleteRun(id);
  if (!deleted) return NextResponse.json({ error: "找不到這筆紀錄" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
