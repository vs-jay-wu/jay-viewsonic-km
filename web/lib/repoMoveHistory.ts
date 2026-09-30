import { readFile, stat } from "fs/promises";
import { parseHistory, type MoveRecord } from "@/lib/repoMoveHistoryRules";
import { statePath } from "@/lib/statePaths";

export type { MoveRecord };

/** `scripts/repo-storage.py` 的 `append_history()` 寫的，一次搬移一行 */
const FILE = statePath("repo-moves.jsonl");

export interface HistoryResult {
  records: MoveRecord[];
  fileModifiedAt: string | null;
  /** 檔案還不存在＝還沒搬過任何東西，不是錯誤 */
  empty: boolean;
}

export async function readMoveHistory(): Promise<HistoryResult> {
  const raw = await readFile(FILE, "utf8").catch(() => null);
  if (raw === null) return { records: [], fileModifiedAt: null, empty: true };
  const mtime = await stat(FILE).then((s) => s.mtime.toISOString(), () => null);
  return { records: parseHistory(raw), fileModifiedAt: mtime, empty: false };
}
