"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import Tooltip from "@/components/Tooltip";
import WorktreeBadge from "@/components/WorktreeBadge";
import DiffView from "@/components/DiffView";
import ImageDiffView from "@/components/ImageDiffView";
import { FileRow, TreeRows, ViewToggle, useFileView } from "@/components/FileList";
import { hljsHref, type DiffTheme } from "@/lib/uiSettingsRules";
import { buildTree, type ChangedFile, type DiffLine } from "@/lib/changesRules";
import { REASON_LABEL, fileOrigin, type LineBranch, type WorkChanges } from "@/lib/workChangesRules";
import { ticketUrl } from "@/lib/workItemRules";
import type { ImageSides } from "@/lib/changes";

/**
 * 「這條線的改動」—— 一張票（或一個 PR）橫跨各 repo 的全部改動。
 *
 * 跟「未提交的改動」的分工：那頁是**整台機器現在髒了什麼**，這頁是
 * **這件事總共改了什麼**（commit 過的＋還沒 commit 的，跨 repo）。
 *
 * 預設看「整體」= `merge-base → 工作區`，也就是這條線最後會變成的 PR 內容；
 * 逐 commit 是展開後的細節，不是預設（同一個檔案在 commit 與工作區都改過時，
 * 分段看會出現兩次，整體只會出現一次）。
 *
 * **Claude session 是經由工作項目連過來的**，不是直接關聯：commit 帶
 * `Claude-Session:` trailer 才是精確的（畫成實心點），其餘靠票號／分支推。
 * 未提交的改動則**完全無法**歸屬到某個 session —— 那是分支現在的狀態。
 */

interface DiffPayload {
  lines: DiffLine[];
  truncated: boolean;
  binary: boolean;
  image?: ImageSides;
  error?: string;
}

interface Selected {
  branch: LineBranch;
  file: ChangedFile;
  /** 看的是整體（merge-base → 工作區）還是某一個 commit */
  sha: string | null;
}

type Mode = "overall" | "commits";

export default function WorkPage() {
  return (
    <Suspense fallback={<p className="px-6 py-10 text-sm text-fg-subtle">載入中…</p>}>
      <WorkChangesView />
    </Suspense>
  );
}

