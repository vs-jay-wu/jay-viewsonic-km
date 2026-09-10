import { NextRequest, NextResponse } from "next/server";
import { setConfig, schedulerState } from "@/lib/myPrs";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    enabled?: boolean;
    intervalSeconds?: number;
    notify?: boolean;
    mergedDays?: number;
  };
  const config = await setConfig(body);
  return NextResponse.json({ ok: true, config, scheduler: schedulerState() });
}
