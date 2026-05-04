import { NextRequest, NextResponse } from "next/server";
import { deleteSummary } from "@/lib/db";

export const dynamic = "force-dynamic";

export function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ summaryId: string }> }
) {
  return params.then(({ summaryId }) => {
    const id = parseInt(summaryId, 10);
    if (isNaN(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
    deleteSummary(id);
    return NextResponse.json({ ok: true });
  });
}
