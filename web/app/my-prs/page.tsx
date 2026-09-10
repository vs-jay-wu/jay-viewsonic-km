"use client";

import { useCallback, useEffect, useState } from "react";
import Icon, { type IconName } from "@/components/Icon";

interface PrReview {
  id: string; author: string; state: string; submittedAt: string; url: string;
}
interface MyPr {
  repo: string; number: number; title: string; url: string;
  state: "OPEN" | "MERGED" | "CLOSED";
  isDraft: boolean; baseRefName: string; headRefName: string;
  createdAt: string; updatedAt: string; mergedAt: string | null;
  additions: number; deletions: number; changedFiles: number;
  mergeable: string | null; reviewDecision: string | null; checks: string | null;
  reviews: PrReview[]; approvedBy: string[]; changesRequestedBy: string[];
  comments: { id: string; author: string; createdAt: string; url: string }[];
  openThreads: number; openThreadsByOthers: number;
  theirLastActivity: string | null;
}
interface Snapshot {
  fetchedAs: string; fetchedAt: string; mergedWithinDays: number;
  prs: MyPr[]; lastError?: string | null;
}
interface MyPrEvent {
  id: string; type: "approved" | "changes_requested" | "reviewed" | "commented";
  at: string; actor: string; repo: string; number: number; title: string;
  url: string; read: boolean;
}
interface Config {
  enabled: boolean; intervalSeconds: number; notify: boolean;
  mergedDays: number; updatedAt: string;
}
interface Scheduler {
  timerOn: boolean; fetching: boolean; intervalSeconds: number;
  lastRunAt: string | null; nextRunAt: string | null; lastError: string | null;
}

const EVENT_META: Record<MyPrEvent["type"], { label: string; icon: IconName; cls: string }> = {
  approved:          { label: "approve", icon: "check", cls: "text-emerald-600" },
  changes_requested: { label: "要求修改", icon: "alert", cls: "text-amber-600" },
  reviewed:          { label: "review",  icon: "search", cls: "text-sky-600" },
  commented:         { label: "留言",    icon: "message", cls: "text-gray-500" },
};

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-TW", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "剛剛";
  if (min < 60) return `${min} 分前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小時前`;
  const d = Math.floor(h / 24);
  return `${d} 天前`;
}

/**
 * 以 GitHub 自己的 `reviewDecision` 為準，approvedBy／changesRequestedBy
 * 只用來寫「是誰」。
 *
 * 不能反過來用人名清單推狀態：同一個人可能先要求修改、後來又 approve，
 * 照人名列就會把已經過關的 PR 說成還要改（實際踩到 fishing-cat#578）。
 */
function DecisionBadge({ pr }: { pr: MyPr }) {
  const who = (names: string[]) => (names.length ? ` · ${names.join("、")}` : "");
  switch (pr.reviewDecision) {
    case "APPROVED":
      return (
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
          approved{who(pr.approvedBy)}
        </span>
      );
    case "CHANGES_REQUESTED":
      return (
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
          要求修改{who(pr.changesRequestedBy)}
        </span>
      );
    default:
      return (
        <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-500">
          等 review
        </span>
      );
  }
}

function ChecksBadge({ state }: { state: string | null }) {
  if (!state) return null;
  const map: Record<string, { text: string; cls: string }> = {
    SUCCESS: { text: "CI 綠", cls: "text-emerald-600" },
    FAILURE: { text: "CI 紅", cls: "text-red-600" },
    ERROR:   { text: "CI 錯", cls: "text-red-600" },
    PENDING: { text: "CI 跑中", cls: "text-amber-600" },
  };
  const m = map[state] ?? { text: state, cls: "text-gray-400" };
  return <span className={`text-xs ${m.cls}`}>{m.text}</span>;
}

