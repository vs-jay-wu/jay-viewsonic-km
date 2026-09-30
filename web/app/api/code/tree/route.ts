import { NextRequest, NextResponse } from "next/server";
import { listDir } from "@/lib/codeBrowse";
import { repoDirFromParams } from "@/lib/repoRef";

export const dynamic = "force-dynamic";

/** 列一層目錄。唯讀 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const dir = (await repoDirFromParams(q)) ?? "";
  if (!dir) return NextResponse.json({ error: "要給 dir" }, { status: 400 });
  const out = await listDir(dir, q.get("path") ?? "");
  if ("error" in out) return NextResponse.json(out, { status: 403 });
  return NextResponse.json(out);
}
