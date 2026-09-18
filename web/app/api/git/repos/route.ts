import { NextResponse } from "next/server";
import { listRepos } from "@/lib/gitView";

export const dynamic = "force-dynamic";

/** 工作區所有 repo 的一行摘要。唯讀 */
export async function GET() {
  return NextResponse.json(await listRepos());
}
