import { NextResponse } from "next/server";
import { togglePinned } from "@/lib/changes";

export const dynamic = "force-dynamic";

/** pin／取消 pin 一個 repo（再按一次就取消）。只是排序偏好，不動 git、也不隱藏任何東西 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { repo?: string };
  if (!body.repo) return NextResponse.json({ error: "要指定 repo" }, { status: 400 });
  return NextResponse.json({ pinned: await togglePinned(body.repo) });
}
