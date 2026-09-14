"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import Tooltip from "@/components/Tooltip";
import DiffView from "@/components/DiffView";
import { hljsHref, type DiffTheme } from "@/lib/uiSettingsRules";
import {
  KIND_CLS, KIND_LABEL, KIND_TITLE, countByKind,
  type ChangedFile, type DiffLine, type RepoChanges,
} from "@/lib/changesRules";

interface Snapshot {
  scannedAt: string;
  scanned: number;
  repos: RepoChanges[];
  ignored: string[];
  ignoredChanges: number;
  skippedOffloaded: number;
}

interface Selected {
  worktree: string;
  worktreeName: string;
  repo: string;
  file: ChangedFile;
}

interface DiffPayload {
  lines: DiffLine[];
  truncated: boolean;
  binary: boolean;
  error?: string;
}

export default function ChangesPage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModeOnly, setShowModeOnly] = useState(false);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [diff, setDiff] = useState<DiffPayload | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diffTheme, setDiffTheme] = useState<DiffTheme>("dark");
  /** 收起來的 repo 與 worktree（key 用 repo 名／worktree 絕對路徑）。
   *  存 localStorage —— 純畫面偏好，不值得上 server，但要撐過重新整理 */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem("km.changes.collapsed");
      if (raw) setCollapsed(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* 讀不到就當全部展開 */
    }
  }, []);

  const toggleCollapsed = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem("km.changes.collapsed", JSON.stringify([...next]));
      } catch {
        /* 存不了就算了，下次重新整理回到全展開 */
      }
      return next;
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/changes", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) setError(json.error ?? "掃描失敗");
      else setData(json as Snapshot);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // diff 的配色在 `/settings` 改。樣式表用 <link> 動態換 —— highlight.js 的主題是
  // 整份全域 CSS，靜態 import 兩份會互相蓋掉，沒辦法在執行期切換
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s: { diffTheme?: DiffTheme }) => setDiffTheme(s.diffTheme === "light" ? "light" : "dark"))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const id = "hljs-theme";
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = hljsHref(diffTheme);
  }, [diffTheme]);

  // 切回這個分頁時重掃 —— 你剛在終端改完東西回來看，要看到的是現在的狀態
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [load]);

  const openFile = async (sel: Selected) => {
    setSelected(sel);
    setDiff(null);
    setDiffLoading(true);
    try {
      const qs = new URLSearchParams({
        worktree: sel.worktree,
        file: sel.file.path,
        untracked: sel.file.kind === "untracked" ? "1" : "0",
      });
      const res = await fetch(`/api/changes/diff?${qs}`);
      const json = await res.json();
      setDiff(res.ok ? json : { lines: [], truncated: false, binary: false, error: json.error });
    } catch (e) {
      setDiff({ lines: [], truncated: false, binary: false, error: (e as Error).message });
    } finally {
      setDiffLoading(false);
    }
  };

  const toggleIgnore = async (repo: string) => {
    await fetch("/api/changes/ignore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo }),
    });
    await load();
  };

  const repos = useMemo(() => {
    if (!data) return [];
    // 未追蹤的一律顯示（Jay 2026-09-14）。只改模式的才預設藏起來 ——
    // 那是整個 repo 被 chmod 過的產物，會把真正的改動洗掉
    const keep = (f: ChangedFile) => showModeOnly || !f.modeOnly;
    return data.repos
      .map((r) => {
        const worktrees = r.worktrees
          .map((w) => ({ ...w, files: w.files.filter(keep) }))
          .filter((w) => w.files.length > 0);
        return { ...r, worktrees, total: worktrees.reduce((n, w) => n + w.files.length, 0) };
      })
      .filter((r) => r.total > 0);
  }, [data, showModeOnly]);

  const totalFiles = repos.reduce((n, r) => n + r.total, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-gray-200 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Icon name="code" size={18} className="text-gray-400" />
            未提交的改動
          </h1>
          <span className="text-xs text-gray-400">
            {loading
              ? "掃描中…"
              : data
                ? `${repos.length} 個 repo · ${totalFiles} 個檔案 · 掃了 ${data.scanned} 個工作區` +
                  (data.skippedOffloaded > 0 ? `（offloaded 的 ${data.skippedOffloaded} 個沒掃）` : "")
                : ""}
          </span>
          <Tooltip label="只有檔案模式變了（100644 → 100755），內容沒改">
            <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={showModeOnly}
                onChange={(e) => setShowModeOnly(e.target.checked)}
              />
              含只改模式
            </label>
          </Tooltip>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            重新掃描
          </button>
        </div>
        <div className="mt-1 h-4 text-xs">
          {error ? (
            <span className="text-red-600">{error}</span>
          ) : data && data.ignoredChanges > 0 ? (
            <span className="text-gray-400">
              已忽略 {data.ignored.join("、")}（{data.ignoredChanges} 個改動沒列出來）
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* 清單。選了檔案之後窄螢幕就讓位給 diff */}
        <div
          className={`min-h-0 overflow-y-auto border-gray-200 lg:w-96 lg:shrink-0 lg:border-r ${
            selected ? "hidden lg:block" : "flex-1"
          }`}
        >
          {!loading && repos.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-gray-400">
              沒有未提交的改動。
            </p>
          )}
          {repos.map((r) => (
            <div key={r.repo} className="border-b border-gray-100">
              <div className="flex items-center gap-2 bg-gray-50 px-4 py-2">
                <button
                  onClick={() => toggleCollapsed(r.repo)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <Icon
                    name={collapsed.has(r.repo) ? "chevronRight" : "chevronDown"}
                    size={13}
                    className="shrink-0 text-gray-400"
                  />
                  <span className="truncate font-mono text-xs font-medium text-gray-900">{r.repo}</span>
                  <span className="text-[11px] text-gray-400">{r.total}</span>
                </button>
                <Tooltip side="left" label="忽略這個 repo（通常是產物或別人的 WIP）">
                  <button
                    onClick={() => toggleIgnore(r.repo)}
                    className="shrink-0 text-gray-300 hover:text-gray-700"
                  >
                    <Icon name="x" size={13} />
                  </button>
                </Tooltip>
              </div>

              {!collapsed.has(r.repo) && r.worktrees.map((w) => {
                const counts = countByKind(w.files);
                const wOpen = !collapsed.has(w.path);
                return (
                  <div key={w.path}>
                    <button
                      onClick={() => toggleCollapsed(w.path)}
                      className="flex w-full flex-wrap items-center gap-1.5 px-4 py-1.5 text-left text-[11px] hover:bg-gray-50"
                    >
                      <Icon
                        name={wOpen ? "chevronDown" : "chevronRight"}
                        size={11}
                        className="shrink-0 text-gray-300"
                      />
                      {!w.isMain && (
                        <span
                          className={`rounded-full border px-1.5 py-0.5 leading-none ${
                            w.isSessionBound
                              ? "border-violet-200 bg-violet-50 text-violet-700"
                              : "border-gray-200 bg-white text-gray-500"
                          }`}
                          title={
                            w.isSessionBound
                              ? "session 綁的 worktree —— session 結束可能整個消失"
                              : "另一個 worktree"
                          }
                        >
                          {w.isSessionBound ? "session worktree" : "worktree"}
                        </span>
                      )}
                      <span className="truncate text-gray-500">{w.name}</span>
                      {w.branch && (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-gray-600">
                          {w.branch}
                        </span>
                      )}
                      <span className="font-mono text-gray-300">
                        {counts.modified > 0 && `M${counts.modified} `}
                        {counts.added > 0 && `A${counts.added} `}
                        {counts.deleted > 0 && `D${counts.deleted} `}
                        {counts.renamed > 0 && `R${counts.renamed} `}
                        {counts.untracked > 0 && `U${counts.untracked} `}
                        {counts.conflict > 0 && `C${counts.conflict}`}
                      </span>
                    </button>

                    <ul className={wOpen ? "" : "hidden"}>
                      {w.files.map((f) => {
                        const on = selected?.worktree === w.path && selected.file.path === f.path;
                        return (
                          <li key={f.path}>
                            <button
                              onClick={() =>
                                openFile({ worktree: w.path, worktreeName: w.name, repo: r.repo, file: f })
                              }
                              className={`flex w-full items-center gap-2 px-4 py-1 text-left text-xs hover:bg-gray-50 ${
                                on ? "bg-sky-50" : ""
                              }`}
                            >
                              <span
                                className={`w-3 shrink-0 text-center font-mono text-[11px] font-semibold ${KIND_CLS[f.kind]}`}
                                title={KIND_TITLE[f.kind]}
                              >
                                {KIND_LABEL[f.kind]}
                              </span>
                              {/* 目錄截斷、檔名永遠看得到。**不要用 dir="rtl" 截斷**——
                                  它會把開頭的標點吃掉，`.claude/...` 會顯示成 `claude/...` */}
                              <span className="flex min-w-0 flex-1 items-baseline font-mono">
                                <span className="truncate text-gray-400">
                                  {f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/") + 1) : ""}
                                </span>
                                <span className="shrink-0 text-gray-700">
                                  {f.path.split("/").pop()}
                                </span>
                              </span>
                              {f.modeOnly && (
                                <span className="shrink-0 text-[10px] text-gray-300">模式</span>
                              )}
                              {f.staged && (
                                <span className="shrink-0 text-[10px] text-emerald-600">staged</span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* diff */}
        <div className={`min-h-0 flex-1 overflow-y-auto ${selected ? "" : "hidden lg:block"}`}>
          {!selected ? (
            <p className="px-6 py-10 text-sm text-gray-400">選一個檔案看 diff。</p>
          ) : (
            <>
              <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-2">
                <button
                  onClick={() => setSelected(null)}
                  className="text-gray-400 hover:text-gray-800 lg:hidden"
                  aria-label="回到清單"
                >
                  <Icon name="chevronRight" size={16} className="rotate-180" />
                </button>
                <span className="font-mono text-xs text-gray-500">{selected.repo}</span>
                {selected.worktreeName !== selected.repo && (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">
                    {selected.worktreeName}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-gray-900">
                  {selected.file.path}
                </span>
                <span
                  className={`shrink-0 font-mono text-xs font-semibold ${KIND_CLS[selected.file.kind]}`}
                  title={KIND_TITLE[selected.file.kind]}
                >
                  {KIND_LABEL[selected.file.kind]}
                </span>
              </div>

              {diffLoading ? (
                <p className="px-4 py-6 text-sm text-gray-400">讀取中…</p>
              ) : diff?.error ? (
                <p className="px-4 py-6 text-sm text-red-600">{diff.error}</p>
              ) : diff?.binary ? (
                <p className="px-4 py-6 text-sm text-gray-400">二進位檔，不顯示內容。</p>
              ) : diff ? (
                <DiffView
                  lines={diff.lines}
                  file={selected.file.path}
                  truncated={diff.truncated}
                  theme={diffTheme}
                />
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
