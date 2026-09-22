import { NextRequest, NextResponse } from "next/server";
import { fetchRepo, invalidateRepoCache } from "@/lib/gitView";

export const dynamic = "force-dynamic";

/**
 * `git fetch --prune`。會改到 `.git` 裡的遠端追蹤 ref，但不動本地分支與工作區 ——
 * 這是這個功能只允許的兩個動作之一。
 */
export async function POST(req: NextRequest) {
  const { dir, remote } = (await req.json()) as { dir?: string; remote?: string };
  if (!dir) return NextResponse.json({ error: "要給 dir" }, { status: 400 });
  const out = await fetchRepo(dir, remote);
  invalidateRepoCache(); // ahead/behind 會變
  return NextResponse.json(out);
}
