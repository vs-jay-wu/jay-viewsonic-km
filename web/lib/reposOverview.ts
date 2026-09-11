import { readFile, stat } from "fs/promises";
import { repoPath } from "@/lib/repo";
import type { ReposOverview } from "@/lib/reposOverviewRules";

const FILE = repoPath("data/repos-overview.json");

export type { ReposOverview };

export interface ReposOverviewResult {
  overview: ReposOverview | null;
  /** 檔案自己的修改時間；`_meta.updated` 是人手動寫的，兩個都給，對不上就看得出來 */
  fileModifiedAt: string | null;
  error?: string;
}

/** 讀那份 JSON。它是手動維護的（沒有排程去產），所以這裡不做任何抓取。 */
export async function readReposOverview(): Promise<ReposOverviewResult> {
  const raw = await readFile(FILE, "utf8").catch(() => null);
  if (raw === null) return { overview: null, fileModifiedAt: null, error: "找不到 data/repos-overview.json" };
  const mtime = await stat(FILE).then((s) => s.mtime.toISOString(), () => null);
  try {
    const parsed = JSON.parse(raw) as ReposOverview;
    if (!Array.isArray(parsed.repos)) throw new Error("repos 不是陣列");
    return { overview: parsed, fileModifiedAt: mtime };
  } catch (e) {
    return { overview: null, fileModifiedAt: mtime, error: `解析失敗：${(e as Error).message}` };
  }
}
