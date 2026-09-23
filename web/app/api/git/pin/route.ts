import { NextRequest, NextResponse } from "next/server";
import { isKnownWorktree } from "@/lib/changes";
import { isExternalRepo } from "@/lib/externalRepos";
import { invalidateRepoCache, togglePinned } from "@/lib/gitView";

export const dynamic = "force-dynamic";

/**
 * pin／取消 pin（再按一次就取消）。只是排序偏好，不動 git。
 *
 * 接受三種路徑：主 repo、worktree、外接碟上的 repo。存的就是路徑本身，
 * **pin 的語意由讀取端決定**（`lib/repoGroupRules.ts`：主 repo 的 pin 管 repo
 * 清單的順序，worktree 的 pin 只管那個 repo 底下的順序）。
 */
export async function POST(req: NextRequest) {
  const { dir } = (await req.json()) as { dir?: string };
  if (!dir) return NextResponse.json({ error: "要給 dir" }, { status: 400 });
  if (!(await isKnownWorktree(dir)) && !(await isExternalRepo(dir))) {
    return NextResponse.json({ error: "不認得這個 repo" }, { status: 403 });
  }
  const pinned = await togglePinned(dir);
  invalidateRepoCache(); // 排序會變
  return NextResponse.json({ pinned });
}
