import { NextRequest, NextResponse } from "next/server";
import { lockState, triggerRun } from "@/lib/prInbox";

export const dynamic = "force-dynamic";

/** 手動觸發一輪偵測（必要時會啟動 AI）。被鎖住時直接回 409，不排隊。 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { detectOnly?: boolean };
  const lock = await lockState();
  if (lock.locked && lock.alive) {
    return NextResponse.json(
      { error: `上一輪還在跑（pid ${lock.pid}），先等它結束`, lock },
      { status: 409 }
    );
  }
  const { pid } = triggerRun(!!body.detectOnly);
  return NextResponse.json({ ok: true, pid }, { status: 202 });
}
