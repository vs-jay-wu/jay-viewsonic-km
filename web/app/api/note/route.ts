import { NextResponse } from "next/server";
import { readNote, saveAndBroadcast } from "@/lib/note";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readNote());
}

/**
 * 存一次。**以最後寫入為準**，不做衝突處理（Jay 指定）——
 * 所以這裡不收 `updatedAt`，也不比對誰比較新。
 *
 * `clientId` 是送出的那個分頁，推播時會跳過它（它自己已經有這份內容了，
 * 再推回去只會把游標位置弄掉）。
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    text?: string;
    clientId?: string;
  };
  if (typeof body.text !== "string") {
    return NextResponse.json({ error: "text 要是字串" }, { status: 400 });
  }
  const note = await saveAndBroadcast(body.text, body.clientId ?? "");
  return NextResponse.json(note);
}
