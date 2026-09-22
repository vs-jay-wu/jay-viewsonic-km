"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import hljs from "@/lib/highlight";
import Icon from "@/components/Icon";
import WorktreeBadge from "@/components/WorktreeBadge";
import Tooltip from "@/components/Tooltip";
import SearchSelect, { type SearchOption } from "@/components/SearchSelect";
import { DragHandle, useDragWidth, useWideLayout } from "@/components/Split";
import { useLiveRefresh } from "@/components/useLiveRefresh";
import { hljsHref, type DiffTheme } from "@/lib/uiSettingsRules";
import { languageOf } from "@/lib/changesRules";
import { groupRepos } from "@/lib/repoGroupRules";
import { groupHits, looksBinary, type SearchHit, type TreeEntry } from "@/lib/codeBrowseRules";

/**
 * 程式碼瀏覽（唯讀）。
 *
 * 目的是「不開 IDE 也看得到別的 repo 長什麼樣」（Jay 2026-09-18）——
 * **沒有任何修改功能**，整條 API 路徑上都沒有寫入。
 *
 * 左欄是資料夾樹（逐層展開，不一次掃整個 repo —— 這裡有 137 個 repo，
 * 其中幾個含上萬個檔案），右欄是檔案內容或搜尋結果。
 */

interface RepoBrief {
  name: string;
  dir: string;
  worktreeOf: string | null;
  pinned: boolean;
  lastCommitAt: string | null;
}

interface FileContent {
  path: string;
  text: string;
  sizeBytes: number;
  error?: string;
}

const DEFAULT_TREE_W = 320;

export default function CodePage() {
  return (
    <Suspense fallback={<p className="px-6 py-10 text-sm text-fg-subtle">載入中…</p>}>
      <CodeBrowser />
    </Suspense>
  );
}

