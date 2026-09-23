import { NextRequest, NextResponse } from "next/server";
import { isExternalRepo } from "@/lib/externalRepos";
import { isKnownWorktree, readFileLines } from "@/lib/changes";

export const dynamic = "force-dynamic";

/**
 * 檔案的某一段內容，給 diff 的「展開更多」用。唯讀。
 *
 * `rev` 空字串＝讀工作區現在的檔案；給了就從 git 取（看單一 commit 時是那個 sha）。
 * `from`/`to` 是 1-based、含頭含尾；`to` 省略＝從 from 一路到檔尾。
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const worktree = q.get("worktree") ?? "";
  const file = q.get("file") ?? "";
  if (!worktree || !file) {
    return NextResponse.json({ error: "要給 worktree 與 file" }, { status: 400 });
  }
  if (!(await isKnownWorktree(worktree)) && !(await isExternalRepo(worktree))) {
    return NextResponse.json({ error: "不認得這個工作區" }, { status: 403 });
  }
  const from = Number(q.get("from")) || 1;
  const toRaw = Number(q.get("to"));
  const out = await readFileLines(worktree, file, q.get("rev") ?? "", {
    from,
    to: Number.isFinite(toRaw) && toRaw > 0 ? toRaw : null,
  });
  if ("error" in out) return NextResponse.json(out, { status: 400 });
  return NextResponse.json(out);
}
