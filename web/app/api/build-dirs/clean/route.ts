import { NextResponse } from "next/server";
import { clean } from "@/lib/buildDirs";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { repo?: string; dirs?: string[] };
  if (!body.repo) return NextResponse.json({ error: "要指定 repo" }, { status: 400 });
  const res = await clean(body.repo, Array.isArray(body.dirs) ? body.dirs : []);
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
