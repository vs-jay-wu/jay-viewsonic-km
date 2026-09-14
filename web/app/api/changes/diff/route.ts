import { NextRequest, NextResponse } from "next/server";
import { fileDiff, scanChanges } from "@/lib/changes";

export const dynamic = "force-dynamic";

/**
 * 取一個檔案的 diff。
 *
 * **worktree 路徑不吃前端傳來的值就直接用**：先重掃一次，確認那個路徑真的是
 * 掃描結果裡的工作區之一，否則任何路徑都能被拿來跑 `git -C`。
 */
export async function GET(req: NextRequest) {
  const worktree = req.nextUrl.searchParams.get("worktree") ?? "";
  const file = req.nextUrl.searchParams.get("file") ?? "";
  if (!worktree || !file) {
    return NextResponse.json({ error: "要給 worktree 與 file" }, { status: 400 });
  }

  const snapshot = await scanChanges();
  const known = snapshot.repos.flatMap((r) => r.worktrees).find((w) => w.path === worktree);
  if (!known) {
    return NextResponse.json({ error: "不認得這個工作區" }, { status: 403 });
  }
  const entry = known.files.find((f) => f.path === file);
  if (!entry) {
    return NextResponse.json({ error: "這個工作區沒有這個改動" }, { status: 404 });
  }

  return NextResponse.json(
    await fileDiff(worktree, file, { untracked: entry.kind === "untracked" })
  );
}
