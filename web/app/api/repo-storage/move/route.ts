import { NextResponse } from "next/server";
import { startMove } from "@/lib/repoStorage";
import type { MoveAction } from "@/lib/repoStorageRules";

export const dynamic = "force-dynamic";

/**
 * 開一個搬移工作，**不等它跑完**（最大的 repo 24 GB，走 USB 會好幾分鐘）。
 * 回 202 + job，進度去 `GET /api/repo-storage` 輪詢。
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    repo?: string;
    org?: string;
    action?: MoveAction;
  };

  const res = startMove(body.repo ?? "", body.org ?? "", body.action as MoveAction);
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: res.status ?? 400 });
  }
  return NextResponse.json({ job: res.job }, { status: 202 });
}
