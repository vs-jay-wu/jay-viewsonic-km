import { NextResponse } from "next/server";
import { listRuns, lockState } from "@/lib/prInbox";
import { currentState } from "@/lib/prInboxScheduler";

export const dynamic = "force-dynamic";

export async function GET() {
  const [runs, lock, watcher] = await Promise.all([
    listRuns(),
    lockState(),
    currentState(),
  ]);
  return NextResponse.json({ runs, lock, watcher });
}
