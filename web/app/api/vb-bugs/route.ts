import { NextResponse } from "next/server";
import { ensureTimer, readConfig, readSnapshot, schedulerState } from "@/lib/vbBugs";

export const dynamic = "force-dynamic";

/** 只讀快照 —— 抓取是 server 定時做的，開頁面不會打 Jira。 */
export async function GET() {
  await ensureTimer();
  const [snapshot, config] = await Promise.all([readSnapshot(), readConfig()]);
  return NextResponse.json({ snapshot, config, scheduler: schedulerState() });
}
