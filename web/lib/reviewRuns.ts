import { readFile, readdir, unlink } from "fs/promises";
import path from "path";
import { repoPath } from "@/lib/repo";
import type { ReviewRun } from "@/lib/reviewRunsRules";

export type { ReviewRun };

export const RUNS_DIR = "data/review-local-runs";
/** 保留天數。這些是「當時的結論」，過期價值很低，但比 PR 巡邏的雜訊紀錄有用一點 */
export const RETAIN_DAYS = 30;

/** 只認 `<YYYYMMDD>-<HHMMSS>.json`，避免路徑穿越 */
export function isValidRunId(id: string): boolean {
  return /^\d{8}-\d{6}$/.test(id);
}

export async function listReviewRuns(limit = 200): Promise<ReviewRun[]> {
  const dir = repoPath(RUNS_DIR);
  const entries = await readdir(dir).catch(() => [] as string[]);
  const ids = entries
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .filter(isValidRunId)
    .sort()
    .reverse()
    .slice(0, limit);

  const runs = await Promise.all(
    ids.map(async (id) => {
      const raw = await readFile(path.join(dir, `${id}.json`), "utf8").catch(() => null);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as ReviewRun;
      } catch {
        return null; // 寫到一半的檔案（腳本被中斷）就跳過，不要讓整頁掛掉
      }
    })
  );
  return runs.filter((r): r is ReviewRun => !!r && !!r.id);
}

/** 過期的清掉。id 前 8 碼就是日期，不必開檔 */
export async function pruneReviewRuns(now = new Date()): Promise<number> {
  const dir = repoPath(RUNS_DIR);
  const entries = await readdir(dir).catch(() => [] as string[]);
  const cutoff = new Date(now.getTime() - RETAIN_DAYS * 86_400_000);
  const ymd = `${cutoff.getFullYear()}${String(cutoff.getMonth() + 1).padStart(2, "0")}${String(cutoff.getDate()).padStart(2, "0")}`;
  let n = 0;
  for (const f of entries) {
    const id = f.replace(/\.json$/, "");
    if (!isValidRunId(id)) continue;
    if (id.slice(0, 8) >= ymd) continue;
    await unlink(path.join(dir, f)).catch(() => undefined);
    n++;
  }
  return n;
}
