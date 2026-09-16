import { NextRequest, NextResponse } from "next/server";
import { workChanges } from "@/lib/workChanges";
import { getWorkIndex } from "@/lib/workIndex";
import { findItemBySession } from "@/lib/workIndexRules";

export const dynamic = "force-dynamic";

/**
 * 一個工作項目橫跨各 repo 的改動。
 *
 * 可以用 `key`（票號／`PR:<repo>#<n>`）或 `session`（Claude session id）問 ——
 * session 是**經由工作項目**連過去的，不是直接關聯，所以這裡先把它換成 key。
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  const session = req.nextUrl.searchParams.get("session");

  let resolved = key;
  if (!resolved && session) {
    const index = await getWorkIndex();
    const item = findItemBySession(index.items, session);
    if (!item) {
      return NextResponse.json(
        { error: "這個 session 的標題沒辦法連到任何票或 PR（標題慣例是 `[repo] 票號 描述`）" },
        { status: 404 }
      );
    }
    resolved = item.key;
  }
  if (!resolved) return NextResponse.json({ error: "要給 key 或 session" }, { status: 400 });

  const out = await workChanges(resolved);
  if ("error" in out) return NextResponse.json(out, { status: 404 });
  return NextResponse.json(out);
}
