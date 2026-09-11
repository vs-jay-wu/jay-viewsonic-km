import { NextResponse } from "next/server";
import { readReposOverview } from "@/lib/reposOverview";

export const dynamic = "force-dynamic";

export async function GET() {
  const res = await readReposOverview();
  if (!res.overview) return NextResponse.json({ error: res.error }, { status: 404 });
  return NextResponse.json(res);
}
