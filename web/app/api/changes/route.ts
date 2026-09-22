import { NextRequest, NextResponse } from "next/server";
import { isKnownWorktree, scanChanges, statusOf } from "@/lib/changes";

export const dynamic = "force-dynamic";

/**
 * 未提交的改動。每次都重掃（這頁的價值就是「現在長怎樣」，快取只會給你舊的）。
 *
 * `?dir=` 只問**一個 worktree**：全掃 151 個工作區要 3 秒，單獨問一個只要
 * 10–80ms。自動更新走這條，呼叫端用 `patchWorktreeFiles` 併回既有快照 ——
 * 你在編輯器存檔的當下不該觸發一次 3 秒的全掃。
 */
export async function GET(req: NextRequest) {
  const dir = req.nextUrl.searchParams.get("dir");
  if (dir) {
    if (!(await isKnownWorktree(dir))) {
      return NextResponse.json({ error: "不認得這個 worktree" }, { status: 403 });
    }
    return NextResponse.json({ files: await statusOf(dir) });
  }
  return NextResponse.json(await scanChanges());
}
