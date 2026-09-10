import { NextResponse } from "next/server";
import { listSessions } from "@/lib/sessions";

export const dynamic = "force-dynamic";

export async function GET() {
  const sessions = await listSessions();
  return NextResponse.json({
    sessions,
    totalBytes: sessions.reduce((n, s) => n + s.sizeBytes + s.sidecarBytes, 0),
  });
}
