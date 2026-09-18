import { NextResponse } from "next/server";
import { listReviewRuns, pruneReviewRuns } from "@/lib/reviewRuns";

export const dynamic = "force-dynamic";

/** `/review-local` 的執行紀錄。順手清掉過期的 —— 沒有排程在管這個目錄 */
export async function GET() {
  await pruneReviewRuns().catch(() => 0);
  return NextResponse.json({ runs: await listReviewRuns() });
}