function WorkChangesView() {
  const [data, setData] = useState<WorkChanges | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("overall");
  const [selected, setSelected] = useState<Selected | null>(null);
  const [diff, setDiff] = useState<DiffPayload | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffTheme, setDiffTheme] = useState<DiffTheme>("dark");
  const [openCommit, setOpenCommit] = useState<string | null>(null);
  const [commitFiles, setCommitFiles] = useState<Record<string, ChangedFile[]>>({});
  const [showCandidates, setShowCandidates] = useState(false);
  /** 平鋪／樹狀。跟「未提交的改動」共用同一個偏好 */
  const [view, switchView] = useFileView();
  /** 樹狀時收起來的目錄（key 是 `<worktree 或 sha>:<目錄>`） */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapsed = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const query = useMemo(() => {
    if (typeof window === "undefined") return "";
    const q = new URLSearchParams(window.location.search);
    const key = q.get("key");
    const session = q.get("session");
    return key ? `key=${encodeURIComponent(key)}` : session ? `session=${encodeURIComponent(session)}` : "";
  }, []);

  const load = useCallback(async () => {
    if (!query) {
      setError("要帶 ?key=<票號> 或 ?session=<session id>");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/work-changes?${query}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) setError(json.error ?? "讀取失敗");
      else {
        setData(json as WorkChanges);
        setError(null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { void load(); }, [load]);

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

  const openFile = async (sel: Selected) => {
    setSelected(sel);
    setDiff(null);
    setDiffLoading(true);
    try {
      const qs = new URLSearchParams({
        worktree: sel.branch.worktree,
        file: sel.file.path,
        from: sel.file.from ?? "",
      });
      if (sel.sha) qs.set("sha", sel.sha);
      else if (sel.file.kind === "untracked") qs.set("untracked", "1");
      // 整體檢視的「舊的那一側」是 merge-base，不是 HEAD
      else if (sel.branch.mergeBase) qs.set("base", sel.branch.mergeBase);
      const res = await fetch(`/api/changes/diff?${qs}`);
      const json = await res.json();
      setDiff(res.ok ? json : { lines: [], truncated: false, binary: false, error: json.error });
    } catch (e) {
      setDiff({ lines: [], truncated: false, binary: false, error: (e as Error).message });
    } finally {
      setDiffLoading(false);
    }
  };

  const loadCommitFiles = async (branch: LineBranch, sha: string) => {
    setOpenCommit((cur) => (cur === sha ? null : sha));
    if (commitFiles[sha]) return;
    const qs = new URLSearchParams({ worktree: branch.worktree, sha });
    const res = await fetch(`/api/work-changes/commit?${qs}`);
    const json = await res.json();
    if (res.ok) setCommitFiles((m) => ({ ...m, [sha]: json.files as ChangedFile[] }));
  };

  const addManual = async (worktree: string) => {
    if (!data) return;
    await fetch("/api/work-changes/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: data.key, worktree }),
    });
    await load();
  };

  /** 一份檔案清單，照目前的檢視畫成平鋪或樹狀 */
  const renderFiles = <T extends ChangedFile>(
    files: T[],
    keyPrefix: string,
    selectedPath: string | null,
    onOpen: (f: T) => void,
    extras?: (f: T) => { leading?: React.ReactNode; trailing?: React.ReactNode },
    depth = 0
  ) =>
    view === "list" ? (
      files.map((f) => (
        <FileRow
          key={f.path}
          file={f}
          label="path"
          depth={depth}
          selected={selectedPath === f.path}
          onOpen={() => onOpen(f)}
          {...extras?.(f)}
        />
      ))
    ) : (
      <TreeRows
        nodes={buildTree(files)}
        depth={depth}
        keyPrefix={keyPrefix}
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        selectedPath={selectedPath}
        onOpen={onOpen}
        extras={extras}
      />
    );

  const totals = useMemo(() => {
    const b = data?.branches ?? [];
    return {
      repos: new Set(b.map((x) => x.repo)).size,
      commits: b.reduce((n, x) => n + x.commits.length, 0),
      files: b.reduce((n, x) => n + x.files.length, 0),
      wip: b.reduce((n, x) => n + x.files.filter((f) => f.inWip).length, 0),
    };
  }, [data]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-fg">
            <Icon name="layers" size={18} className="text-fg-subtle" />
            這條線的改動
          </h1>
          {data?.ticketKey && (
            <a
              href={ticketUrl(data.ticketKey)}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-accent/50 bg-surface-selected px-2 py-0.5 font-mono text-xs text-accent hover:bg-accent-bg"
            >
              {data.ticketKey}
            </a>
          )}
          {data && !data.ticketKey && (
            <span className="font-mono text-xs text-fg-muted">{data.key}</span>
          )}
          <span className="text-xs text-fg-subtle">
            {loading
              ? "掃描中…"
              : data
                ? `${totals.repos} 個 repository · ${totals.commits} 個 commit · ${totals.files} 個檔案（${totals.wip} 個還沒 commit）`
                : ""}
          </span>

          <div className="ml-auto flex gap-1">
            {(
              [
                ["overall", "整體", "merge-base → 工作區：這條線最後會變成的 PR 內容"],
                ["commits", "逐 commit", "一個 commit 一段（同一個檔案可能出現在多個 commit）"],
              ] as const
            ).map(([m, text, tip]) => (
              <Tooltip key={m} label={tip}>
                <button
                  onClick={() => setMode(m)}
                  className={`rounded-md border px-2.5 py-1 text-xs ${
                    mode === m
                      ? "border-control bg-control text-on-solid"
                      : "border-line-strong text-fg-muted hover:bg-surface-raised"
                  }`}
                >
                  {text}
                </button>
              </Tooltip>
            ))}
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-line-strong px-3 py-1.5 text-xs text-fg hover:bg-surface-raised disabled:opacity-50"
          >
            重新掃描
          </button>
        </div>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div
          className={`flex min-h-0 flex-col border-line lg:w-[26rem] lg:shrink-0 lg:border-r ${
            selected ? "hidden lg:flex" : "flex-1"
          }`}
        >
          <div className="flex shrink-0 items-center justify-end border-b border-line px-2 py-1">
            <ViewToggle view={view} onChange={switchView} />
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
          <div className="w-max min-w-full">
            {data?.branches.length === 0 && !loading && (
              <p className="px-4 py-8 text-center text-sm text-fg-subtle">
                沒有找到這條線的分支。
                <br />
                可以從下面的「其他 worktree」手動加一個。
              </p>
            )}

            {data?.branches.map((b) => (
              <div key={b.worktree} className="border-b border-line">
                <div className="bg-surface-raised px-4 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-medium text-fg">{b.repo}</span>
                    {b.branch && (
                      <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">
                        {b.branch}
                      </span>
                    )}
                    {b.worktreeName !== b.repo && (
                      <WorktreeBadge />
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-fg-subtle">
                    <Tooltip label="這條分支跟誰比（動態問 origin/HEAD，不是寫死 master）">
                      <span className="font-mono">
                        {b.base ?? "?"} … {b.mergeBase?.slice(0, 8) ?? "?"}
                      </span>
                    </Tooltip>
                    {b.why.map((w) => (
                      <Tooltip key={w} label={REASON_LABEL[w]}>
                        <span
                          className={`rounded-full px-1.5 py-0.5 ${
                            w === "trailer"
                              ? "bg-ok/25 text-ok"
                              : "border border-line text-fg-muted"
                          }`}
                        >
                          {w === "trailer" ? "● 精確" : REASON_LABEL[w]}
                        </span>
                      </Tooltip>
                    ))}
                  </div>
                  {b.error && <p className="mt-1 text-[11px] text-danger">{b.error}</p>}
                </div>

                {mode === "overall"
                  ? renderFiles(
                      b.files,
                      b.worktree,
                      selected?.branch.worktree === b.worktree && !selected.sha ? selected.file.path : null,
                      (f) => openFile({ branch: b, file: f, sha: null }),
                      // 整體檢視才有：這個檔案是 commit 過的、還沒 commit 的，還是兩者都有
                      (f) => {
                        const o = fileOrigin(f);
                        return {
                          leading: (
                            <span className={`w-7 shrink-0 font-mono text-[10px] ${o.cls}`} title={o.title}>
                              {o.label}
                            </span>
                          ),
                        };
                      }
                    )
                  : b.commits.map((c) => (
                      <div key={c.sha}>
                        <button
                          onClick={() => void loadCommitFiles(b, c.sha)}
                          className="flex w-full items-center gap-2 whitespace-nowrap px-4 py-1.5 text-left text-xs hover:bg-surface-raised"
                        >
                          <Icon
                            name={openCommit === c.sha ? "chevronDown" : "chevronRight"}
                            size={12}
                            className="shrink-0 text-fg-subtle"
                          />
                          <Tooltip
                            label={
                              c.sessionId
                                ? "這個 commit 的訊息帶 Claude-Session，確定是那次 session 做的"
                                : "沒有 Claude-Session trailer（手動 commit，或別的 repo 的格式）"
                            }
                          >
                            <span className={c.sessionId ? "text-ok" : "text-fg-disabled"}>●</span>
                          </Tooltip>
                          <span className="font-mono text-[11px] text-fg-subtle">{c.shortSha}</span>
                          <span className="text-fg">{c.subject}</span>
                        </button>
                        {openCommit === c.sha &&
                          renderFiles(
                            commitFiles[c.sha] ?? [],
                            c.sha,
                            selected?.sha === c.sha ? selected.file.path : null,
                            (f) => openFile({ branch: b, file: f, sha: c.sha }),
                            undefined,
                            1
                          )}
                      </div>
                    ))}

                {mode === "commits" && b.commits.length === 0 && (
                  <p className="px-4 py-2 text-[11px] text-fg-subtle">
                    這條分支還沒有 commit（改動全都還在工作區）。
                  </p>
                )}
              </div>
            ))}

            {/* 自動偵測一定會漏 —— 這是逃生口 */}
            {data && data.candidates.length > 0 && (
              <div className="px-4 py-3">
                <button
                  onClick={() => setShowCandidates((v) => !v)}
                  className="flex items-center gap-1.5 text-[11px] text-fg-subtle hover:text-fg"
                >
                  <Icon name={showCandidates ? "chevronDown" : "chevronRight"} size={11} />
                  其他 worktree（{data.candidates.length}）—— 沒被收進這條線
                </button>
                {showCandidates && (
                  <ul className="mt-2 space-y-1">
                    {data.candidates.map((c) => (
                      <li key={c.worktree} className="flex items-center gap-2 text-[11px]">
                        <button
                          onClick={() => void addManual(c.worktree)}
                          className="rounded border border-line-strong px-1.5 py-0.5 text-fg-muted hover:bg-surface-raised"
                        >
                          加入
                        </button>
                        <span className="font-mono text-fg-muted">{c.repo}</span>
                        <span className="font-mono text-fg-subtle">{c.branch ?? "(detached)"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          </div>
        </div>

        <div className={`min-h-0 flex-1 overflow-y-auto ${selected ? "" : "hidden lg:block"}`}>
          {!selected ? (
            <p className="px-6 py-10 text-sm text-fg-subtle">選一個檔案看 diff。</p>
          ) : (
            <>
              <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2">
                <button
                  onClick={() => setSelected(null)}
                  className="text-fg-subtle hover:text-fg lg:hidden"
                  aria-label="回到清單"
                >
                  <Icon name="chevronRight" size={16} className="rotate-180" />
                </button>
                <span className="font-mono text-xs text-fg-muted">{selected.branch.repo}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg">
                  {selected.file.path}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-fg-subtle">
                  {selected.sha ? `commit ${selected.sha.slice(0, 8)}` : "整體（含未提交）"}
                </span>
              </div>

              {diffLoading ? (
                <p className="px-4 py-6 text-sm text-fg-subtle">讀取中…</p>
              ) : diff?.error ? (
                <p className="px-4 py-6 text-sm text-danger">{diff.error}</p>
              ) : diff?.image ? (
                <ImageDiffView
                  key={`${selected.branch.worktree}:${selected.file.path}:${selected.sha ?? "overall"}`}
                  worktree={selected.branch.worktree}
                  file={selected.file.path}
                  oldPath={diff.image.oldPath}
                  oldRev={diff.image.oldRev}
                  newRev={diff.image.newRev}
                  oldBytes={diff.image.oldBytes}
                  newBytes={diff.image.newBytes}
                  theme={diffTheme}
                  source={
                    diff.binary ? undefined : (
                      <DiffView lines={diff.lines} file={selected.file.path} truncated={diff.truncated} theme={diffTheme} />
                    )
                  }
                />
              ) : diff?.binary ? (
                <p className="px-4 py-6 text-sm text-fg-subtle">二進位檔，不顯示內容。</p>
              ) : diff ? (
                <DiffView
                  lines={diff.lines}
                  file={selected.file.path}
                  truncated={diff.truncated}
                  theme={diffTheme}
                  loadLines={
                    selected.file.kind === "untracked"
                      ? undefined
                      : (from, to) =>
                          fetchDiffLines(
                            selected.branch.worktree,
                            selected.file.path,
                            selected.sha ?? "",
                            from,
                            to
                          )
                  }
                />
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 給 DiffView 抓「展開更多上下文」用的那幾行。
 *
 * rev 決定讀哪一版的新側：看單一 commit 是那個 sha，其餘（HEAD→工作區、
 * base→工作區）都是工作區現在的檔案，所以是空字串。
 */
async function fetchDiffLines(
  worktree: string,
  file: string,
  rev: string,
  from: number,
  to: number | null
): Promise<{ lines: string[]; total: number } | null> {
  const qs = new URLSearchParams({ worktree, file, rev, from: String(from) });
  if (to !== null) qs.set("to", String(to));
  const res = await fetch(`/api/changes/lines?${qs}`);
  if (!res.ok) return null;
  return (await res.json()) as { lines: string[]; total: number };
}
