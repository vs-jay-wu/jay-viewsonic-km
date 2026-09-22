import { NextRequest, NextResponse } from "next/server";
import { removeWorktree } from "@/lib/gitView";

export const dynamic = "force-dynamic";

/**
 * 移除一個 linked worktree。
 *
 * 這是 `/git` 上唯一會刪東西的端點 —— 守門（只能是已知的 linked worktree、不給
 * `--force`）在 `removeWorktree` 裡，那裡也寫了為什麼。用 DELETE 而不是 POST，
 * 讓「這會刪東西」從方法就看得出來。
 */
export async function DELETE(req: NextRequest) {
  const { dir } = (await req.json().catch(() => ({}))) as { dir?: string };
  if (!dir) return NextResponse.json({ error: "要給 dir" }, { status: 400 });
  const out = await removeWorktree(dir);
  return NextResponse.json(out, { status: out.ok ? 200 : 400 });
}
