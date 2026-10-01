import { NextResponse } from "next/server";
import { runOnce, schedulerState } from "@/lib/myPrs";
import { refuseIfNotHub } from "@/lib/hubOnly";

export const dynamic = "force-dynamic";

/** 手動抓一次（頁面上的「立即更新」）。 */
export async function POST() {
  const no = refuseIfNotHub("我的 PR");
  if (no) return no;

  const res = await runOnce();
  if (!res.ok) {
    return NextResponse.json({ error: res.error ?? "抓取失敗" }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    newEvents: res.newEvents.length,
    bootstrapped: res.bootstrapped,
    notified: res.notified,
    scheduler: schedulerState(),
  });
}
