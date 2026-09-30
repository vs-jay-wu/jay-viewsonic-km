import { NextRequest, NextResponse } from "next/server";
import { searchRepo } from "@/lib/codeBrowse";
import { repoDirFromParams } from "@/lib/repoRef";

export const dynamic = "force-dynamic";

/** `git grep`。唯讀 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const dir = (await repoDirFromParams(q)) ?? "";
  const query = q.get("q") ?? "";
  if (!dir || !query) return NextResponse.json({ error: "要給 dir 與 q" }, { status: 400 });
  const out = await searchRepo(dir, query, {
    caseSensitive: q.get("case") === "1",
    regex: q.get("regex") === "1",
  });
  if ("error" in out) return NextResponse.json(out, { status: 400 });
  return NextResponse.json(out);
}
