/**
 * repo 清單的排序（純規則，有測試）。
 *
 * **pin 在任何排序下都排在最前面。** pin 的語意就是「我要一眼看到它」，
 * 換個排序就失效的話那顆圖釘等於沒用 —— 名稱排序時它只是讓 4 個 repo
 * 待在最上面，不影響你找得到別的。
 */

export type SortKey = "default" | "name" | "updated" | "createdAsc" | "createdDesc";

export interface SortableRepo {
  name: string;
  pinned: boolean;
  /** 最後一顆 commit（外接的沒有 —— 那條路徑不跑 git） */
  lastCommitAt?: string | null;
  /** 第一顆 commit ＝ 專案何時開始。要算才有，所以可能還沒填 */
  firstCommitAt?: string | null;
}

export const SORT_LABEL: Record<SortKey, string> = {
  default: "預設",
  name: "名稱",
  updated: "最後更新",
  createdAsc: "最早建立",
  createdDesc: "最晚建立",
};

/** 哪些排序需要「第一顆 commit」—— 那是要跑 git 才有的，用到才算 */
export function needsFirstCommit(key: SortKey): boolean {
  return key === "createdAsc" || key === "createdDesc";
}

/**
 * 沒有值的一律排到最後，不管是遞增還是遞減。
 *
 * 外接的 repo 沒有 `lastCommitAt`（不跑 git），空字串在字典序裡最小 ——
 * 不特別處理的話「最早建立」會變成一排沒有資料的 repo 佔滿畫面。
 */
function cmpDate(a: string | null | undefined, b: string | null | undefined, asc: boolean): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return asc ? a.localeCompare(b) : b.localeCompare(a);
}

export function sortRepos<T extends SortableRepo>(rows: T[], key: SortKey): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  const rest = (a: T, b: T): number => {
    switch (key) {
      case "name":
        return byName(a, b);
      case "updated":
        return cmpDate(a.lastCommitAt, b.lastCommitAt, false) || byName(a, b);
      case "createdAsc":
        return cmpDate(a.firstCommitAt, b.firstCommitAt, true) || byName(a, b);
      case "createdDesc":
        return cmpDate(a.firstCommitAt, b.firstCommitAt, false) || byName(a, b);
      default:
        return cmpDate(a.lastCommitAt, b.lastCommitAt, false) || byName(a, b);
    }
  };
  // 同分時一律照名字 —— 沒有這條的話 sort 不穩定，重抓一次順序就跳
  return [...rows].sort((a, b) => (a.pinned !== b.pinned ? (a.pinned ? -1 : 1) : rest(a, b)));
}

/**
 * 這個排序下，卡片上要標哪個日期。
 *
 * **只有跟時間有關的排序才標**（Jay 2026-09-23）：照預設或名稱排時，多一欄
 * 日期只是雜訊 —— 你不是在看日期，它只會讓名字更難掃。
 *
 * 兩種格式刻意不同：
 * - 最後更新是「最近」的事，相對時間比日期好讀（「3 天前」vs「2026-09-20」）
 * - 建立時間動輒隔好幾年（最早的一個是 2002），相對時間反而失去解析度
 */
export function sortDateLabel(
  key: SortKey,
  row: SortableRepo,
  now: number = Date.now()
): { text: string; title: string } | null {
  if (key === "default" || key === "name") return null;
  const iso = key === "updated" ? row.lastCommitAt : row.firstCommitAt;
  if (!iso) return { text: "—", title: "沒有紀錄" };
  const title = `${key === "updated" ? "最後 commit" : "第一顆 commit"}：${iso}`;
  return { text: key === "updated" ? relTime(iso, now) : iso.slice(0, 10), title };
}

/** 幾天前／幾個月前。超過一年就寫年份 —— 「427 天前」沒有人在心算 */
function relTime(iso: string, now: number): string {
  const d = Math.floor((now - new Date(iso).getTime()) / 86_400_000);
  if (d < 0) return iso.slice(0, 10); // 時鐘歪了或未來的日期，退回寫死的日期
  if (d === 0) return "今天";
  if (d === 1) return "昨天";
  if (d < 30) return `${d} 天前`;
  if (d < 365) return `${Math.floor(d / 30)} 個月前`;
  return iso.slice(0, 10);
}
