import { NextRequest, NextResponse } from "next/server";
import { fileDiff, isKnownWorktree } from "@/lib/changes";

export const dynamic = "force-dynamic";

/**
 * 取一個檔案的 diff。
 *
 * **worktree 路徑不能直接吃前端傳來的值**，否則任何路徑都能被拿去跑 `git -C`。
 * 驗證是輕量的（在工作區根目錄底下 ＋ 那裡有 `.git`）——原本是重跑一次完整掃描
 * 再比對，但掃描變重之後每點一個檔案要等好幾秒。檔案本身的路徑逃逸在
 * `fileDiff` 裡再擋一次。
 */
export async function GET(req: NextRequest) {
  const worktree = req.nextUrl.searchParams.get("worktree") ?? "";
  const file = req.nextUrl.searchParams.get("file") ?? "";
  if (!worktree || !file) {
    return NextResponse.json({ error: "要給 worktree 與 file" }, { status: 400 });
  }

  if (!(await isKnownWorktree(worktree))) {
    return NextResponse.json({ error: "不認得這個工作區" }, { status: 403 });
  }

  // 未追蹤的檔案 `git diff` 看不到，要走 --no-index。前端知道自己點的是哪一種
  const untracked = req.nextUrl.searchParams.get("untracked") === "1";
  return NextResponse.json(await fileDiff(worktree, file, { untracked }));
}
