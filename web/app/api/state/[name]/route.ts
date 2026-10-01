import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { kmConfig } from "@/lib/kmRole";
import { STATE_OWNER, statePath } from "@/lib/statePaths";
import { writeStateFile } from "@/lib/stateWrite";

export const dynamic = "force-dynamic";

/**
 * satellite 取用 hub 狀態的出口（`docs/ideas/km-multi-machine.md` §3）。
 *
 * **只服務 `STATE_OWNER` 裡標成 `hub` 的名字。** 名單之外一律 404 —— 這同時是
 * 白名單與路徑穿越的防線：`name` 永遠不會被拿去組路徑，它只是 map 的 key。
 *
 * ⚠️ 這條沒有額外驗證，靠的是 `proxy.ts`：loopback（含 SSH 轉發進來的）放行，
 * 其餘要裝置 token。走 SSH 的話邊界是金鑰（Jay 2026-10-01 確認可以）。
 */
function hubOwned(name: string): boolean {
  return STATE_OWNER[name] === "hub";
}

/** satellite 不該服務狀態 —— 它自己的 data/hub/ 是空的，回了只會製造假資料 */
function notHub(): NextResponse | null {
  const cfg = kmConfig();
  if (cfg?.role === "satellite") {
    return NextResponse.json({ error: "這台是 satellite，不是狀態的來源" }, { status: 409 });
  }
  return null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const bad = notHub();
  if (bad) return bad;
  const { name } = await params;
  if (!hubOwned(name)) return NextResponse.json({ error: "不是 hub 擁有的狀態" }, { status: 404 });

  const text = await readFile(statePath(name), "utf8").catch(() => null);
  // 檔案還沒產生過 ≠ 失敗。呼叫端要分得出來，才不會把「還沒抓過」記成「hub 掛了」
  if (text === null) return new NextResponse(null, { status: 404 });
  return new NextResponse(text, {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** satellite 要改 pin／便條這類 hub 擁有的狀態時，由它轉送到這裡 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const bad = notHub();
  if (bad) return bad;
  const { name } = await params;
  if (!hubOwned(name)) return NextResponse.json({ error: "不是 hub 擁有的狀態" }, { status: 404 });

  await writeStateFile(statePath(name), await req.text());
  return NextResponse.json({ ok: true });
}
