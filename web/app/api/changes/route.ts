import { NextRequest, NextResponse } from "next/server";
import { isKnownWorktree, scanChangesCached, statusOf } from "@/lib/changes";

export const dynamic = "force-dynamic";

/**
 * 未提交的改動。
 *
 * **預設回快照**（`scanChangesCached`）：全掃 159 個 repo 要 3 秒，開頁時等那 3 秒
 * 是這頁最痛的地方。要「現在長怎樣」就帶 `?fresh=1` —— 手動按「重新掃描」、
 * 以及指紋變了那條自動更新都帶著它。
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
  const fresh = req.nextUrl.searchParams.get("fresh") === "1";
  return NextResponse.json(await scanChangesCached(fresh));
}