function CodeBrowser() {
  const wide = useWideLayout();
  const rowRef = useRef<HTMLDivElement>(null);
  const treePane = useDragWidth({
    storageKey: "km.code.treeW",
    defaultWidth: DEFAULT_TREE_W,
    min: 220,
    max: 900,
    measure: (clientX) => clientX - (rowRef.current?.getBoundingClientRect().left ?? 0),
  });

  const [repos, setRepos] = useState<RepoBrief[]>([]);
  const [dir, setDir] = useState<string>("");
  /** 已展開的目錄 → 它底下的項目。逐層抓，不預先掃整個 repo */
  const [tree, setTree] = useState<Record<string, TreeEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [file, setFile] = useState<FileContent | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [diffTheme, setDiffTheme] = useState<DiffTheme>("dark");

  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  /** 從搜尋結果跳過去時要捲到哪一行 */
  const [gotoLine, setGotoLine] = useState<number | null>(null);

  const [rescanning, setRescanning] = useState(false);

  /** `fresh` 會等 server 重新掃完（那支 API 平常走快取，見 lib/repoCacheRules.ts） */
  const loadRepos = useCallback(async (fresh = false) => {
    if (fresh) setRescanning(true);
    try {
      const res = await fetch(`/api/git/repos${fresh ? "?fresh=1" : ""}`, { cache: "no-store" });
      const d = (await res.json()) as { repos: RepoBrief[] };
      setRepos(d.repos);
      const q = new URLSearchParams(window.location.search).get("repo");
      if (q && d.repos.some((r) => r.dir === q)) setDir(q);
    } catch {
      // 抓不到就維持現狀，畫面上的「選一個 repo（0 個）」自己會說明
    } finally {
      setRescanning(false);
    }
  }, []);

  useEffect(() => {
    void loadRepos();
  }, [loadRepos]);

  /**
   * 本機有變動就安靜更新（不跳 spinner、不動捲軸）。這頁要更新的是 repo 清單
   * 與**目前展開的那幾層**目錄 —— 檔案內容不自動換掉，你正在讀的東西不該
   * 在眼前跳掉；要看新的按一下那個檔就好。
   */
  useLiveRefresh(
    () => {
      void loadRepos();
      if (dir) for (const rel of ["", ...expanded]) void loadDir(rel);
    },
    { dir, alsoOnVisible: true }
  );

  // 配色沿用設定頁那一項（跟 diff 同一個）
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

  const repoOptions = useMemo<SearchOption[]>(() => {
    // 分組只是為了讓 worktree 帶上主 repo 名當搜尋關鍵字（SearchSelect 自己有搜尋框）
    const groups = groupRepos(repos);
    return groups.flatMap((g) => [
      ...(g.main ? [{ value: g.main.dir, label: g.main.name }] : []),
      ...g.worktrees.map((w) => ({
        value: w.dir,
        label: w.name,
        keywords: g.name,
        hint: <WorktreeBadge />,
      })),
    ]);
  }, [repos]);

  const loadDir = useCallback(
    async (rel: string) => {
      if (!dir) return;
      const qs = new URLSearchParams({ dir, path: rel });
      const res = await fetch(`/api/code/tree?${qs}`);
      const json = await res.json();
      if (res.ok) setTree((t) => ({ ...t, [rel]: json.entries as TreeEntry[] }));
    },
    [dir]
  );

  // 換 repo：重置整棵樹與右邊的內容
  useEffect(() => {
    if (!dir) return;
    setTree({});
    setExpanded(new Set());
    setFile(null);
    setHits(null);
    void loadDir("");
    const url = new URL(window.location.href);
    url.searchParams.set("repo", dir);
    window.history.replaceState(null, "", url);
  }, [dir, loadDir]);

  const toggleDir = (rel: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(rel)) next.delete(rel);
      else {
        next.add(rel);
        if (!tree[rel]) void loadDir(rel);
      }
      return next;
    });
  };

  const openFile = async (rel: string, line?: number) => {
    setLoadingFile(true);
    setGotoLine(line ?? null);
    try {
      const qs = new URLSearchParams({ dir, path: rel });
      const res = await fetch(`/api/code/file?${qs}`);
      const json = await res.json();
      setFile(res.ok ? json : { path: rel, text: "", sizeBytes: 0, error: json.error });
    } finally {
      setLoadingFile(false);
    }
  };

  const doSearch = async () => {
    if (!dir || q.trim().length < 2) return;
    setSearching(true);
    setSearchErr(null);
    try {
      const qs = new URLSearchParams({ dir, q });
      if (caseSensitive) qs.set("case", "1");
      if (regex) qs.set("regex", "1");
      const res = await fetch(`/api/code/search?${qs}`);
      const json = await res.json();
      if (!res.ok) {
        setSearchErr(json.error ?? "搜尋失敗");
        setHits(null);
      } else {
        setHits(json.hits as SearchHit[]);
        setFile(null);
      }
    } finally {
      setSearching(false);
    }
  };

  // 跳到指定行：等內容畫好再捲
  useEffect(() => {
    if (!gotoLine || !file) return;
    const el = document.querySelector(`[data-line="${gotoLine}"]`);
    el?.scrollIntoView({ block: "center" });
  }, [gotoLine, file]);

  const lang = file ? languageOf(file.path) : null;
  const lines = useMemo(() => (file?.text ? file.text.split("\n") : []), [file]);
  const highlighted = useMemo(() => {
    // getLanguage 的守衛見 DiffView 的同名函式（沒註冊的語言會噴 console.error）
    if (!file?.text || !lang || !hljs.getLanguage(lang)) return null;
    try {
      return hljs.highlight(file.text, { language: lang, ignoreIllegals: true }).value.split("\n");
    } catch {
      return null; // 認不得的語言就不上色，不要硬猜
    }
  }, [file, lang]);

  const dark = diffTheme === "dark";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 sm:px-6">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-fg">
          <Icon name="code" size={18} className="text-fg-subtle" />
          程式碼
        </h1>
        <span className="text-xs text-fg-subtle">唯讀 —— 看結構與內容，不能改</span>

        <div className="ml-auto flex items-center gap-2">
          <SearchSelect
            ariaLabel="選 repo"
            value={dir}
            onChange={setDir}
            placeholder="搜尋 repo…"
            width={340}
            options={repoOptions}
          />
        </div>
      </div>

      {!dir ? (
        /*
         * 還沒選 repo 時直接把清單攤在畫面上，不要只寫一句「選一個 repo。」——
         * 唯一的入口是右上角那顆小藥丸，看起來就像頁面壞了（Jay 2026-09-22
         * 連兩次回報「請求都正常但東西出不來」）。順帶讓「真的一個都抓不到」
         * 這件事**看得見**：清單空的時候這裡會講出來，不必開 devtools 猜。
         */
        <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
          <p className="flex items-center gap-1.5 text-sm text-fg-muted">
            選一個 repo（{repoOptions.length} 個）
            <Tooltip label="重新掃描工作區">
              <button
                onClick={() => void loadRepos(true)}
                disabled={rescanning}
                aria-label="重新掃描"
                className="text-fg-subtle hover:text-fg disabled:opacity-40"
              >
                <Icon name="refresh" size={14} className={rescanning ? "animate-spin" : ""} />
              </button>
            </Tooltip>
          </p>
          {repoOptions.length === 0 ? (
            <p className="mt-3 text-sm text-fg-subtle">還在抓 repo 清單…</p>
          ) : (
            <div className="mt-3 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {repoOptions.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setDir(o.value)}
                  className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-left font-mono text-xs text-fg hover:bg-surface-raised"
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.hint}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div ref={rowRef} className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* 左：搜尋 ＋ 資料夾樹 */}
          <div
            style={wide ? { width: treePane.width, flex: "0 0 auto" } : undefined}
            className="flex min-h-0 flex-col border-line lg:border-r"
          >
            <div className="shrink-0 space-y-1.5 border-b border-line p-2">
              <div className="relative">
                <Icon name="search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void doSearch()}
                  placeholder="搜尋內容（Enter）…"
                  className="w-full rounded-lg border border-line-strong py-1.5 pl-8 pr-2 text-xs outline-none focus:border-line-strong"
                />
              </div>
              <div className="flex items-center gap-3 text-[11px] text-fg-muted">
                <label className="inline-flex items-center gap-1">
                  <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />
                  區分大小寫
                </label>
                <Tooltip label="關掉時整串當成純文字比對，括號、點號都不用跳脫">
                  <label className="inline-flex items-center gap-1">
                    <input type="checkbox" checked={regex} onChange={(e) => setRegex(e.target.checked)} />
                    正則
                  </label>
                </Tooltip>
                {hits && (
                  <button onClick={() => setHits(null)} className="ml-auto underline hover:text-fg">
                    回到檔案樹
                  </button>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              {hits ? (
                <SearchResults hits={hits} onOpen={openFile} searching={searching} error={searchErr} />
              ) : (
                <TreeLevel
                  rel=""
                  tree={tree}
                  expanded={expanded}
                  depth={0}
                  onToggle={toggleDir}
                  onOpen={(p) => void openFile(p)}
                  selected={file?.path ?? null}
                />
              )}
            </div>
          </div>

          <DragHandle handleProps={treePane.handleProps} />

          {/* 右：檔案內容 */}
          <div className="min-h-0 flex-1 overflow-auto">
            {loadingFile ? (
              <p className="px-6 py-10 text-sm text-fg-subtle">讀取中…</p>
            ) : !file ? (
              <p className="px-6 py-10 text-sm text-fg-subtle">選一個檔案。</p>
            ) : file.error ? (
              <div className="px-6 py-10">
                <p className="font-mono text-xs text-fg-muted">{file.path}</p>
                <p className="mt-2 text-sm text-warn">{file.error}</p>
              </div>
            ) : (
              <>
                <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface px-4 py-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg">{file.path}</span>
                  <span className="shrink-0 font-mono text-[11px] text-fg-subtle">
                    {lines.length} 行 · {(file.sizeBytes / 1024).toFixed(1)} KB
                  </span>
                </div>
                <div className={dark ? "bg-[#0d1117]" : "bg-surface"}>
                  <table className="w-full border-collapse font-mono text-[12px] leading-[1.55]">
                    <tbody>
                      {lines.map((l, i) => (
                        <tr
                          key={i}
                          data-line={i + 1}
                          className={gotoLine === i + 1 ? (dark ? "bg-amber-900/40" : "bg-warn/30") : ""}
                        >
                          <td
                            className={`w-12 select-none px-2 text-right align-top ${
                              dark ? "text-fg-muted" : "text-fg-disabled"
                            }`}
                          >
                            {i + 1}
                          </td>
                          <td className={`whitespace-pre-wrap break-all px-2 align-top ${dark ? "text-fg-disabled" : "text-fg"}`}>
                            {highlighted ? (
                              <span dangerouslySetInnerHTML={{ __html: highlighted[i] ?? "" }} />
                            ) : (
                              l || " "
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** 資料夾樹的一層。逐層展開 —— 一次掃整個 repo 在這裡是不可行的 */
function TreeLevel({
  rel,
  tree,
  expanded,
  depth,
  onToggle,
  onOpen,
  selected,
}: {
  rel: string;
  tree: Record<string, TreeEntry[]>;
  expanded: Set<string>;
  depth: number;
  onToggle: (rel: string) => void;
  onOpen: (rel: string) => void;
  selected: string | null;
}) {
  const entries = tree[rel];
  if (!entries) return <p className="px-3 py-2 text-[11px] text-fg-subtle">讀取中…</p>;

  return (
    <>
      {entries.map((e) => {
        const isOpen = expanded.has(e.path);
        return (
          <div key={e.path}>
            <button
              onClick={() => (e.kind === "dir" ? onToggle(e.path) : onOpen(e.path))}
              style={{ paddingLeft: 8 + depth * 12 }}
              className={`flex w-full items-center gap-1.5 whitespace-nowrap py-0.5 pr-2 text-left text-xs hover:bg-surface-raised ${
                selected === e.path ? "bg-surface-selected" : ""
              }`}
            >
              {e.kind === "dir" ? (
                <Icon
                  name={isOpen ? "chevronDown" : "chevronRight"}
                  size={11}
                  className="shrink-0 text-fg-subtle"
                />
              ) : (
                <span className="w-[11px] shrink-0" />
              )}
              <span
                className={`font-mono ${
                  e.kind === "dir"
                    ? "text-fg"
                    : looksBinary(e.path)
                      ? "text-fg-subtle"
                      : "text-fg-muted"
                }`}
              >
                {e.name}
              </span>
            </button>
            {e.kind === "dir" && isOpen && (
              <TreeLevel
                rel={e.path}
                tree={tree}
                expanded={expanded}
                depth={depth + 1}
                onToggle={onToggle}
                onOpen={onOpen}
                selected={selected}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

function SearchResults({
  hits,
  onOpen,
  searching,
  error,
}: {
  hits: SearchHit[];
  onOpen: (path: string, line: number) => void;
  searching: boolean;
  error: string | null;
}) {
  if (searching) return <p className="px-3 py-2 text-[11px] text-fg-subtle">搜尋中…</p>;
  if (error) return <p className="px-3 py-2 text-[11px] text-danger">{error}</p>;
  if (!hits.length) return <p className="px-3 py-2 text-[11px] text-fg-subtle">沒有命中。</p>;

  const groups = groupHits(hits);
  return (
    <>
      <p className="px-3 py-1.5 text-[11px] text-fg-subtle">
        {hits.length} 個命中 · {groups.length} 個檔案
      </p>
      {groups.map((g) => (
        <div key={g.path} className="border-b border-line">
          <p className="truncate bg-surface-raised px-3 py-1 font-mono text-[11px] text-fg">{g.path}</p>
          {g.hits.map((h, i) => (
            <button
              key={i}
              onClick={() => onOpen(h.path, h.line)}
              className="flex w-full items-baseline gap-2 px-3 py-0.5 text-left hover:bg-surface-raised"
            >
              <span className="shrink-0 font-mono text-[10px] text-fg-subtle">{h.line}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-muted">
                {h.text.trim()}
              </span>
            </button>
          ))}
        </div>
      ))}
    </>
  );
}
