import { NextResponse } from "next/server";
import {
  ensureTimer, readConfig, readEvents, readSnapshot, schedulerState,
} from "@/lib/myPrs";

export const dynamic = "force-dynamic";

/** 只讀快照 —— 抓取是 server 定時做的，開頁面不會打 GitHub。 */
export async function GET() {
  await ensureTimer();
  const [snapshot, config, events] = await Promise.all([
    readSnapshot(),
    readConfig(),
    readEvents(),
  ]);
  return NextResponse.json({
    snapshot,
    config,
    events,
    unread: events.filter((e) => !e.read).length,
    scheduler: schedulerState(),
  });
}
