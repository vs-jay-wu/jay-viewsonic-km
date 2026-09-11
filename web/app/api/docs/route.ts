import { NextResponse } from "next/server";
import { readPins, scanDocs } from "@/lib/docs";

export const dynamic = "force-dynamic";

export async function GET() {
  const [index, pinned] = await Promise.all([scanDocs(), readPins()]);
  return NextResponse.json({ ...index, pinned });
}
