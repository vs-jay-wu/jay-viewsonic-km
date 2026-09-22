"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import Tooltip from "@/components/Tooltip";
import { statusLabel } from "@/lib/jiraStatus";
import { useTicketSession } from "@/lib/useTicketSession";
import { groupOfStatus, HIDDEN_BY_DEFAULT, sortProducts } from "@/lib/vbBugsRules";

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
  mode: "full" | "incremental"; lastFullSyncAt: string | null; fetchedCount: number;
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

/**
 * 狀態的顏色。
 *
 * **色相跟著分組走**（待處理灰、進行中藍、待驗證紫、完成綠），讓它跟表格的
 * 列對得起來；**同一組內用深淺區分**，愈接近完成愈深。
 *
 * 按分組上色是不夠的 —— 展開的是「同一格」，那一格裡的票**本來就同組**，
 * 全部同色等於沒區分（第一版就是這樣，Jay 一眼看出來）。
 *
 * 兩個例外刻意換色系：`QA REJECT` 與 `Blocked` 是該組裡的**負向**狀態，
 * 跟旁邊的「正在推進」不是同一回事。
 */
const STATUS_CHIP: Record<string, string> = {
  // 待處理 —— 灰，愈接近可以動工愈深
  "DISCOVERY/REFINEMENT": "border-line bg-surface-raised text-fg-muted",
  "BACKLOG": "border-line bg-surface-sunken text-fg-muted",
  "待辦事項": "border-line bg-surface-sunken text-fg",
  "READY FOR DEV": "border-line-strong bg-surface-sunken text-fg",
  // 進行中 —— 藍
  "進行中": "border-accent/50 bg-surface-selected text-accent",
  "IN CODE REVIEW": "border-accent/50 bg-accent-bg text-accent",
  "PR MERGED": "border-accent/60 bg-accent text-accent",
  // 待驗證 —— 紫；被打回票的另外標紅
  "STAGE READY(READY FOR QA)": "border-info/40 bg-surface-sunken text-info",
  "TRACKING BY QA": "border-info/50 bg-surface-sunken text-info",
  "VERIFYING": "border-info/50 bg-surface-sunken text-info",
  "QA REJECT": "border-rose-300 bg-rose-50 text-rose-700",
  // 完成 —— 綠
  "QA ACCEPTED": "border-ok/40 bg-ok-bg text-ok",
  "PRODUCTION READY": "border-ok/40 bg-ok/25 text-ok",
  // 擱置 —— 琥珀；Blocked 比 Pending 嚴重，標紅
  "Pending": "border-warn/40 bg-warn-bg text-warn",
  "Blocked": "border-danger/50 bg-danger-bg text-danger",
};

/** 分組的底色，給分組表沒列到的新狀態當退路 */
const GROUP_FALLBACK: Record<string, string> = {
  todo: "border-line bg-surface-sunken text-fg-muted",
  in_progress: "border-accent/50 bg-surface-selected text-accent",
  verifying: "border-info/40 bg-surface-sunken text-info",
  production_ready: "border-ok/40 bg-ok-bg text-ok",
  on_hold: "border-warn/40 bg-warn-bg text-warn",
};

