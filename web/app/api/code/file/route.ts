import { NextRequest, NextResponse } from "next/server";
import { readFileIn } from "@/lib/codeBrowse";

export const dynamic = "force-dynamic";

/** 讀一個檔案的內容。唯讀；機敏檔案在 lib 那層就被擋掉 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const dir = q.get("dir") ?? "";
  const file = q.get("path") ?? "";
  if (!dir || !file) return NextResponse.json({ error: "要給 dir 與 path" }, { status: 400 });
  const out = await readFileIn(dir, file);
  if ("error" in out) return NextResponse.json(out, { status: 403 });
  return NextResponse.json(out);
}
