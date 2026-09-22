"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import Tooltip from "@/components/Tooltip";
import { formatBytes } from "@/lib/buildDirRules";
import {
  HISTORY_FILTER_LABEL, formatDuration, matchesHistoryFilter, matchesHistoryQuery,
  summarize, throughput,
  type HistoryFilter, type MoveRecord,
} from "@/lib/repoMoveHistoryRules";

interface Payload {
  records: MoveRecord[];
  fileModifiedAt: string | null;
  empty: boolean;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-TW", {
    year: "numeric", month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/** 搬去哪：用「來源 → 目的地」的路徑尾段，比只寫 offload／restore 具體 */
function Route({ rec }: { rec: MoveRecord }) {
  const label = rec.action === "offload" ? "本機 → 外接" : "外接 → 本機";
  return (
    <Tooltip label={`${rec.sourcePath}\n→ ${rec.destination}`}>
      <span className="inline-flex items-center gap-1 text-[11px] text-fg-muted">
        <Icon name={rec.action === "offload" ? "toBottom" : "toTop"} size={11} />
        {label}
      </span>
    </Tooltip>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line px-4 py-3">
      <div className="text-[11px] text-fg-subtle">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-fg">{value}</div>
      {sub && <div className="text-[11px] text-fg-subtle">{sub}</div>}
    </div>
  );
}

export default function RepoMoveHistoryPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/repo-storage/history");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "讀取失敗");
      setData(json as Payload);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => {
    if (!data) return [];
    return data.records.filter(
      (r) => matchesHistoryFilter(r, filter) && matchesHistoryQuery(r, query)
    );
  }, [data, filter, query]);

  // 統計看的是**全部**紀錄，不跟著篩選變動 —— 篩選是為了找特定那一筆，
  // 統計是為了看整體，兩者一起變會讓人以為數字錯了
  const summary = useMemo(() => summarize(data?.records ?? []), [data]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-6 sm:px-8 sm:py-10">
        <Link
          href="/repos"
          className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
        >
          <Icon name="chevronRight" size={12} className="rotate-180" />
          Repos 總覽
        </Link>

        <h1 className="mt-2 flex items-center gap-2.5 text-2xl font-semibold text-fg">
          <Icon name="hardDrive" size={22} className="text-fg-subtle" />
          搬遷紀錄
        </h1>
        <p className="mt-1.5 text-sm text-fg-muted">
          每一次本機 ↔ 外接硬碟的搬移，網頁按的與 CLI 跑的都在這裡
          {data?.fileModifiedAt && `（最後更新 ${fmtTime(data.fileModifiedAt)}）`}
        </p>

        {error && (
          <div className="mt-6 flex items-start gap-2 rounded-xl border border-danger/40 bg-danger-bg px-4 py-3 text-sm text-danger">
            <Icon name="alert" size={15} className="mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="總次數" value={String(summary.total)} />
          <Stat
            label="搬到外接"
            value={String(summary.offloaded)}
            sub={summary.bytesOffloaded ? formatBytes(summary.bytesOffloaded) : undefined}
          />
          <Stat
            label="搬回本機"
            value={String(summary.restored)}
            sub={summary.bytesRestored ? formatBytes(summary.bytesRestored) : undefined}
          />
          <Stat label="失敗" value={String(summary.failed)} sub="來源都原地保留" />
        </div>

        {/* 篩選列：高度固定，不隨結果變動（版面不要跳） */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[16rem]">
            <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜尋 repo 名或備註…"
              className="w-full rounded-lg border border-line-strong py-2 pl-9 pr-3 text-sm outline-none focus:border-line-strong"
            />
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as HistoryFilter)}
            className="rounded-lg border border-line-strong px-2 py-2 text-xs text-fg outline-none focus:border-line-strong"
          >
            {(Object.keys(HISTORY_FILTER_LABEL) as HistoryFilter[]).map((k) => (
              <option key={k} value={k}>{HISTORY_FILTER_LABEL[k]}</option>
            ))}
          </select>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-1 rounded-lg border border-line-strong px-2.5 py-2 text-xs text-fg hover:border-line-strong hover:bg-surface-raised"
          >
            <Icon name="refresh" size={12} />
            重新整理
          </button>
        </div>

        <div className="mt-2 h-4 text-xs text-fg-subtle">
          {data && `顯示 ${shown.length} / ${data.records.length} 筆`}
        </div>

        <div className="mt-4 rounded-xl border border-line">
          {data && shown.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-fg-subtle">
              {data.empty
                ? "還沒有搬移過任何 repo。到 Repos 總覽點「搬到外接」或「搬回本機」就會留下紀錄。"
                : "沒有符合的紀錄。"}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {shown.map((rec, i) => {
                const speed = throughput(rec);
                return (
                  <li key={`${rec.startedAt}-${rec.repo}-${i}`} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-medium leading-none ${
                          rec.status === "done"
                            ? "border-line bg-surface-raised text-fg-muted"
                            : "border-danger/40 bg-danger-bg text-danger"
                        }`}
                      >
                        <Icon name={rec.status === "done" ? "check" : "alert"} size={10} />
                        {rec.status === "done" ? "完成" : "失敗"}
                      </span>
                      <span className="font-mono text-sm text-fg">{rec.repo}</span>
                      <Route rec={rec} />
                      <span className="ml-auto text-[11px] tabular-nums text-fg-subtle">
                        {fmtTime(rec.startedAt)}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-muted">
                      <span className="tabular-nums">{formatBytes(rec.bytes)}</span>
                      <span className="tabular-nums">{rec.fileCount} 項</span>
                      <span className="tabular-nums">{formatDuration(rec.durationSec)}</span>
                      {speed && (
                        <span className="tabular-nums text-fg-subtle">
                          {formatBytes(speed)}/s
                        </span>
                      )}
                      <span className="text-fg-subtle">
                        {rec.source === "web" ? "網頁" : "CLI"}
                      </span>
                    </div>

                    {rec.note && (
                      <p
                        className={`mt-1 text-[11px] leading-relaxed ${
                          rec.status === "error" ? "text-danger" : "text-fg-muted"
                        }`}
                      >
                        {rec.note}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
