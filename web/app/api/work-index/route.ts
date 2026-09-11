import { NextRequest, NextResponse } from "next/server";
import { getWorkIndex } from "@/lib/workIndex";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("force") === "1";
  return NextResponse.json(await getWorkIndex({ force }));
}
