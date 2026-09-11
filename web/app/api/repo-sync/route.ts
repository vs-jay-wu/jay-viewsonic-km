import { NextResponse } from "next/server";
import {
  ensureTimer, readConfig, readState, runOnce, schedulerState, setConfig,
} from "@/lib/repoSync";
import { nextWindowStart, shouldRun } from "@/lib/repoSyncRules";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureTimer();
  const [config, state] = await Promise.all([readConfig(), readState()]);
  const now = new Date();
  return NextResponse.json({
    config,
    state,
    scheduler: schedulerState(),
    window: {
      // 現在在窗口內、而且今晚還沒跑 → 下一個 tick 就會跑
      dueNow: shouldRun(now, state.lastRunAt),
      nextStart: nextWindowStart(now).toISOString(),
    },
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    enabled?: boolean;
  };

  if (body.action === "setEnabled") {
    const config = await setConfig({ enabled: !!body.enabled });
    return NextResponse.json({ config });
  }

  if (body.action === "run") {
    // 不 await —— 全 org 同步可能好幾分鐘，讓頁面自己輪詢狀態
    void runOnce("manual");
    return NextResponse.json({ started: true });
  }

  return NextResponse.json({ error: "不認得的 action" }, { status: 400 });
}
