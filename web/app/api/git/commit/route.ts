import { NextRequest, NextResponse } from "next/server";
import { commitDetail } from "@/lib/gitView";

export const dynamic = "force-dynamic";

/** 一個 commit 的訊息全文與檔案清單。唯讀 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const out = await commitDetail(q.get("dir") ?? "", q.get("sha") ?? "");
  if ("error" in out) return NextResponse.json(out, { status: 400 });
  return NextResponse.json(out);
}
