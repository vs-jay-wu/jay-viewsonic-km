import { NextRequest, NextResponse } from "next/server";
import { isKnownWorktree } from "@/lib/changes";
import { toggleManual } from "@/lib/workChanges";

export const dynamic = "force-dynamic";

/** 手動把一個 worktree 加進某條線（再按一次就移除）。自動偵測一定會漏，這是逃生口 */
export async function POST(req: NextRequest) {
  const { key, worktree } = (await req.json()) as { key?: string; worktree?: string };
  if (!key || !worktree) {
    return NextResponse.json({ error: "要給 key 與 worktree" }, { status: 400 });
  }
  if (!(await isKnownWorktree(worktree))) {
    return NextResponse.json({ error: "不認得這個工作區" }, { status: 403 });
  }
  return NextResponse.json({ worktrees: await toggleManual(key, worktree) });
}
