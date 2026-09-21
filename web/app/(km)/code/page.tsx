"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import hljs from "highlight.js/lib/common";
import Icon from "@/components/Icon";
import WorktreeBadge from "@/components/WorktreeBadge";
import Tooltip from "@/components/Tooltip";
import SearchSelect, { type SearchOption } from "@/components/SearchSelect";
import { DragHandle, useDragWidth, useWideLayout } from "@/components/Split";
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
    <Suspense fallback={<p className="px-6 py-10 text-sm text-gray-400">載入中…</p>}>
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

  useEffect(() => {
    fetch("/api/git/repos", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { repos: RepoBrief[] }) => {
        setRepos(d.repos);
        const q = new URLSearchParams(window.location.search).get("repo");
        if (q && d.repos.some((r) => r.dir === q)) setDir(q);
      })
      .catch(() => undefined);
  }, []);

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
    if (!file?.text || !lang) return null;
    try {
      return hljs.highlight(file.text, { language: lang, ignoreIllegals: true }).value.split("\n");
    } catch {
      return null; // 認不得的語言就不上色，不要硬猜
    }
  }, [file, lang]);

  const dark = diffTheme === "dark";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 px-4 py-3 sm:px-6">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <Icon name="code" size={18} className="text-gray-400" />
          程式碼
        </h1>
        <span className="text-xs text-gray-400">唯讀 —— 看結構與內容，不能改</span>

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
        <p className="px-6 py-10 text-sm text-gray-400">選一個 repo。</p>
      ) : (
        <div ref={rowRef} className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* 左：搜尋 ＋ 資料夾樹 */}
          <div
            style={wide ? { width: treePane.width, flex: "0 0 auto" } : undefined}
            className="flex min-h-0 flex-col border-gray-200 lg:border-r"
          >
            <div className="shrink-0 space-y-1.5 border-b border-gray-100 p-2">
              <div className="relative">
                <Icon name="search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void doSearch()}
                  placeholder="搜尋內容（Enter）…"
                  className="w-full rounded-lg border border-gray-300 py-1.5 pl-8 pr-2 text-xs outline-none focus:border-gray-500"
                />
              </div>
              <div className="flex items-center gap-3 text-[11px] text-gray-500">
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
                  <button onClick={() => setHits(null)} className="ml-auto underline hover:text-gray-800">
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
              <p className="px-6 py-10 text-sm text-gray-400">讀取中…</p>
            ) : !file ? (
              <p className="px-6 py-10 text-sm text-gray-400">選一個檔案。</p>
            ) : file.error ? (
              <div className="px-6 py-10">
                <p className="font-mono text-xs text-gray-500">{file.path}</p>
                <p className="mt-2 text-sm text-amber-700">{file.error}</p>
              </div>
            ) : (
              <>
                <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-gray-200 bg-white px-4 py-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-gray-900">{file.path}</span>
                  <span className="shrink-0 font-mono text-[11px] text-gray-400">
                    {lines.length} 行 · {(file.sizeBytes / 1024).toFixed(1)} KB
                  </span>
                </div>
                <div className={dark ? "bg-[#0d1117]" : "bg-white"}>
                  <table className="w-full border-collapse font-mono text-[12px] leading-[1.55]">
                    <tbody>
                      {lines.map((l, i) => (
                        <tr
                          key={i}
                          data-line={i + 1}
                          className={gotoLine === i + 1 ? (dark ? "bg-amber-900/40" : "bg-amber-100") : ""}
                        >
                          <td
                            className={`w-12 select-none px-2 text-right align-top ${
                              dark ? "text-gray-600" : "text-gray-300"
                            }`}
                          >
                            {i + 1}
                          </td>
                          <td className={`whitespace-pre-wrap break-all px-2 align-top ${dark ? "text-gray-200" : "text-gray-800"}`}>
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
  if (!entries) return <p className="px-3 py-2 text-[11px] text-gray-400">讀取中…</p>;

  return (
    <>
      {entries.map((e) => {
        const isOpen = expanded.has(e.path);
        return (
          <div key={e.path}>
            <button
              onClick={() => (e.kind === "dir" ? onToggle(e.path) : onOpen(e.path))}
              style={{ paddingLeft: 8 + depth * 12 }}
              className={`flex w-full items-center gap-1.5 whitespace-nowrap py-0.5 pr-2 text-left text-xs hover:bg-gray-50 ${
                selected === e.path ? "bg-sky-50" : ""
              }`}
            >
              {e.kind === "dir" ? (
                <Icon
                  name={isOpen ? "chevronDown" : "chevronRight"}
                  size={11}
                  className="shrink-0 text-gray-400"
                />
              ) : (
                <span className="w-[11px] shrink-0" />
              )}
              <span
                className={`font-mono ${
                  e.kind === "dir"
                    ? "text-gray-700"
                    : looksBinary(e.path)
                      ? "text-gray-400"
                      : "text-gray-600"
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
  if (searching) return <p className="px-3 py-2 text-[11px] text-gray-400">搜尋中…</p>;
  if (error) return <p className="px-3 py-2 text-[11px] text-red-600">{error}</p>;
  if (!hits.length) return <p className="px-3 py-2 text-[11px] text-gray-400">沒有命中。</p>;

  const groups = groupHits(hits);
  return (
    <>
      <p className="px-3 py-1.5 text-[11px] text-gray-400">
        {hits.length} 個命中 · {groups.length} 個檔案
      </p>
      {groups.map((g) => (
        <div key={g.path} className="border-b border-gray-50">
          <p className="truncate bg-gray-50 px-3 py-1 font-mono text-[11px] text-gray-700">{g.path}</p>
          {g.hits.map((h, i) => (
            <button
              key={i}
              onClick={() => onOpen(h.path, h.line)}
              className="flex w-full items-baseline gap-2 px-3 py-0.5 text-left hover:bg-gray-50"
            >
              <span className="shrink-0 font-mono text-[10px] text-gray-400">{h.line}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-gray-600">
                {h.text.trim()}
              </span>
            </button>
          ))}
        </div>
      ))}
    </>
  );
}
