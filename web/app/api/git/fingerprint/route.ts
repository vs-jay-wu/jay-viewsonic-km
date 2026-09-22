import { NextRequest, NextResponse } from "next/server";
import { globalFingerprint, repoFingerprint } from "@/lib/gitFingerprint";

export const dynamic = "force-dynamic";

/**
 * 「本機有沒有變」的探針。唯讀，而且刻意做得很便宜 —— 前端輪詢的是這個，
 * 只有值變了才去抓那些 2.6～3 秒的重資料。
 *
 * `?dir=` 給單一 repo 的完整指紋（含還沒 stage 的檔案編輯）；不給就是全域。
 */
export async function GET(req: NextRequest) {
  const dir = req.nextUrl.searchParams.get("dir");
  if (dir) {
    const fp = await repoFingerprint(dir);
    if (fp === null) return NextResponse.json({ error: "不認得這個 repo" }, { status: 403 });
    return NextResponse.json({ fingerprint: fp });
  }
  return NextResponse.json({ fingerprint: await globalFingerprint() });
}
