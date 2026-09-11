import { NextResponse } from "next/server";
import { reconcile } from "@/lib/repoStorage";

export const dynamic = "force-dynamic";

/** 把 offloaded 清單對齊實際狀態。只改 JSON，不搬任何檔案。 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { org?: string };
  if (!body.org) return NextResponse.json({ error: "要指定 org" }, { status: 400 });

  const res = await reconcile(body.org);
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
