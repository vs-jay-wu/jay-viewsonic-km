import { NextResponse } from "next/server";
import { listChats } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET() {
  const chats = listChats();
  return NextResponse.json(chats);
}
