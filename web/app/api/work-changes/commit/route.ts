import { NextRequest, NextResponse } from "next/server";
import { isKnownWorktree } from "@/lib/changes";
import { run } from "@/lib/repo";
import { parseNameStatus } from "@/lib/workChangesRules";

export const dynamic = "force-dynamic";

/** 單一 commit 動到哪些檔案。逐 commit 檢視點開才問，不在掃描時全抓（多數不會被點開） */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const worktree = q.get("worktree") ?? "";
  const sha = q.get("sha") ?? "";
  if (!worktree || !/^[0-9a-f]{7,40}$/.test(sha)) {
    return NextResponse.json({ error: "要給 worktree 與 sha" }, { status: 400 });
  }
  if (!(await isKnownWorktree(worktree))) {
    return NextResponse.json({ error: "不認得這個工作區" }, { status: 403 });
  }
  const r = await run("git", ["-C", worktree, "show", "--name-status", "--format=", sha], {
    timeoutMs: 30_000,
  });
  if (r.code !== 0) return NextResponse.json({ error: r.stderr.trim().slice(0, 200) }, { status: 400 });
  return NextResponse.json({ files: parseNameStatus(r.stdout) });
}
