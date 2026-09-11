import { NextRequest, NextResponse } from "next/server";
import { isStale, readSnapshot, scan } from "@/lib/buildDirs";

export const dynamic = "force-dynamic";

/**
 * 讀 build 產物的掃描結果。
 *
 * 掃一次要 du 幾十 GB（實測約 7 秒），所以預設回快取；
 * 快取過期（或沒有）時才真的掃 —— 這支 API 本來就允許慢，
 * 首頁那一塊是非同步載入的。
 */
export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("scan") === "1";
  const cached = await readSnapshot();
  if (!force && !isStale(cached)) return NextResponse.json(cached);
  return NextResponse.json(await scan());
}
