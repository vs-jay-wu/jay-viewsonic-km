"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { useHubStatus } from "@/components/useHubStatus";
import { useConfirm } from "@/components/Confirm";
import Tooltip from "@/components/Tooltip";
import WorkRefChips from "@/components/WorkRefChips";
import { parseSessionTitle } from "@/lib/workItemRules";
import {
  findItemBySession, isSettled, prDecisionLabel, prStateStyle, settledSummary,
} from "@/lib/workIndexRules";
import { useTicketSession } from "@/lib/useTicketSession";
import { isDefaultWorkContext, isStale, STALE_DAYS } from "@/lib/sessionRules";
import { projectLocation } from "@/lib/sessionLocationRules";
import TranscriptPanel from "@/components/TranscriptPanel";

interface SessionInfo {
  id: string;
  projectDir: string;
  cwd: string;
  title: string;
  titleSource: "custom" | "agent" | "prompt" | "none";
  gitBranch: string | null;
  version: string | null;
  sizeBytes: number;
  sidecarBytes: number;
  modifiedAt: string;
  createdAt: string | null;
  hasSidecar: boolean;
  pinned: boolean;
  pinnedAt: string | null;
  /**
   * 這筆是別台機器推上來的（`lib/machineRules.ts`）。
   * 它的 transcript、磁碟、Orca 都在那一台 —— **刪除與開啟在這裡做不到**。
   */
  remote?: boolean;
  machine?: { id: string; name: string };
  machineLastSeenAt?: string;
  machineStale?: boolean;
}

interface DeleteResult {
  id: string;
  ok: boolean;
  freedBytes: number;
  error?: string;
}

