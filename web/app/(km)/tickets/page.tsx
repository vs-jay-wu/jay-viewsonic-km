"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import Tooltip from "@/components/Tooltip";
import { statusLabel } from "@/lib/jiraStatus";
import {
  DEFAULT_VIEW, PRIORITY_ORDER, TICKET_GROUPS, TICKET_SORTS, applyView, capForDisplay,
  groupByProduct,
  groupKeyOf, issueTypeStyle,
  type AssigneeFilter,
  type MyTicketsSnapshot, type TicketSort,
} from "@/lib/myTicketsRules";
import { useTicketSession } from "@/lib/useTicketSession";

interface Config { enabled: boolean; intervalSeconds: number; updatedAt: string }
interface Scheduler {
  timerOn: boolean; fetching: boolean; intervalSeconds: number;
  lastRunAt: string | null; nextRunAt: string | null; lastError: string | null;
}

const GROUP_CLS: Record<string, string> = {
  in_progress: "border-sky-200 bg-sky-50 text-sky-700",
  verifying: "border-violet-200 bg-violet-50 text-violet-700",
  todo: "border-gray-200 bg-gray-50 text-gray-600",
  on_hold: "border-amber-200 bg-amber-50 text-amber-700",
};

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-TW", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `${Math.max(min, 1)} 分前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小時前`;
  return `${Math.floor(h / 24)} 天前`;
}

