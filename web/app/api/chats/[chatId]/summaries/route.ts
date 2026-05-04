import { NextRequest, NextResponse } from "next/server";
import { listSummaries, createSummary } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  return params.then(({ chatId }) => {
    const id = parseInt(chatId, 10);
    if (isNaN(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
    return NextResponse.json(listSummaries(id));
  });
}

export function POST(
  req: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  return params.then(async ({ chatId }) => {
    const id = parseInt(chatId, 10);
    if (isNaN(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

    const body = await req.json();
    const summary = createSummary({ ...body, chat_id: id });
    return NextResponse.json(summary, { status: 201 });
  });
}
