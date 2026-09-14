/**
 * 快速筆記的純規則：相對時間的說明性用詞、以及「這是不是今天寫的」。
 *
 * 純函式（客戶端要用，不能帶 fs/promises）。
 *
 * 為什麼不顯示日期：這格筆記記的是「今天幾點下班」這種**明天就沒用**的事，
 * 看到「9/13 18:20」還要自己換算是不是今天；「昨天」一眼就知道不能信了。
 */

export interface Note {
  id: string;
  text: string;
  /** ISO 字串 */
  updatedAt: string;
}

export interface NoteFile {
  /** 目前只有一則，但格式一開始就是陣列 —— 之後要多則時只動 UI，不用搬資料 */
  notes: Note[];
}

export const SCRATCH_ID = "scratch";

export function emptyNote(): Note {
  return { id: SCRATCH_ID, text: "", updatedAt: "" };
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** 幾天前（照**日曆日**算，不是 24 小時）。今天 0，昨天 1，以此類推。 */
export function calendarDaysAgo(updatedAt: Date, now: Date): number {
  const a = new Date(updatedAt.getFullYear(), updatedAt.getMonth(), updatedAt.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * 最後更新的說明性用詞。
 *
 * 「幾小時前」只用在**今天**：昨天 23:50 寫的、今天 00:30 看，說「40 分鐘前」
 * 是對的（時間感），但跨過午夜之後就該講「昨天」——那才是你想知道的事。
 * 所以一小時內照時間講，超過一小時就交給日曆日判斷。
 */
export function relativeWording(updatedAt: Date, now: Date): string {
  const diff = now.getTime() - updatedAt.getTime();
  if (!Number.isFinite(diff)) return "";
  if (diff < 0) return "剛剛";                    // 時鐘跑掉時不要顯示「-3 分鐘前」
  if (diff < MINUTE) return "剛剛";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分鐘前`;

  const days = calendarDaysAgo(updatedAt, now);
  if (days === 0) return `${Math.max(1, Math.floor(diff / HOUR))} 小時前`;
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  if (days < 14) return "上週";
  if (days < 28) return `${["", "", "兩", "三"][Math.floor(days / 7)] ?? ""}週前`;
  const months = Math.floor(days / 30);
  return months <= 1 ? "上個月" : `${months} 個月前`;
}

/** 不是今天寫的就要讓人看得出來（畫面上只做：小圓點 ＋ 文字轉天藍） */
export function isStale(updatedAt: Date, now: Date): boolean {
  return calendarDaysAgo(updatedAt, now) >= 1;
}