function PrRow({ pr }: { pr: MyPr }) {
  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <a
            href={pr.url}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-gray-900 hover:underline"
          >
            <span className="font-mono text-xs text-gray-500">
              {pr.repo.split("/").pop()}#{pr.number}
            </span>{" "}
            {pr.title}
          </a>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {pr.state === "MERGED" ? (
              <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs text-violet-700">
                merged {relTime(pr.mergedAt)}
              </span>
            ) : (
              <DecisionBadge pr={pr} />
            )}
            {pr.isDraft && <span className="text-xs text-gray-400">draft</span>}
            <ChecksBadge state={pr.checks} />
            {pr.openThreadsByOthers > 0 && (
              <span className="text-xs text-amber-600">
                未解決討論 {pr.openThreadsByOthers}
              </span>
            )}
            {pr.mergeable === "CONFLICTING" && (
              <span className="text-xs text-red-600">有衝突</span>
            )}
            <span className="text-xs text-gray-400">
              +{pr.additions} −{pr.deletions} · {pr.changedFiles} 檔
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right text-xs text-gray-400">
          <div>更新 {relTime(pr.updatedAt)}</div>
          {pr.theirLastActivity && <div>有人回 {relTime(pr.theirLastActivity)}</div>}
        </div>
      </div>
    </li>
  );
}

