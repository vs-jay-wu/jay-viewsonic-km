"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import Tooltip from "@/components/Tooltip";
import { statusLabel } from "@/lib/jiraStatus";
import {
  DEFAULT_VIEW, PRIORITY_ORDER, TICKET_GROUPS, TICKET_SORTS, allPrsMerged, applyView, capForDisplay,
  groupByProduct, splitPinned,
  groupKeyOf, issueTypeStyle,
  type AssigneeFilter,
  type MyTicket, type MyTicketsSnapshot, type TicketSort,
} from "@/lib/myTicketsRules";
import { useTicketSession } from "@/lib/useTicketSession";

interface Config { enabled: boolean; intervalSeconds: number; updatedAt: string }
interface Scheduler {
  timerOn: boolean; fetching: boolean; intervalSeconds: number;
  lastRunAt: string | null; nextRunAt: string | null; lastError: string | null;
}

const GROUP_CLS: Record<string, string> = {
  in_progress: "border-accent/50 bg-surface-selected text-accent",
  verifying: "border-info/40 bg-surface-sunken text-info",
  todo: "border-line bg-surface-raised text-fg-muted",
  on_hold: "border-warn/40 bg-warn-bg text-warn",
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
  const [pinnedKeys, setPinnedKeys] = useState<string[]>([]);
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
    setPinnedKeys(Array.isArray(json.pinned) ? json.pinned : []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const togglePin = async (key: string) => {
    const res = await fetch("/api/my-tickets/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    const json = await res.json();
    if (Array.isArray(json.pinned)) setPinnedKeys(json.pinned);
  };

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

  // pin 的獨立一區，**不受指派／狀態／優先度篩選影響**（只吃搜尋字串）——
  // 你 pin 一張單就是要一直看到它，被「只看我的」篩掉就沒意義了
  const { pinned: pinnedTickets, rest } = useMemo(
    () => splitPinned(snapshot?.issues ?? [], pinnedKeys, view.query),
    [snapshot, pinnedKeys, view.query]
  );
  /**
   * PR 已經 merge 的單不算「需要注意」（Jay 2026-09-24）—— 單的狀態常常忘了移，
   * 但 PR 合了就代表球不在自己這裡。狀態來自工作索引（`itemOf`）。
   */
  const prMerged = useCallback(
    (key: string) => allPrsMerged(itemOf(key)?.prs ?? []),
    [itemOf]
  );
  const tickets = useMemo(() => applyView(rest, view, prMerged), [rest, view, prMerged]);
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
    applyView(rest, { ...DEFAULT_VIEW, query: view.query, [field]: [value] }).length;

  /** 一列。pin 區與各產品分群共用同一個 renderer —— 兩份一定會漂移。 */
  const renderRow = (t: MyTicket) => {

          const item = itemOf(t.key);
          const groupKey = groupKeyOf(t.status);
          const group = TICKET_GROUPS.find((g) => g.key === groupKey);
          const sessionCount = item?.sessions.length ?? 0;
          return (
            <li key={t.key} className="flex items-start gap-3 px-4 py-3">
              <Tooltip label={pinnedKeys.includes(t.key) ? "取消 pin" : "pin 住（獨立一區，不受篩選影響）"}>
                <button
                  onClick={() => togglePin(t.key)}
                  className={`mt-0.5 shrink-0 ${
                    pinnedKeys.includes(t.key)
                      ? "text-pin"
                      : "text-fg-disabled hover:text-pin"
                  }`}
                >
                  <Icon name="pin" size={15} />
                </button>
              </Tooltip>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={t.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs text-accent hover:underline"
                  >
                    {t.key}
                  </a>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] leading-none ${
                      GROUP_CLS[groupKey ?? ""] ?? "border-line bg-surface text-fg-muted"
                    }`}
                    title={group ? `${group.label}／${t.status}` : t.status}
                  >
                    {statusLabel(t.status)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-fg-muted">
                    <Icon
                      name={issueTypeStyle(t.issueType).icon}
                      size={13}
                      className={issueTypeStyle(t.issueType).cls}
                    />
                    {t.issueType}
                  </span>
                  <span className="text-[11px] text-fg-subtle">{t.priority}</span>
                  {/* 指派給誰。別人的單用不同的底色，掃過去就看得出球不在我這裡 */}
                  <span
                    className={`rounded-full border px-1.5 py-0.5 text-[11px] leading-none ${
                      t.assignedToMe
                        ? "border-line bg-surface-raised text-fg-muted"
                        : "border-info/40 bg-surface-sunken text-info"
                    }`}
                    title={`回報者：${t.reporter?.name || "—"}`}
                  >
                    {t.assignee?.name || "未指派"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-fg">{t.summary}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-fg-subtle">
                  <span>更新 {relTime(t.updated)}</span>
                  {item?.prs.map((pr) => (
                    <a
                      key={pr.url}
                      href={pr.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-full border border-line px-1.5 py-0.5 text-fg-muted hover:bg-surface-raised"
                    >
                      <Icon name="gitPr" size={10} />
                      {pr.repo.split("/").pop()}#{pr.number}
                      {pr.state !== "OPEN" && (
                        <span className="text-fg-subtle">{pr.state.toLowerCase()}</span>
                      )}
                    </a>
                  ))}
                  {sessionCount > 0 && (
                    <span className="rounded-full border border-line px-1.5 py-0.5 text-fg-muted">
                      {sessionCount} 個 session
                    </span>
                  )}
                </div>
              </div>

              {/* 有掛到工作項目才有「這條線的改動」可看（那頁靠 key 查） */}
              {item && (
                <Tooltip side="left" label="這條線總共改了什麼（跨 repo，commit ＋ 還沒 commit 的）">
                  <a
                    href={`/work?key=${encodeURIComponent(item.key)}`}
                    className="mt-0.5 shrink-0 text-fg-disabled hover:text-fg"
                  >
                    <Icon name="layers" size={16} />
                  </a>
                </Tooltip>
              )}

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
                      ? "text-accent hover:text-accent"
                      : "text-fg-disabled hover:text-accent"
                  }`}
                >
                  <Icon name={sessionCount > 0 ? "external" : "play"} size={16} />
                </button>
              </Tooltip>
            </li>
          );
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-6 sm:px-8 sm:py-10">
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-fg">
          <Icon name="clipboard" size={22} className="text-fg-subtle" />
          單追蹤
        </h1>
        <p className="mt-1.5 text-sm text-fg-muted">
          VB 上<b className="font-medium text-fg">所有</b>未完成的單，預設只看指派給我的
          —— 要看別人的就切「指派」或直接搜名字，不用挑人。
          點單號到 Jira，點右邊的按鈕直接在 Orca 開（或接續）對應的 Claude session。
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[16rem]">
            <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input
              value={view.query}
              onChange={(e) => setView((v) => ({ ...v, query: e.target.value }))}
              placeholder="搜尋單號、標題、狀態、指派人…"
              className="w-full rounded-lg border border-line-strong py-2 pl-9 pr-3 text-sm outline-none focus:border-line-strong"
            />
          </div>
          <Tooltip label="只抓上次之後有更新的（便宜）">
            <button
              onClick={() => refresh(false)}
              disabled={busy}
              className="rounded-lg border border-line-strong px-3 py-2 text-xs text-fg hover:bg-surface-raised disabled:opacity-50"
            >
              立即更新
            </button>
          </Tooltip>
          <Tooltip label="整份重抓。平常不必按 —— 夜裡會自己做一次">
            <button
              onClick={() => refresh(true)}
              disabled={busy}
              className="rounded-lg border border-line-strong px-3 py-2 text-xs text-fg-muted hover:bg-surface-raised disabled:opacity-50"
            >
              全同步
            </button>
          </Tooltip>
        </div>

        {/* 過濾與排序。整列高度固定，選了條件也不會把下面的清單推走 */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
          <span className="text-fg-subtle">排序</span>
          <div className="flex flex-wrap gap-1">
            {TICKET_SORTS.map((s) => (
              <button
                key={s.key}
                onClick={() => setView((v) => ({ ...v, sort: s.key as TicketSort }))}
                className={`rounded-full border px-2 py-0.5 ${
                  view.sort === s.key
                    ? "border-control bg-control text-on-solid"
                    : "border-line text-fg-muted hover:bg-surface-raised"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <span className="ml-2 text-fg-subtle">指派</span>
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
                    ? "border-control bg-control text-on-solid"
                    : "border-line text-fg-muted hover:bg-surface-raised"
                }`}
              >
                {label}{" "}
                <span className={view.assignee === key ? "text-fg-disabled" : "text-fg-subtle"}>
                  {applyView(rest, { ...DEFAULT_VIEW, query: view.query, assignee: key }).length}
                </span>
              </button>
            ))}
          </div>

          <span className="ml-2 text-fg-subtle">狀態</span>
          <div className="flex flex-wrap gap-1">
            {TICKET_GROUPS.map((g) => {
              const on = view.groups.includes(g.key);
              const n = countIn("groups", g.key);
              return (
                <button
                  key={g.key}
                  onClick={() => toggle("groups", g.key)}
                  className={`rounded-full border px-2 py-0.5 ${
                    on ? "border-accent/60 bg-surface-selected text-accent" : "border-line text-fg-muted hover:bg-surface-raised"
                  }`}
                >
                  {g.label} <span className="text-fg-subtle">{n}</span>
                </button>
              );
            })}
          </div>

          <span className="ml-2 text-fg-subtle">優先度</span>
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
                    on ? "border-accent/60 bg-surface-selected text-accent" : "border-line text-fg-muted hover:bg-surface-raised"
                  }`}
                >
                  {p} <span className="text-fg-subtle">{n}</span>
                </button>
              );
            })}
          </div>

          {(view.groups.length > 0 || view.priorities.length > 0 || view.assignee !== "mine") && (
            <button
              onClick={() =>
                setView((v) => ({ ...v, groups: [], priorities: [], assignee: "mine" }))
              }
              className="text-fg-subtle hover:text-fg"
            >
              清掉篩選
            </button>
          )}
        </div>

        <div className="mt-2 min-h-[2.5rem] text-xs">
          <div className="text-fg-subtle">
            {snapshot
              ? `${tickets.length} / ${snapshot.issueCount} 筆 · ${snapshot.fetchedAs} · 最後抓取 ${fmtTime(snapshot.fetchedAt)}（${snapshot.mode === "full" ? "全同步" : "增量"}）`
              : loading ? "載入中…" : "還沒有資料"}
            {scheduler?.nextRunAt && ` · 下次 ${fmtTime(scheduler.nextRunAt)}`}
            {config && !config.enabled && " · 定時抓取已停用"}
          </div>
          {(notice || sessionNotice) && (
            <div className="mt-1 text-accent">{notice ?? sessionNotice}</div>
          )}
          {(error || sessionError || snapshot?.lastError) && (
            <div className="mt-1 text-danger">
              {error ?? sessionError ?? snapshot?.lastError}
            </div>
          )}
        </div>

        {tickets.length === 0 && (
          <p className="mt-4 rounded-xl border border-line px-4 py-8 text-center text-sm text-fg-subtle">
            {snapshot ? "沒有符合的單" : "—"}
          </p>
        )}

        {pinnedTickets.length > 0 && (
          <section className="mt-4">
            <h2 className="flex items-baseline gap-2 px-1 text-xs font-semibold text-fg">
              <Icon name="pin" size={13} className="text-pin" />
              已 pin
              <span className="font-normal text-fg-subtle">{pinnedTickets.length}</span>
              <span className="font-normal text-fg-disabled">· 不受篩選影響</span>
            </h2>
            <ul className="mt-1.5 divide-y divide-line rounded-xl border border-line">
              {pinnedTickets.map(renderRow)}
            </ul>
          </section>
        )}

        {/* 依 Jira 的「Project」欄位分群；群內順序由上面選的排序決定 */}
        {groupByProduct(capped.shown).map((g) => (
        <section key={g.product} className="mt-4">
          <h2 className="flex items-baseline gap-2 px-1 text-xs font-semibold text-fg">
            {g.product}
            <span className="font-normal text-fg-subtle">{g.tickets.length}</span>
          </h2>
          <ul className="mt-1.5 divide-y divide-line rounded-xl border border-line">
          {g.tickets.map(renderRow)}
          </ul>
        </section>
        ))}

        {capped.hidden > 0 && (
          <p className="mt-3 rounded-xl border border-dashed border-line px-4 py-3 text-center text-xs text-fg-subtle">
            還有 {capped.hidden} 筆沒顯示 —— 用搜尋或篩選收斂（例如打指派人的名字）。
          </p>
        )}
      </div>
    </div>
  );
}
