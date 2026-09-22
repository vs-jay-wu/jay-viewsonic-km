import { NextRequest, NextResponse } from "next/server";
import { repoCommits, repoDetail } from "@/lib/gitView";

export const dynamic = "force-dynamic";

/**
 * 一個 repo 的分支、HEAD 與 commit graph。唯讀
 *
 * `commitsOnly=1` 只回 `{ commits, hasMore }` —— 往下載入更多時用，
 * 這樣不會為了丟掉的分支清單白跑一次 `for-each-ref` 與 `git status`。
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const dir = q.get("dir") ?? "";
  if (!dir) return NextResponse.json({ error: "要給 dir" }, { status: 400 });
  const fetchPage = q.get("commitsOnly") === "1" ? repoCommits : repoDetail;
  const out = await fetchPage(dir, {
    ref: q.get("ref") ?? undefined,
    limit: Number(q.get("limit")) || undefined,
    skip: Number(q.get("skip")) || undefined,
  });
  if ("error" in out) return NextResponse.json(out, { status: 403 });
  return NextResponse.json(out);
}
