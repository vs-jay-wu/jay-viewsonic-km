import { NextRequest, NextResponse } from "next/server";
import { readTranscript } from "@/lib/transcript";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const num = (name: string): number | undefined => {
    const raw = req.nextUrl.searchParams.get(name);
    if (raw === null) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };
  // after=0 是「跳至首筆」，所以不能用 `raw ? ...` 判斷（0 會被當成沒給）
  const page = await readTranscript(id, { before: num("before"), after: num("after") });
  if (!page) return NextResponse.json({ error: "找不到這個 session" }, { status: 404 });
  return NextResponse.json(page);
}
