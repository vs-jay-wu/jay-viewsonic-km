"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { sortProducts } from "@/lib/vbBugsRules";

interface BugIssue {
  key: string; summary: string; status: string;
  priority: string; updated: string | null; url: string;
}
interface BugCell { count: number; issues: BugIssue[] }
interface BugProduct { name: string; total: number; cells: Record<string, BugCell> }
interface PriorityCol { key: string; label: string; sub: string }
interface StatusGroup { key: string; label: string; statuses: string[] }
interface BugSnapshot {
  fetchedAt: string; fetchedAs: string; project: string; issueCount: number;
  priorities: PriorityCol[]; statusGroups: StatusGroup[]; products: BugProduct[];
  unmappedStatuses: Record<string, number>; lastError?: string | null;
}
interface Config {
  enabled: boolean; intervalSeconds: number; showProductionReady: boolean;
  pinnedProducts: string[]; updatedAt: string;
}
interface Scheduler {
  timerOn: boolean; fetching: boolean; intervalSeconds: number;
  lastRunAt: string | null; nextRunAt: string | null; lastError: string | null;
}

/** 預設收起來的那一列（Jay：對我意義不大，但保留功能） */
const HIDDEN_BY_DEFAULT = "production_ready";

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-TW", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function VbBugsPage() {
  const [snapshot, setSnapshot] = useState<BugSnapshot | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [scheduler, setScheduler] = useState<Scheduler | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<{ product: string; cell: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/vb-bugs");
    const json = await res.json();
    if (!res.ok) setError(json.error ?? "讀取失敗");
    else {
      setSnapshot(json.snapshot);
      setConfig(json.config);
      setScheduler(json.scheduler);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (patch: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/vb-bugs/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "設定失敗");
    setBusy(false);
    load();
  };

  const refreshNow = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/vb-bugs/refresh", { method: "POST" });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "抓取失敗");
    setBusy(false);
    load();
  };

  const pinned = config?.pinnedProducts ?? [];
  const products = useMemo(
    () => sortProducts(snapshot?.products ?? [], pinned),
    [snapshot, pinned]
  );
  const groups = (snapshot?.statusGroups ?? []).filter(
    (g) => g.key !== HIDDEN_BY_DEFAULT || config?.showProductionReady
  );
  const priorities = snapshot?.priorities ?? [];

  const openCell =
    open && snapshot
      ? snapshot.products.find((p) => p.name === open.product)?.cells[open.cell]
      : undefined;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-8 py-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">VB Bug 總覽</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
              <code className="text-xs">project = VB AND issuetype = Bug</code>，未完成的票，
              依<strong className="font-medium text-gray-700">產品 × 狀態 × 優先度</strong>聚合。
              server 定時抓快照，開這頁不會打 Jira。點數字可以直接看是哪幾張票。
            </p>
          </div>
          <button
            onClick={refreshNow}
            disabled={busy}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Icon name="refresh" size={15} className={busy || scheduler?.fetching ? "animate-spin" : ""} />
            立即更新
          </button>
        </div>

        {error && (
          <div className="mt-6 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <Icon name="alert" size={16} className="mt-0.5" />
            <span className="whitespace-pre-wrap">{error}</span>
          </div>
        )}
        {snapshot?.lastError && (
          <div className="mt-6 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <Icon name="alert" size={16} className="mt-0.5" />
            <span className="whitespace-pre-wrap">上次抓取失敗：{snapshot.lastError}</span>
          </div>
        )}
        {snapshot && Object.keys(snapshot.unmappedStatuses).length > 0 && (
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <div className="flex items-start gap-2">
              <Icon name="alert" size={16} className="mt-0.5" />
              <div>
                有狀態不在分組表裡，這些票沒被算進去 —— 代表 VB 加了新狀態，要回去補
                <code className="mx-1 text-xs">scripts/vb-bugs.py</code>的
                <code className="text-xs">STATUS_GROUPS</code>：
                <div className="mt-1 font-mono text-xs">
                  {Object.entries(snapshot.unmappedStatuses)
                    .map(([s, n]) => `${s}（${n}）`)
                    .join("、")}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 設定 */}
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-gray-200 px-5 py-3.5 text-sm">
          <label className="inline-flex items-center gap-2 text-gray-700">
            <input
              type="checkbox"
              checked={!!config?.showProductionReady}
              onChange={(e) => save({ showProductionReady: e.target.checked })}
            />
            顯示 Production Ready 那一列
          </label>
          <span className="text-xs text-gray-400">
            {snapshot
              ? `${snapshot.issueCount} 張未完成的 bug · 最後抓取 ${fmtTime(snapshot.fetchedAt)}`
              : "尚無快照"}
            {scheduler?.nextRunAt && ` · 下次 ${fmtTime(scheduler.nextRunAt)}`}
          </span>
          {pinned.length > 0 && (
            <span className="ml-auto text-xs text-gray-400">
              已 pin：{pinned.join("、")}
            </span>
          )}
        </div>

        {/* 矩陣 */}
        {loading ? (
          <p className="mt-8 text-sm text-gray-400">載入中…</p>
        ) : !snapshot ? (
          <p className="mt-8 rounded-xl border border-gray-200 px-5 py-6 text-sm text-gray-400">
            還沒有快照。按「立即更新」抓一次。
          </p>
        ) : (
          <div className="mt-6 space-y-6">
            {products.map((p) => {
              const isPinned = pinned.includes(p.name);
              return (
                <div key={p.name} className="overflow-hidden rounded-xl border border-gray-200">
                  <div className="flex items-center gap-2.5 border-b border-gray-200 bg-gray-50 px-4 py-2.5">
                    <button
                      onClick={() => save({ togglePin: p.name })}
                      disabled={busy}
                      title={isPinned ? "取消 pin" : "pin 住（排到前面）"}
                      className={isPinned ? "text-amber-500" : "text-gray-300 hover:text-amber-500"}
                    >
                      <Icon name="pin" size={15} />
                    </button>
                    <h2 className="text-sm font-semibold text-gray-900">{p.name}</h2>
                    <span className="text-xs text-gray-400">{p.total} 張</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-500">
                          <th className="px-4 py-2 font-medium">狀態</th>
                          {priorities.map((pr) => (
                            <th key={pr.key} className="px-3 py-2 text-right font-medium">
                              {pr.label}
                              <span className="ml-1 font-normal text-gray-300">{pr.sub}</span>
                            </th>
                          ))}
                          <th className="px-4 py-2 text-right font-medium">小計</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {groups.map((g) => {
                          const rowTotal = priorities.reduce(
                            (n, pr) => n + (p.cells[`${g.key}|${pr.key}`]?.count ?? 0), 0
                          );
                          return (
                            <tr key={g.key}>
                              <td className="px-4 py-2 text-gray-700" title={g.statuses.join("、")}>
                                {g.label}
                              </td>
                              {priorities.map((pr) => {
                                const cellKey = `${g.key}|${pr.key}`;
                                const n = p.cells[cellKey]?.count ?? 0;
                                const isOpen =
                                  open?.product === p.name && open?.cell === cellKey;
                                return (
                                  <td key={pr.key} className="px-3 py-2 text-right">
                                    {n === 0 ? (
                                      // 0 不要搶注意力 —— 這張表大部分格子都是 0
                                      <span className="text-gray-200">0</span>
                                    ) : (
                                      <button
                                        onClick={() =>
                                          setOpen(isOpen ? null : { product: p.name, cell: cellKey })
                                        }
                                        className={`rounded px-1.5 py-0.5 font-medium ${
                                          isOpen
                                            ? "bg-gray-900 text-white"
                                            : "text-gray-900 hover:bg-gray-100"
                                        }`}
                                      >
                                        {n}
                                      </button>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="px-4 py-2 text-right text-gray-500">
                                {rowTotal === 0 ? (
                                  <span className="text-gray-200">0</span>
                                ) : (
                                  rowTotal
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {open?.product === p.name && openCell && (
                    <ul className="divide-y divide-gray-100 border-t border-gray-200 bg-gray-50/60">
                      {openCell.issues.map((i) => (
                        <li key={i.key} className="flex items-baseline gap-3 px-4 py-2">
                          <a
                            href={i.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-xs text-sky-700 hover:underline"
                          >
                            {i.key}
                          </a>
                          <span className="min-w-0 flex-1 truncate text-sm text-gray-800">
                            {i.summary}
                          </span>
                          <span className="shrink-0 text-xs text-gray-400">{i.status}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
