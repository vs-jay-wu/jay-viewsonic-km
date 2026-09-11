import { NextRequest, NextResponse } from "next/server";
import { runOnce, schedulerState } from "@/lib/vbBugs";

export const dynamic = "force-dynamic";

/** body 的 { full: true } 可以強制全同步，不等 24 小時那個週期。 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { full?: boolean };
  const res = await runOnce({ full: !!body.full });
  if (!res.ok) return NextResponse.json({ error: res.error ?? "抓取失敗" }, { status: 500 });
  return NextResponse.json({
    ok: true,
    mode: res.snapshot?.mode,
    fetchedCount: res.snapshot?.fetchedCount ?? 0,
    removed: res.snapshot?.removedKeys ?? [],
    issueCount: res.snapshot?.issueCount ?? 0,
    scheduler: schedulerState(),
  });
}
