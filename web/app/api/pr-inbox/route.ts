import { NextResponse } from "next/server";
import { listRuns, lockState, pruneRuns } from "@/lib/prInbox";
import { currentState } from "@/lib/prInboxScheduler";

export const dynamic = "force-dynamic";

export async function GET() {
  // 開頁面時也修剪一次 —— 排程沒開的話這是唯一會清的時機
  await pruneRuns().catch(() => undefined);
  const [runs, lock, watcher] = await Promise.all([
    listRuns(),
    lockState(),
    currentState(),
  ]);
  return NextResponse.json({ runs, lock, watcher });
}
