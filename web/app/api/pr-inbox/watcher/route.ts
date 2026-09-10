import { NextRequest, NextResponse } from "next/server";
import { setWatcher, watcherState } from "@/lib/prInbox";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: "install" | "uninstall";
    intervalSeconds?: number;
  };
  if (body.action !== "install" && body.action !== "uninstall") {
    return NextResponse.json({ error: "action 要是 install 或 uninstall" }, { status: 400 });
  }
  const res = await setWatcher(body.action, body.intervalSeconds);
  if (!res.ok) return NextResponse.json({ error: res.output }, { status: 500 });
  return NextResponse.json({ ok: true, output: res.output, watcher: await watcherState() });
}
