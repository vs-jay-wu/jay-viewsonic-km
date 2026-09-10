"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";

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
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<DeleteResult[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/sessions");
    const json = await res.json();
    if (!res.ok) setError(json.error ?? "讀取失敗");
    else setSessions(json.sessions);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const projects = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sessions) m.set(s.cwd, (m.get(s.cwd) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [sessions]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sessions
      .filter((s) => project === "all" || s.cwd === project)
      .filter((s) => !pinnedOnly || s.pinned)
      .filter(
        (s) =>
          !q ||
          s.title.toLowerCase().includes(q) ||
          s.id.includes(q) ||
          s.cwd.toLowerCase().includes(q) ||
          (s.gitBranch ?? "").toLowerCase().includes(q)
      )
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return a.modifiedAt < b.modifiedAt ? 1 : -1;
      });
  }, [sessions, project, query, pinnedOnly]);

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
    if (!confirm(`確定刪除 ${ids.length} 個 session？共 ${mb(selectedBytes)}，無法復原。`)) return;
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

  const failed = results?.filter((r) => !r.ok) ?? [];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-8 py-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Claude Sessions</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
              本機 <code className="text-xs">~/.claude/projects</code> 底下的 session 記錄。
              目前 {sessions.length} 個、共 {mb(totalBytes)}。
              pin 住的 session 不能被刪 —— pin 在這裡就是「別動它」的意思。
            </p>
          </div>
          <button
            onClick={load}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Icon name="refresh" size={15} className={loading ? "animate-spin" : ""} /> 重新掃描
          </button>
        </div>

        {error && (
          <div className="mt-6 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <Icon name="alert" size={16} className="mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {results && (
          <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
            <div className="flex items-center gap-2 text-gray-800">
              <Icon name="check" size={16} className="text-emerald-600" />
              已刪除 {results.filter((r) => r.ok).length} 個，釋放{" "}
              {mb(results.reduce((n, r) => n + r.freedBytes, 0))}
              <button onClick={() => setResults(null)} className="ml-auto text-gray-400 hover:text-gray-700">
                <Icon name="x" size={15} />
              </button>
            </div>
            {failed.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-red-700">
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
            <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜尋標題／id／分支"
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-500 focus:border-gray-500 focus:outline-none"
            />
          </div>
          <select
            value={project}
            onChange={(e) => setProject(e.target.value)}
            className="max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800"
          >
            <option value="all">全部專案（{sessions.length}）</option>
            {projects.map(([cwd, n]) => (
              <option key={cwd} value={cwd}>
                {cwd.split("/").slice(-1)[0]}（{n}）
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={pinnedOnly} onChange={(e) => setPinnedOnly(e.target.checked)} />
            只看 pin 住的
          </label>
        </div>

        {/* 操作列 */}
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-gray-50 px-4 py-2.5 text-sm">
          <label className="inline-flex items-center gap-2 text-gray-700">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleAll}
              disabled={selectable.length === 0}
            />
            全選（{selectable.length} 個可刪）
          </label>
          <span className="text-gray-400">
            已選 {selected.size} 個{selected.size > 0 ? ` · ${mb(selectedBytes)}` : ""}
          </span>
          <button
            onClick={removeSelected}
            disabled={selected.size === 0 || busy}
            className={`ml-auto inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium ${
              selected.size === 0 || busy
                ? "cursor-not-allowed bg-gray-200 text-gray-400"
                : "bg-red-600 text-white hover:bg-red-700"
            }`}
          >
            <Icon name={busy ? "spinner" : "trash"} size={15} className={busy ? "animate-spin" : ""} />
            刪除選取
          </button>
        </div>

        {/* 清單 */}
        {loading ? (
          <p className="mt-6 text-sm text-gray-400">掃描中…</p>
        ) : visible.length === 0 ? (
          <p className="mt-6 rounded-xl border border-gray-200 px-5 py-6 text-sm text-gray-400">
            沒有符合條件的 session
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200">
            {visible.map((s) => (
              <li
                key={s.id}
                className={`flex items-start gap-3 px-4 py-3 ${
                  selected.has(s.id) ? "bg-red-50/40" : s.pinned ? "bg-amber-50/40" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(s.id)}
                  onChange={() => toggle(s.id)}
                  disabled={s.pinned}
                  title={s.pinned ? "pin 住的不能刪，先取消 pin" : undefined}
                  className="mt-1"
                />

                <button
                  onClick={() => togglePin(s)}
                  title={s.pinned ? "取消 pin" : "pin 住（防止被刪）"}
                  className={`mt-0.5 ${s.pinned ? "text-amber-500" : "text-gray-300 hover:text-amber-500"}`}
                >
                  <Icon name="pin" size={16} />
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-sm text-gray-900">{s.title}</span>
                    {s.titleSource !== "custom" && (
                      <span className="shrink-0 text-[11px] text-gray-400">
                        {SOURCE_LABEL[s.titleSource]}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400">
                    <span className="font-mono">{s.id.slice(0, 8)}</span>
                    <span>{s.cwd.split("/").slice(-2).join("/")}</span>
                    {s.gitBranch && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-500">{s.gitBranch}</span>
                    )}
                    {s.version && <span>v{s.version}</span>}
                    {s.hasSidecar && <span>sidecar {mb(s.sidecarBytes)}</span>}
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="text-sm text-gray-700">{mb(s.sizeBytes + s.sidecarBytes)}</div>
                  <div className="text-[11px] text-gray-400">{relTime(s.modifiedAt)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
