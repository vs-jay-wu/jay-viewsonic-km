import { NextResponse } from "next/server";
import { runOnce, schedulerState } from "@/lib/vbBugs";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = await runOnce();
  if (!res.ok) return NextResponse.json({ error: res.error ?? "抓取失敗" }, { status: 500 });
  return NextResponse.json({
    ok: true,
    issueCount: res.snapshot?.issueCount ?? 0,
    scheduler: schedulerState(),
  });
}
