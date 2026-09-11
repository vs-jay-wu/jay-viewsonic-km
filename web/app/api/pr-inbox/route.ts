import { NextResponse } from "next/server";
import { listRuns, lockState, pruneRuns, readPrScope } from "@/lib/prInbox";
import { currentState } from "@/lib/prInboxScheduler";

export const dynamic = "force-dynamic";

export async function GET() {
  // 開頁面時也修剪一次 —— 排程沒開的話這是唯一會清的時機
  await pruneRuns().catch(() => undefined);
  const [runs, lock, watcher, scope] = await Promise.all([
    listRuns(),
    lockState(),
    currentState(),
    readPrScope(),
  ]);
  return NextResponse.json({ runs, lock, watcher, scope });
}
