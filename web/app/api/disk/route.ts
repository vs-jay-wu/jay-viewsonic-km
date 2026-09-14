import { NextResponse } from "next/server";
import { readDisks } from "@/lib/disk";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ disks: await readDisks() });
}
