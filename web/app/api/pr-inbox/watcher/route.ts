import { NextRequest, NextResponse } from "next/server";
import { currentState, setSchedule } from "@/lib/prInboxScheduler";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ watcher: await currentState() });
}

/** 開關排程與調整間隔。設定寫進檔案，server 重開會自己接回去。 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    enabled?: boolean;
    intervalSeconds?: number;
    detectOnly?: boolean;
  };
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "要給 enabled（true/false）" }, { status: 400 });
  }
  const watcher = await setSchedule({
    enabled: body.enabled,
    intervalSeconds: body.intervalSeconds,
    detectOnly: body.detectOnly,
  });
  return NextResponse.json({ ok: true, watcher });
}
