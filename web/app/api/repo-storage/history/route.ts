import { NextResponse } from "next/server";
import { readMoveHistory } from "@/lib/repoMoveHistory";

export const dynamic = "force-dynamic";

/** 搬遷紀錄（最新的在前）。CLI 與網頁的搬移都會進來，兩邊寫同一個檔。 */
export async function GET() {
  return NextResponse.json(await readMoveHistory());
}
