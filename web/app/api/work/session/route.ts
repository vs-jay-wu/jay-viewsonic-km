import { NextResponse } from "next/server";
import { createNamedSession } from "@/lib/newSession";
import { openSession } from "@/lib/orca";

export const dynamic = "force-dynamic";

/**
 * 建一個已命名的 session，並（預設）直接在 Orca 開起來。
 *
 * cwd 由 lib/newSession.ts 驗證（只能在工作區底下）—— 它會被當成
 * `terminal create --worktree path:<cwd>` 的參數。
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    cwd?: string;
    open?: boolean;
    registerRepo?: boolean;
  };

  const created = await createNamedSession({ title: body.title ?? "", cwd: body.cwd });
  if (!created.ok) return NextResponse.json({ error: created.error }, { status: 400 });

  if (body.open === false) return NextResponse.json({ sessionId: created.sessionId });

  const outcome = await openSession({
    sessionId: created.sessionId,
    cwd: created.cwd,
    registerRepo: !!body.registerRepo,
  });
  return NextResponse.json({ sessionId: created.sessionId, outcome });
}
