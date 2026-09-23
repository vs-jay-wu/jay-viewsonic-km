import { NextRequest, NextResponse } from "next/server";
import { readSnapshot } from "@/lib/myTickets";

export const dynamic = "force-dynamic";

/**
 * 幾張單的狀態。**只回要的那幾把 key**。
 *
 * 為什麼不直接用 `/api/my-tickets`：那支回整份快照（783 張單、**400 KB**），
 * 而 session 清單只需要畫面上那十幾張單的狀態字串。
 */
export async function GET(req: NextRequest) {
  const keys = (req.nextUrl.searchParams.get("keys") ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  if (!keys.length) return NextResponse.json({ statuses: {} });

  const snapshot = await readSnapshot();
  // 還沒抓過單就沒有快照 —— 回空的，畫面上就是沒有狀態點
  const want = new Set(keys);
  const statuses: Record<string, string> = {};
  for (const i of snapshot?.issues ?? []) if (want.has(i.key)) statuses[i.key] = i.status;
  return NextResponse.json({ statuses });
}
