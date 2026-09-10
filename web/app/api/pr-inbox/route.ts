import { NextResponse } from "next/server";
import { listRuns, lockState, watcherState } from "@/lib/prInbox";

export const dynamic = "force-dynamic";

export async function GET() {
  const [runs, lock, watcher] = await Promise.all([
    listRuns(),
    lockState(),
    watcherState(),
  ]);
  return NextResponse.json({ runs, lock, watcher });
}
