import { NextRequest, NextResponse } from "next/server";
import { listSessions } from "@/lib/sessions";
import { openSession } from "@/lib/orca";

export const dynamic = "force-dynamic";

/**
 * 在 Orca 開啟（resume）這個 session。
 *
 * cwd 一律從本機掃出來的 session 資料取，不吃前端傳來的路徑 ——
 * 那個值會被當成 `terminal create --worktree path:<cwd>` 的參數。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { registerRepo?: boolean };

  const session = (await listSessions()).find((s) => s.id === id);
  if (!session) return NextResponse.json({ error: "找不到這個 session" }, { status: 404 });

  const outcome = await openSession({
    sessionId: id,
    cwd: session.cwd,
    registerRepo: !!body.registerRepo,
  });
  return NextResponse.json(outcome);
}
