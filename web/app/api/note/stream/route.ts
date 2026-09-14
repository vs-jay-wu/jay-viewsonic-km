import { NextRequest } from "next/server";
import { readNote, subscribe, type Note } from "@/lib/note";

export const dynamic = "force-dynamic";

/** 心跳：沒有它的話，連線斷掉（睡眠、關分頁）這邊不會馬上知道 */
const HEARTBEAT_MS = 25_000;

/**
 * 一條 SSE，把別的分頁存的內容推下來。
 *
 * 只做一件事：推最新的整份內容。不做 patch、不做版本號 —— 這格筆記通常只有
 * 一兩行，整份換掉最單純，也最不容易出現「兩邊拼起來變成亂碼」。
 */
export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId") ?? "";
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      // 一連上先給現況，免得剛開的分頁看到空白要等別人存檔才有內容
      send("note", await readNote());

      const unsubscribe = subscribe({
        clientId,
        send: (note: Note, from: string) => send("note", { ...note, from }),
      });

      const beat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          clearInterval(beat);
        }
      }, HEARTBEAT_MS);
      beat.unref?.();

      // 分頁關掉／離開時 request 會 abort，要把訂閱收掉，不然訂閱者清單會一直長
      request.signal.addEventListener("abort", () => {
        clearInterval(beat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* 已經關了 */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // dev 的中介層有時會緩衝，這個標頭讓它別緩衝
      "X-Accel-Buffering": "no",
    },
  });
}
