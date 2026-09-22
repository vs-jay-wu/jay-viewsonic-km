import { NextRequest, NextResponse } from "next/server";
import { isKnownWorktree } from "@/lib/changes";
import { invalidateRepoCache, togglePinned } from "@/lib/gitView";

export const dynamic = "force-dynamic";

/** pin／取消 pin 一個 repo（再按一次就取消）。只是排序偏好，不動 git */
export async function POST(req: NextRequest) {
  const { dir } = (await req.json()) as { dir?: string };
  if (!dir) return NextResponse.json({ error: "要給 dir" }, { status: 400 });
  if (!(await isKnownWorktree(dir))) {
    return NextResponse.json({ error: "不認得這個 repo" }, { status: 403 });
  }
  const pinned = await togglePinned(dir);
  invalidateRepoCache(); // 排序會變
  return NextResponse.json({ pinned });
}
