import { NextResponse } from "next/server";
import { readStorage } from "@/lib/repoStorage";

export const dynamic = "force-dynamic";

/** 每個 repo 實際在本機還是外接碟，外加目前進行中的搬移工作（給 UI 輪詢進度）。 */
export async function GET() {
  const res = await readStorage();
  return NextResponse.json(res);
}