export default function TicketsPage() {
  const [snapshot, setSnapshot] = useState<MyTicketsSnapshot | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [scheduler, setScheduler] = useState<Scheduler | null>(null);
  const [view, setView] = useState(DEFAULT_VIEW);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 開／接續這張單的 session —— 跟 VB Bug 總覽共用同一個 hook
  const { itemOf, openSessionFor, busy: sessionBusy, notice: sessionNotice,
          error: sessionError } = useTicketSession();

  const load = useCallback(async () => {
    const res = await fetch("/api/my-tickets", { cache: "no-store" });
    const json = await res.json();
    setSnapshot(json.snapshot);
    setConfig(json.config);
    setScheduler(json.scheduler);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const refresh = async (full: boolean) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/my-tickets/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) setError(json.error ?? "抓取失敗");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const tickets = useMemo(
    () => applyView(snapshot?.issues ?? [], view),
    [snapshot, view]
  );
  // 快照裡是 VB 全部未完成的單（幾百筆），一次畫完只會拖慢畫面
  const capped = useMemo(() => capForDisplay(tickets), [tickets]);

  /** 多選的過濾條件：點一下加入，再點一下移除 */
  const toggle = (field: "groups" | "priorities", value: string) =>
    setView((v) => ({
      ...v,
      [field]: v[field].includes(value)
        ? v[field].filter((x) => x !== value)
        : [...v[field], value],
    }));

  /** 這個分組／優先度現在有幾筆（只吃搜尋字串，不吃其他過濾，
   *  否則選了一個之後其他的數字會全部變 0，看不出還有什麼可選） */
  const countIn = (field: "groups" | "priorities", value: string) =>
    applyView(snapshot?.issues ?? [], {
      ...DEFAULT_VIEW,
      query: view.query,
      [field]: [value],
    }).length;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-6 sm:px-8 sm:py-10">
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-gray-900">
          <Icon name="clipboard" size={22} className="text-gray-400" />
          單追蹤
        </h1>
        <p className="mt-1.5 text-sm text-gray-500">
          VB 上<b className="font-medium text-gray-700">所有</b>未完成的單，預設只看指派給我的
          —— 要看別人的就切「指派」或直接搜名字，不用挑人。
          點單號到 Jira，點右邊的按鈕直接在 Orca 開（或接續）對應的 Claude session。
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[16rem]">
            <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={view.query}
              onChange={(e) => setView((v) => ({ ...v, query: e.target.value }))}
              placeholder="搜尋單號、標題、狀態、指派人…"
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-gray-500"
            />
          </div>
          <Tooltip label="只抓上次之後有更新的（便宜）">
            <button
              onClick={() => refresh(false)}
              disabled={busy}
              className="rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              立即更新
            </button>
          </Tooltip>
          <Tooltip label="整份重抓。平常不必按 —— 夜裡會自己做一次">
            <button
              onClick={() => refresh(true)}
              disabled={busy}
              className="rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-50"
            >
              全同步
            </button>
          </Tooltip>
        </div>

        {/* 過濾與排序。整列高度固定，選了條件也不會把下面的清單推走 */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
          <span className="text-gray-400">排序</span>
          <div className="flex flex-wrap gap-1">
            {TICKET_SORTS.map((s) => (
              <button
                key={s.key}
                onClick={() => setView((v) => ({ ...v, sort: s.key as TicketSort }))}
                className={`rounded-full border px-2 py-0.5 ${
                  view.sort === s.key
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <span className="ml-2 text-gray-400">指派</span>
          <div className="flex flex-wrap gap-1">
            {([
              ["mine", "我的"],
              ["others", "別人的"],
              ["unassigned", "未指派"],
              ["all", "全部"],
            ] as [AssigneeFilter, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setView((v) => ({ ...v, assignee: key }))}
                className={`rounded-full border px-2 py-0.5 ${
                  view.assignee === key
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {label}{" "}
                <span className={view.assignee === key ? "text-gray-300" : "text-gray-400"}>
                  {applyView(snapshot?.issues ?? [], {
                    ...DEFAULT_VIEW, query: view.query, assignee: key,
                  }).length}
                </span>
              </button>
            ))}
          </div>

          <span className="ml-2 text-gray-400">狀態</span>
          <div className="flex flex-wrap gap-1">
            {TICKET_GROUPS.map((g) => {
              const on = view.groups.includes(g.key);
              const n = countIn("groups", g.key);
              return (
                <button
                  key={g.key}
                  onClick={() => toggle("groups", g.key)}
                  className={`rounded-full border px-2 py-0.5 ${
                    on ? "border-sky-500 bg-sky-50 text-sky-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {g.label} <span className="text-gray-400">{n}</span>
                </button>
              );
            })}
          </div>

          <span className="ml-2 text-gray-400">優先度</span>
          <div className="flex flex-wrap gap-1">
            {PRIORITY_ORDER.map((p) => {
              const on = view.priorities.includes(p);
              const n = countIn("priorities", p);
              if (n === 0 && !on) return null;
              return (
                <button
                  key={p}
                  onClick={() => toggle("priorities", p)}
                  className={`rounded-full border px-2 py-0.5 ${
                    on ? "border-sky-500 bg-sky-50 text-sky-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {p} <span className="text-gray-400">{n}</span>
                </button>
              );
            })}
          </div>

          {(view.groups.length > 0 || view.priorities.length > 0 || view.assignee !== "mine") && (
            <button
              onClick={() =>
                setView((v) => ({ ...v, groups: [], priorities: [], assignee: "mine" }))
              }
              className="text-gray-400 hover:text-gray-700"
            >
              清掉篩選
            </button>
          )}
        </div>

        <div className="mt-2 min-h-[2.5rem] text-xs">
          <div className="text-gray-400">
            {snapshot
              ? `${tickets.length} / ${snapshot.issueCount} 筆 · ${snapshot.fetchedAs} · 最後抓取 ${fmtTime(snapshot.fetchedAt)}（${snapshot.mode === "full" ? "全同步" : "增量"}）`
              : loading ? "載入中…" : "還沒有資料"}
            {scheduler?.nextRunAt && ` · 下次 ${fmtTime(scheduler.nextRunAt)}`}
            {config && !config.enabled && " · 定時抓取已停用"}
          </div>
          {(notice || sessionNotice) && (
            <div className="mt-1 text-sky-700">{notice ?? sessionNotice}</div>
          )}
          {(error || sessionError || snapshot?.lastError) && (
            <div className="mt-1 text-red-600">
              {error ?? sessionError ?? snapshot?.lastError}
            </div>
          )}
        </div>

        {tickets.length === 0 && (
          <p className="mt-4 rounded-xl border border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
            {snapshot ? "沒有符合的單" : "—"}
          </p>
        )}

        {/* 依 Jira 的「Project」欄位分群；群內順序由上面選的排序決定 */}
        {groupByProduct(capped.shown).map((g) => (
        <section key={g.product} className="mt-4">
          <h2 className="flex items-baseline gap-2 px-1 text-xs font-semibold text-gray-700">
            {g.product}
            <span className="font-normal text-gray-400">{g.tickets.length}</span>
          </h2>
          <ul className="mt-1.5 divide-y divide-gray-100 rounded-xl border border-gray-200">
          {g.tickets.map((t) => {
            const item = itemOf(t.key);
            const groupKey = groupKeyOf(t.status);
            const group = TICKET_GROUPS.find((g) => g.key === groupKey);
            const sessionCount = item?.sessions.length ?? 0;
            return (
              <li key={t.key} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={t.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-xs text-sky-700 hover:underline"
                    >
                      {t.key}
                    </a>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] leading-none ${
                        GROUP_CLS[groupKey ?? ""] ?? "border-gray-200 bg-white text-gray-500"
                      }`}
                      title={group ? `${group.label}／${t.status}` : t.status}
                    >
                      {statusLabel(t.status)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                      <Icon
                        name={issueTypeStyle(t.issueType).icon}
                        size={13}
                        className={issueTypeStyle(t.issueType).cls}
                      />
                      {t.issueType}
                    </span>
                    <span className="text-[11px] text-gray-400">{t.priority}</span>
                    {/* 指派給誰。別人的單用不同的底色，掃過去就看得出球不在我這裡 */}
                    <span
                      className={`rounded-full border px-1.5 py-0.5 text-[11px] leading-none ${
                        t.assignedToMe
                          ? "border-gray-200 bg-gray-50 text-gray-500"
                          : "border-violet-200 bg-violet-50 text-violet-700"
                      }`}
                      title={`回報者：${t.reporter?.name || "—"}`}
                    >
                      {t.assignee?.name || "未指派"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-800">{t.summary}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                    <span>更新 {relTime(t.updated)}</span>
                    {item?.prs.map((pr) => (
                      <a
                        key={pr.url}
                        href={pr.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-1.5 py-0.5 text-gray-600 hover:bg-gray-50"
                      >
                        <Icon name="gitPr" size={10} />
                        {pr.repo.split("/").pop()}#{pr.number}
                        {pr.state !== "OPEN" && (
                          <span className="text-gray-400">{pr.state.toLowerCase()}</span>
                        )}
                      </a>
                    ))}
                    {sessionCount > 0 && (
                      <span className="rounded-full border border-gray-200 px-1.5 py-0.5 text-gray-600">
                        {sessionCount} 個 session
                      </span>
                    )}
                  </div>
                </div>

                <Tooltip
                  side="left"
                  label={
                    sessionCount > 0
                      ? `在 Orca 開這張單的 session（已有 ${sessionCount} 個，開最近的那個）`
                      : "在 Orca 開一個新的 session 來做這張單（名稱可改）"
                  }
                >
                  <button
                    onClick={() => openSessionFor(t)}
                    disabled={busy || sessionBusy}
                    className={`mt-0.5 shrink-0 disabled:opacity-40 ${
                      sessionCount > 0
                        ? "text-sky-500 hover:text-sky-700"
                        : "text-gray-300 hover:text-sky-600"
                    }`}
                  >
                    <Icon name={sessionCount > 0 ? "external" : "play"} size={16} />
                  </button>
                </Tooltip>
              </li>
            );
          })}
          </ul>
        </section>
        ))}

        {capped.hidden > 0 && (
          <p className="mt-3 rounded-xl border border-dashed border-gray-200 px-4 py-3 text-center text-xs text-gray-400">
            還有 {capped.hidden} 筆沒顯示 —— 用搜尋或篩選收斂（例如打指派人的名字）。
          </p>
        )}
      </div>
    </div>
  );
}