function chipClass(status: string): string {
  if (STATUS_CHIP[status]) return STATUS_CHIP[status];
  const g = groupOfStatus(status);
  return (g && GROUP_FALLBACK[g]) || "border-line bg-surface-raised text-fg-muted";
}

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
  // 「這張單有沒有對應的 session，沒有就開一個」—— 跟「指派給我的單」共用
  const session = useTicketSession();
  /** server 已經抓到更新的一份，但畫面還是舊的 —— 由使用者按一下才換 */
  const [hasNewer, setHasNewer] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/vb-bugs");
    const json = await res.json();
    if (!res.ok) setError(json.error ?? "讀取失敗");
    else {
      setSnapshot(json.snapshot);
      setConfig(json.config);
      setScheduler(json.scheduler);
      setHasNewer(false);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  /**
   * 開著畫面時，server 可能在背景抓到新資料。這裡只輪詢一個很輕的版本端點
   * （完整資料在幾千張票時是 MB 級，不能每 15 秒拉一次），發現變了就顯示
   * 一個提示，**不直接換掉畫面** —— 正在看某一格的時候被抽換很煩。
   */
  useEffect(() => {
    if (!snapshot) return;
    const t = setInterval(async () => {
      const res = await fetch("/api/vb-bugs/version");
      if (!res.ok) return;
      const v = await res.json();
      if (v.fetchedAt && v.fetchedAt !== snapshot.fetchedAt) setHasNewer(true);
    }, 15_000);
    return () => clearInterval(t);
  }, [snapshot]);

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

  const refreshNow = async (full = false) => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/vb-bugs/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full }),
    });
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
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-fg">VB Bug 總覽</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
              <code className="text-xs">project = VB AND issuetype = Bug</code>，未完成的票，
              依<strong className="font-medium text-fg">產品 × 狀態 × 優先度</strong>聚合。
              server 定時抓快照，開這頁不會打 Jira。點數字可以直接看是哪幾張票。
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => refreshNow(true)}
              disabled={busy}
              title="忽略增量，整份重抓（處理被硬刪或搬走的幽靈票）。排程只在台北時間 20:00–07:00 自動做一次，過了不補"
              className="rounded-lg border border-line px-3 py-2 text-sm text-fg-muted hover:bg-surface-raised disabled:opacity-50"
            >
              全同步
            </button>
            <button
              onClick={() => refreshNow(false)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-fg hover:bg-surface-raised disabled:opacity-50"
            >
              <Icon name="refresh" size={15} className={busy || scheduler?.fetching ? "animate-spin" : ""} />
              立即更新
            </button>
          </div>
        </div>

        {hasNewer && (
          <div className="mt-6 flex items-center gap-2 rounded-lg border border-accent/50 bg-surface-selected px-4 py-2.5 text-sm text-accent">
            <Icon name="refresh" size={15} />
            server 已經抓到更新的資料
            <button
              onClick={() => load()}
              className="ml-auto rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-on-solid hover:bg-accent"
            >
              更新畫面
            </button>
          </div>
        )}

        {error && (
          <div className="mt-6 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger-bg px-4 py-3 text-sm text-danger">
            <Icon name="alert" size={16} className="mt-0.5" />
            <span className="whitespace-pre-wrap">{error}</span>
          </div>
        )}
        {snapshot?.lastError && (
          <div className="mt-6 flex items-start gap-2 rounded-lg border border-warn/40 bg-warn-bg px-4 py-3 text-sm text-warn">
            <Icon name="alert" size={16} className="mt-0.5" />
            <span className="whitespace-pre-wrap">上次抓取失敗：{snapshot.lastError}</span>
          </div>
        )}
        {snapshot && Object.keys(snapshot.unmappedStatuses).length > 0 && (
          <div className="mt-6 rounded-lg border border-warn/40 bg-warn-bg px-4 py-3 text-sm text-warn">
            <div className="flex items-start gap-2">
              <Icon name="alert" size={16} className="mt-0.5" />
              <div>
                有狀態不在分組表裡，這些票沒被算進去 —— 代表 VB 加了新狀態，要回去補
                <code className="mx-1 text-xs">web/lib/vbBugsRules.ts</code>的
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
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-line px-5 py-3.5 text-sm">
          <label className="inline-flex items-center gap-2 text-fg">
            <input
              type="checkbox"
              checked={!!config?.showProductionReady}
              onChange={(e) => save({ showProductionReady: e.target.checked })}
            />
            顯示 Production Ready 那一列
          </label>
          <span className="text-xs text-fg-subtle">
            {snapshot
              ? `${snapshot.issueCount} 張未完成的 bug · ${fmtTime(snapshot.fetchedAt)}` +
                `（${snapshot.mode === "incremental" ? "增量" : "全同步"}，這輪抓了 ${snapshot.fetchedCount} 筆）`
              : "尚無快照"}
            {scheduler?.nextRunAt && ` · 下次 ${fmtTime(scheduler.nextRunAt)}`}
            {snapshot?.lastFullSyncAt && ` · 上次全同步 ${fmtTime(snapshot.lastFullSyncAt)}`}
          </span>
          {pinned.length > 0 && (
            <span className="ml-auto text-xs text-fg-subtle">
              已 pin：{pinned.join("、")}
            </span>
          )}
        </div>

        {/* 開 session 的結果。固定佔一行，不要讓下面的矩陣上下跳 */}
        <div className="mt-1 h-4 text-xs">
          {session.notice && <span className="text-accent">{session.notice}</span>}
          {session.error && <span className="text-danger">{session.error}</span>}
        </div>

        {/* 矩陣 */}
        {loading ? (
          <p className="mt-8 text-sm text-fg-subtle">載入中…</p>
        ) : !snapshot ? (
          <p className="mt-8 rounded-xl border border-line px-5 py-6 text-sm text-fg-subtle">
            還沒有快照。按「立即更新」抓一次。
          </p>
        ) : (
          <div className="mt-6 space-y-6">
            {products.map((p) => {
              const isPinned = pinned.includes(p.name);
              return (
                <div key={p.name} className="overflow-hidden rounded-xl border border-line">
                  <div className="flex items-center gap-2.5 border-b border-line bg-surface-raised px-4 py-2.5">
                    <button
                      onClick={() => save({ togglePin: p.name })}
                      disabled={busy}
                      title={isPinned ? "取消 pin" : "pin 住（排到前面）"}
                      className={isPinned ? "text-pin" : "text-fg-disabled hover:text-pin"}
                    >
                      <Icon name="pin" size={15} />
                    </button>
                    <h2 className="text-sm font-semibold text-fg">{p.name}</h2>
                    <span className="text-xs text-fg-subtle">{p.total} 張</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-fg-muted">
                          <th className="px-4 py-2 font-medium">狀態</th>
                          {priorities.map((pr) => (
                            <th key={pr.key} className="px-3 py-2 text-right font-medium">
                              {pr.label}
                              <span className="ml-1 font-normal text-fg-disabled">{pr.sub}</span>
                            </th>
                          ))}
                          <th className="px-4 py-2 text-right font-medium">小計</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {groups.map((g) => {
                          const rowTotal = priorities.reduce(
                            (n, pr) => n + (p.cells[`${g.key}|${pr.key}`]?.count ?? 0), 0
                          );
                          return (
                            <tr key={g.key}>
                              <td className="px-4 py-2 text-fg" title={g.statuses.join("、")}>
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
                                      <span className="text-fg-disabled">0</span>
                                    ) : (
                                      <button
                                        onClick={() =>
                                          setOpen(isOpen ? null : { product: p.name, cell: cellKey })
                                        }
                                        className={`rounded px-1.5 py-0.5 font-medium ${
                                          isOpen
                                            ? "bg-control text-on-solid"
                                            : "text-fg hover:bg-surface-sunken"
                                        }`}
                                      >
                                        {n}
                                      </button>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="px-4 py-2 text-right text-fg-muted">
                                {rowTotal === 0 ? (
                                  <span className="text-fg-disabled">0</span>
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
                    <ul className="divide-y divide-line border-t border-line bg-surface-raised/60">
                      {openCell.issues.map((i) => (
                        <li key={i.key} className="flex items-baseline gap-3 px-4 py-2">
                          <a
                            href={i.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-xs text-accent hover:underline"
                          >
                            {i.key}
                          </a>
                          <span className="min-w-0 flex-1 truncate text-sm text-fg">
                            {i.summary}
                          </span>
                          {/* 這張單已經有的 PR（來自 lib/workIndex.ts 的關聯） */}
                          {session.itemOf(i.key)?.prs.map((pr) => (
                            <a
                              key={pr.url}
                              href={pr.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-1.5 py-0.5 text-[11px] leading-none text-fg-muted hover:bg-surface-raised"
                            >
                              <Icon name="gitPr" size={10} />
                              {pr.number}
                            </a>
                          ))}
                          <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${chipClass(i.status)}`}
                          >
                            {statusLabel(i.status)}
                          </span>
                          {(() => {
                            const count = session.itemOf(i.key)?.sessions.length ?? 0;
                            return (
                              <Tooltip
                                side="left"
                                label={
                                  count > 0
                                    ? `在 Orca 開這張單的 session（已有 ${count} 個，開最近的那個）`
                                    : "在 Orca 開一個新的 session 來做這張單（名稱可改）"
                                }
                              >
                                <button
                                  onClick={() => session.openSessionFor(i)}
                                  disabled={session.busy}
                                  className={`shrink-0 disabled:opacity-40 ${
                                    count > 0
                                      ? "text-accent hover:text-accent"
                                      : "text-fg-disabled hover:text-accent"
                                  }`}
                                >
                                  <Icon name={count > 0 ? "external" : "play"} size={14} />
                                </button>
                              </Tooltip>
                            );
                          })()}
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
