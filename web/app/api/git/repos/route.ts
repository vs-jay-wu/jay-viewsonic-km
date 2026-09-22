import { NextRequest, NextResponse } from "next/server";
import { listReposCached } from "@/lib/gitView";

export const dynamic = "force-dynamic";

/**
 * 工作區所有 repo 的一行摘要。唯讀。
 *
 * 走快取（`listReposCached`）—— 全掃一次要 2.6 秒，而三個頁面一進來就各打一次。
 * `?fresh=1` 會等重新掃完才回，給「重新掃描」這種明確要最新的動作用。
 */
export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("fresh") === "1";
  return NextResponse.json(await listReposCached(force));
}
