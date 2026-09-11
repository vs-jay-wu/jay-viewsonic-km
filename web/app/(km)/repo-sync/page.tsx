"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icon";
import Tooltip from "@/components/Tooltip";
import {
  WINDOW_END_HOUR, WINDOW_START_HOUR,
  type RepoSyncConfig, type RepoSyncRun, type RepoSyncSchedulerState, type RepoSyncState,
} from "@/lib/repoSyncRules";

interface Payload {
  config: RepoSyncConfig;
  state: RepoSyncState;
  scheduler: RepoSyncSchedulerState;
  window: { dueNow: boolean; nextStart: string };
}

const POLL_IDLE_MS = 30_000;
const POLL_BUSY_MS = 5_000;

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-TW", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} 秒`;
  return `${Math.floor(s / 60)} 分 ${s % 60} 秒`;
}

export default function RepoSyncPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/repo-sync", { cache: "no-store" });
    setData((await res.json()) as Payload);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const syncing = !!data?.scheduler.syncing;
  useEffect(() => {
    const id = setInterval(() => { void load(); }, syncing ? POLL_BUSY_MS : POLL_IDLE_MS);
    return () => clearInterval(id);
  }, [load, syncing]);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    try {
      await fetch("/api/repo-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  const runs = data?.state.runs ?? [];
  const last = runs[0] ?? null;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-10">
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-gray-900">
          <Icon name="repos" size={22} className="text-gray-400" />
          Repo 同步
        </h1>
        <p className="mt-1.5 text-sm text-gray-500">
          夜間把 org 底下的 repo 全部 pull 一次。固定跑
          <code className="mx-1 rounded bg-gray-100 px-1 py-0.5 text-xs">scripts/sync-org-repos.sh</code>
          ，不叫 AI。
        </p>

        {/* 排程狀態 */}
        <div className="mt-6 rounded-xl border border-gray-200 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
              <Icon name="clock" size={16} className="text-gray-400" />
              每天台北時間 {WINDOW_START_HOUR}:00 – {String(WINDOW_END_HOUR).padStart(2, "0")}:00 之間跑一次
            </div>
            <div className="flex items-center gap-2">
              <Tooltip label={syncing ? "同步進行中" : "不等窗口，現在就同步一次"}>
                <button
                  onClick={() => void post({ action: "run" })}
                  disabled={busy || syncing || !data}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <Icon name={syncing ? "spinner" : "refresh"} size={14}
                        className={syncing ? "animate-spin" : ""} />
                  {syncing ? "同步中" : "立即同步"}
                </button>
              </Tooltip>
              <button
                onClick={() => void post({ action: "setEnabled", enabled: !data?.config.enabled })}
                disabled={busy || !data}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                  data?.config.enabled
                    ? "border border-gray-300 text-gray-700 hover:bg-gray-50"
                    : "bg-gray-900 text-white hover:bg-gray-700"
                }`}
              >
                {data?.config.enabled ? "停用排程" : "啟用排程"}
              </button>
            </div>
          </div>

          <p className="mt-2 text-xs leading-relaxed text-gray-500">
            一個晚上只跑一次；<b className="font-medium text-gray-700">錯過就等下一晚，不補做</b>。
            有掛外接硬碟時連 offloaded 的 repo 一起同步，沒掛就只同步本機的（不算失敗）。
          </p>

          <dl className="mt-4 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-gray-400">排程</dt>
              <dd className="mt-0.5 font-medium text-gray-900">
                {!data ? "—" : data.config.enabled
                  ? (data.scheduler.timerOn ? "啟用中" : "啟用（等 server 掛上）")
                  : "已停用"}
              </dd>
            </div>
            <div>
              <dt className="text-gray-400">{data?.window.dueNow ? "今晚還沒跑" : "下一個窗口"}</dt>
              <dd className="mt-0.5 font-medium text-gray-900">
                {data?.window.dueNow ? "最多再等 10 分鐘就會跑" : fmt(data?.window.nextStart)}
              </dd>
            </div>
            <div>
              <dt className="text-gray-400">org</dt>
              <dd className="mt-0.5 font-mono text-gray-900">{data?.config.org ?? "—"}</dd>
            </div>
          </dl>
        </div>

        {/* 上一次的結果 */}
        {last && (
          <div className="mt-4 rounded-xl border border-gray-200 p-5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Icon name={last.ok ? "check" : "alert"} size={16}
                    className={last.ok ? "text-emerald-600" : "text-red-600"} />
              <span className="font-medium text-gray-900">上次同步</span>
              <span className="text-gray-500">{fmt(last.startedAt)} · {fmtDuration(last.durationMs)}</span>
            </div>
            {last.summary ? (
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-gray-600">
                <span>共 <b className="text-gray-900">{last.summary.total}</b> 個 repo</span>
                <span>pull {last.summary.pulled}</span>
                {last.summary.cloned > 0 && <span>新 clone {last.summary.cloned}</span>}
                {last.summary.fetchedDirty > 0 && (
                  <span className="text-amber-700">
                    有未提交改動、只 fetch {last.summary.fetchedDirty}
                  </span>
                )}
                {last.summary.failed > 0 && (
                  <span className="text-red-700">失敗 {last.summary.failed}</span>
                )}
                <span className="flex items-center gap-1">
                  <Icon name="hardDrive" size={13} className="text-gray-400" />
                  {last.summary.externalAvailable
                    ? `外接已掛：offloaded 同步 ${last.summary.offloadedSynced}`
                    : `外接未掛：offloaded 跳過 ${last.summary.offloadedSkipped}`}
                </span>
              </div>
            ) : (
              <div className="mt-2 font-mono text-xs text-red-700">{last.error}</div>
            )}
            {last.summary && last.summary.dirtyRepos.length > 0 && (
              <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <div className="font-medium">這些 repo 工作區有改動，只 fetch 沒 pull：</div>
                <div className="mt-1 font-mono">{last.summary.dirtyRepos.join("、")}</div>
              </div>
            )}
          </div>
        )}

        {/* 歷史 */}
        <h2 className="mt-8 text-sm font-medium text-gray-900">最近的執行</h2>
        <div className="mt-2 rounded-xl border border-gray-200 divide-y divide-gray-100">
          {runs.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-gray-400">還沒跑過</div>
          )}
          {runs.map((r: RepoSyncRun) => (
            <div key={r.startedAt} className="px-4 py-3">
              <button
                onClick={() => setExpanded(expanded === r.startedAt ? null : r.startedAt)}
                className="flex w-full items-center gap-2.5 text-left text-xs"
              >
                <Icon name={expanded === r.startedAt ? "chevronDown" : "chevronRight"}
                      size={14} className="text-gray-400" />
                <Icon name={r.ok ? "check" : "x"} size={14}
                      className={r.ok ? "text-emerald-600" : "text-red-600"} />
                <span className="font-medium text-gray-900">{fmt(r.startedAt)}</span>
                <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-500">
                  {r.trigger === "manual" ? "手動" : "排程"}
                </span>
                <span className="text-gray-500">{fmtDuration(r.durationMs)}</span>
                {r.summary && (
                  <span className="text-gray-500">
                    {r.summary.total} 個 · pull {r.summary.pulled}
                    {r.summary.failed > 0 && ` · 失敗 ${r.summary.failed}`}
                  </span>
                )}
              </button>
              {expanded === r.startedAt && (
                <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-gray-900 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-gray-100">
{r.logTail || r.error || "（沒有輸出）"}
                </pre>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