function mb(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "剛剛";
  if (min < 60) return `${min} 分前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小時前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(iso).toLocaleDateString("zh-TW");
}

const SOURCE_LABEL: Record<SessionInfo["titleSource"], string> = {
  custom: "自訂標題",
  agent: "agent 名",
  prompt: "第一句 prompt",
  none: "無標題",
};

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [project, setProject] = useState("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"all" | "stale" | "settled">("all");
  const [staleDays, setStaleDays] = useState(STALE_DAYS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<DeleteResult[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const confirm = useConfirm();
  // 關聯索引（session ↔ PR ↔ ticket），只用它的資料，不在這頁開 session
  const { workIndex } = useTicketSession();
  /** 剛在 Orca 開過的，按鈕上給個回饋 */
  const [opened, setOpened] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/sessions");
    const json = await res.json();
    if (!res.ok) setError(json.error ?? "讀取失敗");
    else setSessions(json.sessions);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  /**
   * 專案下拉：**照 repo 分組**，不是照 cwd。
   *
   * Orca 的工作區（`~/orca/workspaces/edu-vbo/thresher`）原本各自佔一列、
   * 只顯示 `thresher`，看起來像三個不相干的專案（Jay 2026-09-30）。
   * 判準在 `lib/sessionLocationRules.ts`（有測試）。
   */
  const projects = useMemo(() => {
    const m = new Map<string, { n: number; labels: Set<string> }>();
    for (const s of sessions) {
      const { repo, label } = projectLocation(s.cwd);
      const cur = m.get(repo) ?? { n: 0, labels: new Set<string>() };
      cur.n++;
      cur.labels.add(label);
      m.set(repo, cur);
    }
    return [...m.entries()]
      .map(([repo, v]) => ({ repo, n: v.n, labels: [...v.labels].sort() }))
      .sort((a, b) => b.n - a.n);
  }, [sessions]);

  const stale = useMemo(
    () => sessions.filter((s) => isStale(s, staleDays)),
    [sessions, staleDays]
  );
  const staleBytes = stale.reduce((n, s) => n + s.sizeBytes + s.sidecarBytes, 0);

  /** 對應的 PR 全部 merged／closed 的 session —— 工作已經收尾，通常可以刪 */
  const settled = useMemo(
    () =>
      workIndex
        ? sessions.filter((s) => isSettled(findItemBySession(workIndex.items, s.id)))
        : [],
    [sessions, workIndex]
  );
  const settledBytes = settled.reduce((n, s) => n + s.sizeBytes + s.sidecarBytes, 0);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sessions
      .filter((s) => project === "all" || projectLocation(s.cwd).repo === project)
      .filter((s) =>
        view === "stale"
          ? isStale(s, staleDays)
          : view === "settled"
            ? settled.some((x) => x.id === s.id)
            : true
      )
      .filter(
        (s) =>
          !q ||
          s.title.toLowerCase().includes(q) ||
          s.id.includes(q) ||
          s.cwd.toLowerCase().includes(q) ||
          (s.gitBranch ?? "").toLowerCase().includes(q)
      )
      .sort((a, b) => {
        // 久沒用那頁把最舊的擺前面：要清的東西從那頭開始看最自然
        if (view === "stale" || view === "settled") {
          // 要清東西時從最舊的看起最自然
          return a.modifiedAt < b.modifiedAt ? -1 : 1;
        }
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return a.modifiedAt < b.modifiedAt ? 1 : -1;
      });
  }, [sessions, project, query, view, staleDays, settled]);

  // 切換分頁時清掉選取：看不到卻還被勾著的東西，按下刪除會一起消失
  useEffect(() => { setSelected(new Set()); }, [view]);

  const selectable = visible.filter((s) => !s.pinned);
  const totalBytes = sessions.reduce((n, s) => n + s.sizeBytes + s.sidecarBytes, 0);
  const selectedBytes = visible
    .filter((s) => selected.has(s.id))
    .reduce((n, s) => n + s.sizeBytes + s.sidecarBytes, 0);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allVisibleSelected =
    selectable.length > 0 && selectable.every((s) => selected.has(s.id));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) selectable.forEach((s) => next.delete(s.id));
      else selectable.forEach((s) => next.add(s.id));
      return next;
    });
  };

  const hub = useHubStatus();
  const togglePin = async (s: SessionInfo) => {
    setSessions((prev) =>
      prev.map((x) => (x.id === s.id ? { ...x, pinned: !x.pinned } : x))
    );
    if (!s.pinned) setSelected((prev) => {
      const next = new Set(prev);
      next.delete(s.id); // pin 起來就不該還被勾著等刪
      return next;
    });
    const res = await fetch("/api/sessions/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, pinned: !s.pinned }),
    });
    if (!res.ok) {
      setError("pin 失敗");
      load();
    }
  };

  const removeSelected = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    const ok = await confirm({
      title: `刪除 ${ids.length} 個 session？`,
      message: `共 ${mb(selectedBytes)}，連同 sidecar 目錄一起刪掉，無法復原。`,
      confirmLabel: "刪除",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/sessions/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    const json = await res.json();
    if (!res.ok) setError(json.error ?? "刪除失敗");
    else setResults(json.results);
    setSelected(new Set());
    setBusy(false);
    load();
  };

  /** 單筆刪除。pin 住的擋在前面，跟批次那條走同一個 API。 */
  const removeOne = async (s: SessionInfo) => {
    const ok = await confirm({
      title: "刪除這個 session？",
      message: `${s.title}\n${mb(s.sizeBytes + s.sidecarBytes)}，連同 sidecar 目錄一起刪掉，無法復原。`,
      confirmLabel: "刪除",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/sessions/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [s.id] }),
    });
    const json = await res.json();
    if (!res.ok) setError(json.error ?? "刪除失敗");
    else setResults(json.results);
    if (openId === s.id) setOpenId(null); // 面板正開著這一筆的話一起收掉
    setBusy(false);
    load();
  };

  /**
   * 在 Orca 開啟（resume）這個 session。
   *
   * repo 沒註冊時**不自作主張** —— 那會改到 Orca 的設定，回來問過再送一次。
   */
  const openInOrca = async (s: SessionInfo, registerRepo = false) => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/sessions/${s.id}/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // 別台的 session 要告訴 server 是哪一台，它才知道要轉給誰
      body: JSON.stringify({ registerRepo, machineId: s.machine?.id }),
    });
    const out = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setError(out.error ?? "開啟失敗");
      return;
    }

    switch (out.status) {
      // 開在別台時一定要講出是哪一台 —— 不然你會盯著自己的螢幕等一個不會出現的分頁
      case "opened":
        setOpened((p) => ({ ...p, [s.id]: out.openedOn ? `已在「${out.openedOn}」的 Orca 開啟` : "已在 Orca 開啟" }));
        break;
      case "reused":
        setOpened((p) => ({ ...p, [s.id]: out.openedOn ? `已切到「${out.openedOn}」的既有分頁` : "已切到既有分頁" }));
        break;
      case "needs-repo": {
        const ok = await confirm({
          title: "這個路徑還沒註冊到 Orca",
          message: `${out.repoPath}\n要把它加進 Orca（repo add）再開啟嗎？這會改到 Orca 的設定。`,
          confirmLabel: "註冊並開啟",
        });
        if (ok) await openInOrca(s, true);
        break;
      }
      case "external":
        setError(
          `已經有一個 claude 正在 resume 這個 session（pid ${out.pid}）——` +
          `再開一個會有兩份同時寫同一份紀錄，所以沒有開。`
        );
        break;
      case "orca-down":
        setError("Orca 沒有起來，也叫不動它。手動開一次 Orca 再試。");
        break;
      default:
        setError(out.error ?? "開啟失敗");
    }
  };

  const failed = results?.filter((r) => !r.ok) ?? [];

  /**
   * 畫面上這幾張單的 Jira 狀態。**只問看得到的那幾把 key** ——
   * `/api/my-tickets` 回的是整份快照（783 張、400 KB），這裡只要十幾個字串。
   */
  const [ticketStatus, setTicketStatus] = useState<Record<string, string>>({});
  const ticketKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const s of visible) {
      const k = parseSessionTitle(s.title).ticketKey;
      if (k) keys.add(k);
    }
    return [...keys].sort().join(",");
  }, [visible]);

  useEffect(() => {
    if (!ticketKeys) return;
    fetch(`/api/my-tickets/status?keys=${encodeURIComponent(ticketKeys)}`)
      .then((r) => r.json())
      .then((d: { statuses?: Record<string, string> }) => setTicketStatus(d.statuses ?? {}))
      .catch(() => undefined);
  }, [ticketKeys]);

  const openSession = sessions.find((s) => s.id === openId) ?? null;

  return (
    <div className="min-h-0 flex-1">
      <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-fg">Claude Sessions</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
              本機 <code className="text-xs">~/.claude/projects</code> 底下的 session 記錄。
              目前 {sessions.length} 個、共 {mb(totalBytes)}。
              pin 住的 session 不能被刪。
            </p>
          </div>
          <button
            onClick={load}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-fg hover:bg-surface-raised"
          >
            <Icon name="refresh" size={15} className={loading ? "animate-spin" : ""} /> 重新掃描
          </button>
        </div>

        {error && (
          <div className="mt-6 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger-bg px-4 py-3 text-sm text-danger">
            <Icon name="alert" size={16} className="mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {results && (
          <div className="mt-6 rounded-lg border border-line bg-surface-raised px-4 py-3 text-sm">
            <div className="flex items-center gap-2 text-fg">
              <Icon name="check" size={16} className="text-ok" />
              已刪除 {results.filter((r) => r.ok).length} 個，釋放{" "}
              {mb(results.reduce((n, r) => n + r.freedBytes, 0))}
              <button onClick={() => setResults(null)} className="ml-auto text-fg-subtle hover:text-fg">
                <Icon name="x" size={15} />
              </button>
            </div>
            {failed.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-danger">
                {failed.map((r) => (
                  <li key={r.id}>
                    <span className="font-mono">{r.id.slice(0, 8)}</span>：{r.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* 篩選 */}
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[11rem]">
            <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜尋標題／id／分支"
              className="w-full rounded-lg border border-line-strong py-2 pl-9 pr-3 text-sm text-fg placeholder:text-fg-muted focus:border-line-strong focus:outline-none"
            />
          </div>
          <select
            value={project}
            onChange={(e) => setProject(e.target.value)}
            className="max-w-xs rounded-lg border border-line-strong px-3 py-2 text-sm text-fg"
          >
            <option value="all">全部專案（{sessions.length}）</option>
            {projects.map((p) => (
              <option key={p.repo} value={p.repo}>
                {p.repo}（{p.n}）
                {/* 同一個 repo 有多個位置時列出來，才知道這些 session 散在哪 */}
                {p.labels.length > 1 ? `　${p.labels.join("、")}` : ""}
              </option>
            ))}
          </select>
          <div className="inline-flex overflow-hidden rounded-lg border border-line-strong text-sm">
            {([
              ["all", `全部（${sessions.length}）`],
              ["stale", `久沒用（${stale.length}）`],
              ["settled", `已收尾（${settled.length}）`],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={`min-w-[6.5rem] px-3 py-2 text-center ${
                  view === key
                    ? "bg-control text-on-solid"
                    : "bg-surface text-fg-muted hover:bg-surface-raised"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

        </div>

        {/* 操作列 */}
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-surface-raised px-4 py-2.5 text-sm">
          <label className="inline-flex items-center gap-2 text-fg">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleAll}
              disabled={selectable.length === 0}
            />
            全選（{selectable.length} 個可刪）
          </label>
          <span className="text-fg-subtle">
            已選 {selected.size} 個{selected.size > 0 ? ` · ${mb(selectedBytes)}` : ""}
          </span>
          <button
            onClick={removeSelected}
            disabled={selected.size === 0 || busy}
            className={`ml-auto inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium ${
              selected.size === 0 || busy
                ? "cursor-not-allowed bg-surface-sunken text-fg-subtle"
                : "bg-danger text-on-solid hover:bg-danger"
            }`}
          >
            <Icon name={busy ? "spinner" : "trash"} size={15} className={busy ? "animate-spin" : ""} />
            刪除選取
          </button>
        </div>

        {view === "stale" && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-warn/40 bg-warn-bg px-4 py-2.5 text-xs text-warn">
            <label className="inline-flex items-center gap-1.5">
              超過
              <select
                value={staleDays}
                onChange={(e) => setStaleDays(Number(e.target.value))}
                className="rounded-md border border-warn/40 bg-surface px-2 py-1 text-xs text-fg"
              >
                {[30, 60, 90, 180].map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              天沒動過、且沒有 pin 住的
            </label>
            <span>共 {stale.length} 個、{mb(staleBytes)}</span>
            <span className="text-warn/80">
              只是幫你挑出來，不會自動刪；要留的先 pin 起來再全選
            </span>
          </div>
        )}

        {/* 已收尾：對應的 PR 全部 merged／closed。用中性灰底，因為這不是警告 */}
        {view === "settled" && (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-line bg-surface-raised px-4 py-2.5 text-xs text-fg-muted">
            <span className="font-medium text-fg">
              對應的 PR 都已經 merged 或 closed 的 session
            </span>
            <span>共 {settled.length} 個、{mb(settledBytes)}</span>
            <span className="text-fg-muted">
              沒有 PR 的不算在內（可能是還沒送出的調查）；要留的先 pin 起來
            </span>
          </div>
        )}

        {/* 清單 */}
        {loading ? (
          <p className="mt-6 text-sm text-fg-subtle">掃描中…</p>
        ) : visible.length === 0 ? (
          <p className="mt-6 rounded-xl border border-line px-5 py-6 text-sm text-fg-subtle">
            沒有符合條件的 session
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
            {visible.map((s) => (
              <li
                key={s.id}
                className={`flex items-start gap-3 px-4 py-3 ${
                  openId === s.id
                    ? "bg-surface-selected"
                    : selected.has(s.id)
                      ? "bg-danger-bg/40"
                      : s.pinned
                        ? "bg-surface-raised"
                        : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(s.id)}
                  onChange={() => toggle(s.id)}
                  disabled={s.pinned || !!s.remote}
                  title={
                    s.remote
                      ? `在「${s.machine?.name}」上，要到那台才能刪`
                      : s.pinned
                        ? "pin 住的不能刪，先取消 pin"
                        : undefined
                  }
                  className="mt-1"
                />

                <Tooltip label={s.pinned ? "取消 pin" : "pin 住（防止被刪）"}>
                  <button
                    onClick={() => togglePin(s)}
                    disabled={hub.blocked || !!s.remote}
                    title={
                      s.remote ? `在「${s.machine?.name}」上，要到那台才能 pin` : hub.reason || undefined
                    }
                    className={`mt-0.5 ${s.pinned ? "text-pin" : "text-fg-disabled hover:text-pin"}`}
                  >
                    <Icon name="pin" size={16} />
                  </button>
                </Tooltip>

                <button
                  onClick={() => setOpenId(openId === s.id ? null : s.id)}
                  title="看這個 session 的對話紀錄"
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-sm text-fg hover:underline">{s.title}</span>
                    {/*
                      * 別台機器的 session 一定要標出來：它的 transcript 與 Orca 都在那一台，
                      * 刪除與開啟在這裡做不到。沒有這個標記的話，使用者會以為按鈕壞了。
                      */}
                    {s.remote && s.machine && (
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${
                          s.machineStale ? "bg-warn-bg text-warn" : "bg-surface-sunken text-fg-muted"
                        }`}
                        title={
                          s.machineLastSeenAt
                            ? `上次心跳 ${new Date(s.machineLastSeenAt).toLocaleString("zh-TW")}`
                            : undefined
                        }
                      >
                        {s.machine.name}
                        {s.machineStale ? "（離線）" : ""}
                      </span>
                    )}
                    {s.titleSource !== "custom" && (
                      <span className="shrink-0 text-[11px] text-fg-subtle">
                        {SOURCE_LABEL[s.titleSource]}
                      </span>
                    )}
                  </div>
                  {/*
                    * session id 不顯示（Jay 2026-09-23）：那串 uuid 前八碼沒有人在讀，
                    * 要用的時候是複製整串，而那在下面的面板裡。
                    *
                    * repo 與分支**只在不是日常的那組時顯示**（km 主 checkout ＋ master）——
                    * 幾乎每一列都一樣的話，它就不是資訊，只是佔位置。
                    */}
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-subtle">
                    {!isDefaultWorkContext(s.cwd, s.gitBranch) && (
                      <>
                        <span>{projectLocation(s.cwd).label}</span>
                        {s.gitBranch && (
                          <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-fg-muted">
                            {s.gitBranch}
                          </span>
                        )}
                      </>
                    )}
                    {s.version && <span>v{s.version}</span>}
                    {s.hasSidecar && <span>sidecar {mb(s.sidecarBytes)}</span>}
                    {opened[s.id] && <span className="text-accent">{opened[s.id]}</span>}
                  </div>
                </button>

                {/* 關聯。放在按鈕外面 —— 連結不能巢狀在按鈕裡。
                    ticket 由標題解析（猜的會標問號）；PR 用關聯索引裡的真實資料，
                    所以帶得出狀態。索引有 PR 時就不畫標題解析出來的那顆，免得重複。 */}
                {(() => {
                  const item = workIndex
                    ? findItemBySession(workIndex.items, s.id)
                    : undefined;
                  const prs = item?.prs ?? [];
                  return (
                    <span className="flex shrink-0 items-center gap-1">
                      {/* 有掛到工作項目才給「這條線的改動」——那頁是靠 key 查的，
                          沒掛上的 session 點進去只會看到錯誤訊息 */}
                      {item && (
                        <Tooltip side="left" label={`看這條線總共改了什麼（跨 repo，commit ＋ 還沒 commit 的）`}>
                          <a
                            href={`/work?key=${encodeURIComponent(item.key)}`}
                            className="inline-flex items-center rounded-full border border-line px-1.5 py-0.5 text-[11px] leading-none text-fg-muted hover:bg-surface-raised hover:text-fg"
                          >
                            <Icon name="layers" size={10} />
                          </a>
                        </Tooltip>
                      )}
                      <WorkRefChips
                        refs={parseSessionTitle(s.title)}
                        showPr={prs.length === 0}
                        ticketStatus={
                          ticketStatus[parseSessionTitle(s.title).ticketKey ?? ""] ?? undefined
                        }
                      />
                      {prs.map((pr) => {
                        const st = prStateStyle(pr.state);
                        const decision = prDecisionLabel(pr);
                        return (
                          <Tooltip
                            key={pr.url}
                            side="left"
                            label={`${pr.repo}#${pr.number} · ${st.label}${decision ? ` · ${decision}` : ""}\n${pr.title}`}
                          >
                            <a
                              href={pr.url}
                              target="_blank"
                              rel="noreferrer"
                              className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] leading-none ${st.cls}`}
                            >
                              <Icon name="gitPr" size={10} />
                              {pr.number}
                              <span className="opacity-70">{decision ?? st.label}</span>
                            </a>
                          </Tooltip>
                        );
                      })}
                    </span>
                  );
                })()}

                <div className="shrink-0 text-right">
                  <div className="text-sm text-fg">{mb(s.sizeBytes + s.sidecarBytes)}</div>
                  <div className="text-[11px] text-fg-subtle">{relTime(s.modifiedAt)}</div>
                </div>

                <Tooltip label="在 Orca 開一個終端，resume 這個 session" side="left">
                  <button
                    onClick={() => openInOrca(s)}
                    disabled={busy}
                    className="mt-0.5 shrink-0 text-fg-disabled hover:text-accent disabled:opacity-40"
                  >
                    <Icon name="external" size={15} />
                  </button>
                </Tooltip>

                <Tooltip
                  label={s.pinned ? "pin 住的不能刪，先取消 pin" : "刪除這個 session（連 sidecar）"}
                  side="left"
                >
                  <button
                    onClick={() => removeOne(s)}
                    disabled={s.pinned || busy}
                    className={`mt-0.5 shrink-0 ${
                      s.pinned
                        ? "cursor-not-allowed text-fg-disabled"
                        : "text-fg-disabled hover:text-danger"
                    }`}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </Tooltip>
              </li>
            ))}
          </ul>
        )}
      </div>
      </div>

      {openSession && (
        <TranscriptPanel
          key={openSession.id}
          sessionId={openSession.id}
          title={openSession.title}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}
