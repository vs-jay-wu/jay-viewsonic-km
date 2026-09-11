import { NextRequest, NextResponse } from "next/server";
import { readConfig, setConfig, togglePin, schedulerState } from "@/lib/vbBugs";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    enabled?: boolean;
    intervalSeconds?: number;
    showProductionReady?: boolean;
    pinnedProducts?: string[];
    /** 給 UI 用的捷徑：切換單一產品的 pin */
    togglePin?: string;
  };

  const config = body.togglePin
    ? await togglePin(body.togglePin)
    : await setConfig(body);

  return NextResponse.json({ ok: true, config, scheduler: schedulerState() });
}

export async function GET() {
  return NextResponse.json({ config: await readConfig() });
}
