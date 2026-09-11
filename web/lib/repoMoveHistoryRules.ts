/**
 * 搬遷紀錄的型別與彙整規則。
 *
 * 純函式，客戶端與 server 共用（不能把 `fs/promises` 帶進客戶端，見 web/AGENTS.md）。
 * 紀錄由 `scripts/repo-storage.py` 一行一筆寫進 `data/local-state/repo-moves.jsonl`，
 * 這裡只負責讀出來之後怎麼整理、怎麼顯示。
 */

import type { MoveAction } from "@/lib/repoStorageRules";

export type MoveStatus = "done" | "error";

export interface MoveRecord {
  startedAt: string;
  finishedAt: string;
  durationSec: number;
  repo: string;
  org: string;
  action: MoveAction;
  status: MoveStatus;
  /** cli 或 web —— 同一支腳本兩個入口，出事時要分得出來是誰發動的 */
  source: string;
  sourcePath: string;
  destination: string;
  bytes: number;
  fileCount: number;
  note: string;
}

/**
 * 一行壞掉不該讓整頁掛掉 —— 這個檔是 append-only 的，
 * 最後一行有可能是寫到一半被中斷的半行。所以逐行寬鬆解析，壞的就跳過。
 */
export function parseHistory(text: string): MoveRecord[] {
  const out: MoveRecord[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const raw = JSON.parse(trimmed) as Partial<MoveRecord>;
      if (!raw.repo || !raw.action || !raw.startedAt) continue;
      out.push({
        startedAt: raw.startedAt,
        finishedAt: raw.finishedAt ?? raw.startedAt,
        durationSec: raw.durationSec ?? 0,
        repo: raw.repo,
        org: raw.org ?? "",
        action: raw.action,
        status: raw.status === "error" ? "error" : "done",
        source: raw.source ?? "cli",
        sourcePath: raw.sourcePath ?? "",
        destination: raw.destination ?? "",
        bytes: raw.bytes ?? 0,
        fileCount: raw.fileCount ?? 0,
        note: raw.note ?? "",
      });
    } catch {
      continue;
    }
  }
  // 檔案是依時間 append 的，但畫面要最新的在上面
  return out.reverse();
}

export type HistoryFilter = "all" | "offload" | "restore" | "error";

export const HISTORY_FILTER_LABEL: Record<HistoryFilter, string> = {
  all: "全部",
  offload: "只看搬出",
  restore: "只看搬回",
  error: "只看失敗",
};

export function matchesHistoryFilter(rec: MoveRecord, filter: HistoryFilter): boolean {
  if (filter === "all") return true;
  if (filter === "error") return rec.status === "error";
  // 搬出／搬回只看成功的那些 —— 失敗的沒有真的搬動，混進來會讓數字對不上
  return rec.action === filter && rec.status === "done";
}

export function matchesHistoryQuery(rec: MoveRecord, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const hay = `${rec.repo} ${rec.org} ${rec.note}`.toLowerCase();
  return terms.every((t) => hay.includes(t));
}

export interface HistorySummary {
  total: number;
  offloaded: number;
  restored: number;
  failed: number;
  bytesOffloaded: number;
  bytesRestored: number;
}

/** 失敗的不計入搬動量 —— 它們最後是原地還原的，沒有真的移動任何東西。 */
export function summarize(records: MoveRecord[]): HistorySummary {
  const s: HistorySummary = {
    total: records.length,
    offloaded: 0,
    restored: 0,
    failed: 0,
    bytesOffloaded: 0,
    bytesRestored: 0,
  };
  for (const r of records) {
    if (r.status === "error") {
      s.failed += 1;
      continue;
    }
    if (r.action === "offload") {
      s.offloaded += 1;
      s.bytesOffloaded += r.bytes;
    } else {
      s.restored += 1;
      s.bytesRestored += r.bytes;
    }
  }
  return s;
}

/** 「3.2 MB/s」。時間太短（小檔案瞬間完成）就不給速度，免得出現天文數字。 */
export function throughput(rec: MoveRecord): number | null {
  if (rec.status !== "done" || rec.durationSec < 1 || !rec.bytes) return null;
  return rec.bytes / rec.durationSec;
}

export function formatDuration(sec: number): string {
  if (sec < 1) return "不到 1 秒";
  if (sec < 60) return `${Math.round(sec)} 秒`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s ? `${m} 分 ${s} 秒` : `${m} 分`;
}
