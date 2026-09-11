import { NextResponse } from "next/server";
import {
  ensureTimer, readConfig, readEvents, readSnapshot, refreshInBackground, schedulerState,
} from "@/lib/myPrs";

export const dynamic = "force-dynamic";

/** 只讀快照 —— 抓取是 server 定時做的，開頁面不會打 GitHub。 */
export async function GET() {
  await ensureTimer();
  // 順手在背景更新一次，但不 await —— 使用者看到的 loading 只是讀本機快照
  refreshInBackground();
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
