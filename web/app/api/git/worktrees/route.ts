import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { isKnownWorktree, worktreesOf } from "@/lib/changes";
import { isExternalRepo } from "@/lib/externalRepos";
import { readPinned } from "@/lib/gitView";

export const dynamic = "force-dynamic";

/**
 * 單一 repo 的 worktree 清單（含主 checkout，它是 `git worktree list` 的第一筆）。
 *
 * 給「先選 repo、再選 worktree」那一步用。**外接碟上的 repo 也接受** ——
 * 對單一 repo 跑一次 `git worktree list` 很便宜，原本避開的是「對 327 個全掃」。
 *
 * ⚠️ 這裡只讀。外接的 repo 不開 fetch／push（那兩個會寫入，而且在 USB 上慢）。
 */
export async function GET(req: NextRequest) {
  const dir = req.nextUrl.searchParams.get("dir");
  if (!dir) return NextResponse.json({ error: "要給 dir" }, { status: 400 });
  const abs = path.resolve(dir);
  if (!(await isKnownWorktree(abs)) && !(await isExternalRepo(abs))) {
    return NextResponse.json({ error: "不認得這個 repo" }, { status: 403 });
  }

  const pinned = await readPinned();
  const list = await worktreesOf(abs);
  const main = list[0]?.path;
  const worktrees = list.map((w) => ({
    dir: w.path,
    name: path.basename(w.path),
    branch: w.branch,
    isMain: w.path === main,
    // session 綁的 worktree（`<repo>/.claude/worktrees/<name>`）會跟著 session 消失
    isSessionBound: w.path.includes("/.claude/worktrees/"),
    pinned: pinned.includes(w.path),
  }));
  return NextResponse.json({ worktrees });
}
