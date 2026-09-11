import { NextResponse } from "next/server";
import { ensureTimer, readConfig, readSnapshot, schedulerState } from "@/lib/vbBugs";
import { buildMatrix, PRIORITIES, STATUS_GROUPS } from "@/lib/vbBugsRules";

export const dynamic = "force-dynamic";

/**
 * 只讀快照 —— 抓取是 server 定時做的，開頁面不會打 Jira。
 * 矩陣在這裡才聚合：快照存的是扁平的票清單（增量合併用），
 * 分組規則會變，算在有測試的純函式裡比較安全。
 */
export async function GET() {
  await ensureTimer();
  const [snapshot, config] = await Promise.all([readSnapshot(), readConfig()]);
  const matrix = snapshot ? buildMatrix(snapshot.issues) : null;

  return NextResponse.json({
    snapshot: snapshot && {
      fetchedAt: snapshot.fetchedAt,
      fetchedAs: snapshot.fetchedAs,
      project: snapshot.project,
      mode: snapshot.mode,
      cursor: snapshot.cursor,
      lastFullSyncAt: snapshot.lastFullSyncAt,
      fetchedCount: snapshot.fetchedCount,
      issueCount: snapshot.issueCount,
      lastError: snapshot.lastError ?? null,
      products: matrix?.products ?? [],
      unmappedStatuses: matrix?.unmappedStatuses ?? {},
      priorities: PRIORITIES,
      statusGroups: STATUS_GROUPS,
    },
    config,
    scheduler: schedulerState(),
  });
}