export default function MyPrsPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [events, setEvents] = useState<MyPrEvent[]>([]);
  const [scheduler, setScheduler] = useState<Scheduler | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [intervalMin, setIntervalMin] = useState(10);

  const load = useCallback(async () => {
    const res = await fetch("/api/my-prs");
    const json = await res.json();
    if (!res.ok) setError(json.error ?? "讀取失敗");
    else {
      setSnapshot(json.snapshot);
      setConfig(json.config);
      setEvents(json.events);
      setScheduler(json.scheduler);
      if (json.config?.intervalSeconds) {
        setIntervalMin(Math.round(json.config.intervalSeconds / 60));
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // 頁面開著的話跟著 server 的節奏刷新（只讀快照，不會打 GitHub）
  useEffect(() => {
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const saveConfig = async (patch: Partial<Config>) => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/my-prs/settings", {
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
    setNotice(null);
    const res = await fetch("/api/my-prs/refresh", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setError(json.error ?? "抓取失敗");
    else {
      setNotice(
        json.bootstrapped
          ? "已建立基準（第一次抓不發通知，否則會被歷史紀錄轟炸）"
          : json.newEvents > 0
            ? `抓到 ${json.newEvents} 則新動靜`
            : "沒有新動靜"
      );
    }
    setBusy(false);
    load();
  };

  const markRead = async () => {
    await fetch("/api/my-prs/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read" }),
    });
    load();
  };

  const clearEvents = async () => {
    await fetch("/api/my-prs/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear" }),
    });
    load();
  };

  const testNotify = async () => {
    setBusy(true);
    const res = await fetch("/api/my-prs/test-notify", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setError(json.error ?? "通知送不出去");
    else setNotice("已送出一則測試通知");
    setBusy(false);
  };

  const prs = snapshot?.prs ?? [];
  const open = prs.filter((p) => p.state === "OPEN");
  const merged = prs.filter((p) => p.state === "MERGED");
  const unread = events.filter((e) => !e.read);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-8 py-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">我的 PR</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
              我自己開的 PR（<code className="text-xs">author:@me</code>，
              <strong className="font-medium text-gray-700">不限 repo</strong>）。
              server 定時抓，開這頁只讀快照、不會打 GitHub。有人 review、approve
              或留言就發通知。不用 AI。
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
        {notice && (
          <div className="mt-6 flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
            <Icon name="check" size={16} className="mt-0.5" />
            {notice}
          </div>
        )}
        {snapshot?.lastError && (
          <div className="mt-6 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <Icon name="alert" size={16} className="mt-0.5" />
            <span className="whitespace-pre-wrap">上次抓取失敗：{snapshot.lastError}</span>
          </div>
        )}

        {/* 設定 */}
        <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-gray-200 px-5 py-4 text-sm">
          <span className="inline-flex items-center gap-2">
            <span
              className={`inline-flex h-2.5 w-2.5 rounded-full ${
                config?.enabled && scheduler?.timerOn ? "bg-emerald-500" : "bg-gray-300"
              }`}
            />
            <span className="font-medium text-gray-900">
              定時抓取 {config?.enabled ? "已開" : "已關"}
            </span>
          </span>

          <label className="inline-flex items-center gap-1.5 text-gray-700">
            每
            <input
              type="number"
              min={1}
              value={intervalMin}
              onChange={(e) => setIntervalMin(Number(e.target.value))}
              className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900"
            />
            分
            <button
              onClick={() => saveConfig({ enabled: true, intervalSeconds: intervalMin * 60 })}
              disabled={busy}
              className="ml-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              套用
            </button>
          </label>

          <label className="inline-flex items-center gap-2 text-gray-700">
            <input
              type="checkbox"
              checked={!!config?.notify}
              onChange={(e) => saveConfig({ notify: e.target.checked })}
            />
            有人 review／留言就通知
          </label>
          <button
            onClick={testNotify}
            disabled={busy}
            className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            測試通知
          </button>

          <button
            onClick={() => saveConfig({ enabled: !config?.enabled })}
            disabled={busy}
            className="ml-auto rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {config?.enabled ? "停用定時抓取" : "啟用定時抓取"}
          </button>
        </div>

        <p className="mt-2 text-xs text-gray-400">
          最後抓取 {fmtTime(snapshot?.fetchedAt ?? null)}
          {scheduler?.nextRunAt && ` · 下次 ${fmtTime(scheduler.nextRunAt)}`}
          {snapshot && ` · merged 取近 ${snapshot.mergedWithinDays} 天`}
          {scheduler?.lastError && ` · 上次錯誤：${scheduler.lastError.slice(0, 80)}`}
        </p>

        {/* 動靜 */}
        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              有人動我的 PR
              {unread.length > 0 && (
                <span className="ml-2 rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] font-normal text-white">
                  {unread.length} 則未讀
                </span>
              )}
            </h2>
            {events.length > 0 && (
              <div className="flex gap-2">
                <button onClick={markRead} className="text-xs text-gray-500 hover:text-gray-800">
                  全部標為已讀
                </button>
                <button onClick={clearEvents} className="text-xs text-gray-400 hover:text-red-600">
                  清空
                </button>
              </div>
            )}
          </div>

          {events.length === 0 ? (
            <p className="mt-3 rounded-xl border border-gray-200 px-5 py-5 text-sm text-gray-400">
              還沒有新動靜。有人 review、approve 或留言時會出現在這裡，並跳一則通知。
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200">
              {events.slice(0, 30).map((e) => {
                const m = EVENT_META[e.type];
                return (
                  <li
                    key={e.id}
                    className={`flex items-center gap-3 px-4 py-2.5 text-sm ${
                      e.read ? "" : "bg-sky-50/50"
                    }`}
                  >
                    <Icon name={m.icon} size={15} className={m.cls} />
                    <span className="text-gray-800">{e.actor}</span>
                    <span className={m.cls}>{m.label}</span>
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate text-xs text-gray-500 hover:underline"
                    >
                      <span className="font-mono">{e.repo.split("/").pop()}#{e.number}</span>{" "}
                      {e.title}
                    </a>
                    <span className="shrink-0 text-xs text-gray-400">{relTime(e.at)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Open */}
        <div className="mt-9">
          <h2 className="text-sm font-semibold text-gray-900">
            開著的 <span className="ml-1 font-normal text-gray-400">{open.length}</span>
          </h2>
          {loading ? (
            <p className="mt-3 text-sm text-gray-400">載入中…</p>
          ) : open.length === 0 ? (
            <p className="mt-3 rounded-xl border border-gray-200 px-5 py-5 text-sm text-gray-400">
              沒有開著的 PR
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200">
              {open.map((pr) => (
                <PrRow key={pr.url} pr={pr} />
              ))}
            </ul>
          )}
        </div>

        {/* Merged */}
        <div className="mt-9">
          <h2 className="text-sm font-semibold text-gray-900">
            近期 merged
            <span className="ml-1 font-normal text-gray-400">{merged.length}</span>
          </h2>
          {merged.length === 0 ? (
            <p className="mt-3 rounded-xl border border-gray-200 px-5 py-5 text-sm text-gray-400">
              這段時間沒有 merged 的 PR
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200">
              {merged.map((pr) => (
                <PrRow key={pr.url} pr={pr} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
