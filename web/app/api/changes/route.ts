import { NextResponse } from "next/server";
import { scanChanges } from "@/lib/changes";

export const dynamic = "force-dynamic";

/** 每次都重掃（這頁的價值就是「現在長怎樣」，快取只會給你舊的） */
export async function GET() {
  return NextResponse.json(await scanChanges());
}
