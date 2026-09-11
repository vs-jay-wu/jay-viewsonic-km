import { NextResponse } from "next/server";
import { readSnapshot } from "@/lib/vbBugs";

export const dynamic = "force-dynamic";

/**
 * 只回「快照是哪一版」。開著的頁面拿它輪詢，發現變了才去抓完整資料 ——
 * 完整的 payload 在幾千張票時會是 MB 級，不能每 15 秒拉一次。
 */
export async function GET() {
  const s = await readSnapshot();
  return NextResponse.json({
    fetchedAt: s?.fetchedAt ?? null,
    issueCount: s?.issueCount ?? 0,
  });
}
