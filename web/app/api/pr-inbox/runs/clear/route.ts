import { NextResponse } from "next/server";
import { clearableRunIds, deleteRun, listRuns } from "@/lib/prInbox";

export const dynamic = "force-dynamic";

/**
 * 一次清掉「沒有 AI 參與、也不是失敗」的執行紀錄。
 *
 * 刻意保留失敗的那些：首頁「連續失敗」的判斷是從這些紀錄推導的
 * （lib/healthRules.ts 的 healthFromRuns），清掉等於把警訊一起抹掉。
 * 真的要刪失敗紀錄就一筆一筆刪。
 */
export async function POST() {
  const runs = await listRuns(10_000);
  const ids = clearableRunIds(runs);
  let deleted = 0;
  for (const id of ids) {
    if (await deleteRun(id)) deleted++;
  }
  return NextResponse.json({ ok: true, deleted });
}
