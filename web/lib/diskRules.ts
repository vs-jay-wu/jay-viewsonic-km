/**
 * 硬碟空間的判準。純函式（客戶端也要用）。
 */

export interface DiskUsage {
  /** 掛載點 */
  mount: string;
  /** 給人看的名字（本機／外接…） */
  label: string;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  /** 剩餘百分比（0–100） */
  freePercent: number;
}

/** 剩不到這個比例就在首頁示警（Jay 2026-09-14） */
export const WARN_BELOW_PERCENT = 10;
/** 再低就不是提醒而是要馬上處理 */
export const CRITICAL_BELOW_PERCENT = 5;

export type DiskLevel = "ok" | "warn" | "critical";

export function levelOf(usage: DiskUsage): DiskLevel {
  if (usage.freePercent < CRITICAL_BELOW_PERCENT) return "critical";
  if (usage.freePercent < WARN_BELOW_PERCENT) return "warn";
  return "ok";
}

export function isLow(usage: DiskUsage): boolean {
  return levelOf(usage) !== "ok";
}

export function formatGB(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  return gb >= 100 ? `${Math.round(gb)} GB` : `${gb.toFixed(1)} GB`;
}

/**
 * 解析 `df -k <mount>` 的輸出。
 *
 * **剩餘比例自己用 `available / (used + available)` 算，不要用 df 的 Capacity 欄**：
 * APFS 的容器是共用的，`df /` 會回一個跟實際可用空間對不起來的百分比
 * （實測 `/` 顯示 16%、但同一顆碟的資料卷是 79%）。
 */
export function parseDf(stdout: string, label: string): DiskUsage | null {
  const lines = stdout.trim().split("\n");
  if (lines.length < 2) return null;
  // 欄位：Filesystem 1024-blocks Used Available Capacity … Mounted-on
  const cols = lines[1].trim().split(/\s+/);
  if (cols.length < 4) return null;
  const used = Number(cols[2]) * 1024;
  const free = Number(cols[3]) * 1024;
  if (!Number.isFinite(used) || !Number.isFinite(free) || used + free <= 0) return null;
  return {
    // 掛載點可能有空格（`/Volumes/Crucial X9`），所以是「第 9 欄之後全部」，
    // 不是最後一個 token —— 用 pop() 會得到「X9」
    mount: cols.slice(8).join(" ") || cols[cols.length - 1] || "",
    label,
    totalBytes: used + free,
    usedBytes: used,
    freeBytes: free,
    freePercent: (free * 100) / (used + free),
  };
}
