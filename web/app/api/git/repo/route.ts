import { NextRequest, NextResponse } from "next/server";
import { repoDetail } from "@/lib/gitView";

export const dynamic = "force-dynamic";

/** 一個 repo 的分支、HEAD 與 commit graph。唯讀 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const dir = q.get("dir") ?? "";
  if (!dir) return NextResponse.json({ error: "要給 dir" }, { status: 400 });
  const out = await repoDetail(dir, {
    ref: q.get("ref") ?? undefined,
    limit: Number(q.get("limit")) || undefined,
    skip: Number(q.get("skip")) || undefined,
  });
  if ("error" in out) return NextResponse.json(out, { status: 403 });
  return NextResponse.json(out);
}
