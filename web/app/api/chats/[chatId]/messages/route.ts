import { NextRequest, NextResponse } from "next/server";
import { getMessages } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  return params.then(({ chatId }) => {
    const id = parseInt(chatId, 10);
    if (isNaN(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

    const before = req.nextUrl.searchParams.get("before") ?? undefined;
    const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10);

    const messages = getMessages(id, limit, before);
    // 回傳時轉為時間正序（UI 用）
    return NextResponse.json(messages.reverse());
  });
}
