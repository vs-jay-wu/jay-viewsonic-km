"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import hljs from "@/lib/highlight";
import Icon from "@/components/Icon";
import FileIcon from "@/components/FileIcon";
import WorktreeBadge from "@/components/WorktreeBadge";
import Tooltip from "@/components/Tooltip";
import SearchSelect, { type SearchOption } from "@/components/SearchSelect";
import { DragHandle, useDragWidth, useWideLayout } from "@/components/Split";
import { useLiveRefresh } from "@/components/useLiveRefresh";
import RepoPicker from "@/components/RepoPicker";
import { useRepoList } from "@/components/useRepoList";
import { hljsHref, type DiffTheme } from "@/lib/uiSettingsRules";
import { languageOf } from "@/lib/changesRules";
import {
  groupHits, looksBinary, revealSecondsLeft, type SearchHit, type TreeEntry,
} from "@/lib/codeBrowseRules";
import { foldRanges, hiddenLines } from "@/lib/foldRules";

/**
 * 程式碼瀏覽（唯讀）。
 *
 * 目的是「不開 IDE 也看得到別的 repo 長什麼樣」（Jay 2026-09-18）——
 * **沒有任何修改功能**，整條 API 路徑上都沒有寫入。
 *
 * 左欄是資料夾樹（逐層展開，不一次掃整個 repo —— 這裡有 137 個 repo，
 * 其中幾個含上萬個檔案），右欄是檔案內容或搜尋結果。
 */

interface FileContent {
  path: string;
  text: string;
  sizeBytes: number;
  error?: string;
  /** 機敏檔案（`.env` 之類）。畫面上要標出來 */
  sensitive?: boolean;
  /** 這次是用哪種方式解鎖的；沒有就是還沒解 */
  revealed?: "full" | "masked";
}

const DEFAULT_TREE_W = 320;

export default function CodeView({ dir }: { dir: string }) {
  const wide = useWideLayout();
  const rowRef = useRef<HTMLDivElement>(null);
  const treePane = useDragWidth({
    storageKey: "km.code.treeW",
    defaultWidth: DEFAULT_TREE_W,
    min: 220,
    max: 900,
    measure: (clientX) => clientX - (rowRef.current?.getBoundingClientRect().left ?? 0),
  });

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

  /**
   * 本機有變動就安靜更新（不跳 spinner、不動捲軸）。這頁要更新的是**目前展開的
   * 那幾層**目錄 —— 檔案內容不自動換掉，你正在讀的東西不該在眼前跳掉；
   * 要看新的按一下那個檔就好。
   */
  useLiveRefresh(
    () => {
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

  /**
   * 開一個檔案。`reveal` 只在使用者按了解鎖按鈕時才帶 ——
   * 機敏檔案的預設路徑仍然拿不到內容（見 lib/codeBrowseRules.ts）。
   */
  /**
   * 明碼解鎖的到期時間。**自動收回不依賴任何人守規矩** —— `/code` 的畫面常被
   * agent 用瀏覽器工具讀，規則擋得住讀到規則的那一個，擋不住其他的
   * （見 `.claude/rules/sensitive-files.md`）。
   */
  const [revealedAt, setRevealedAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const openFile = async (rel: string, line?: number, reveal?: "full" | "masked") => {
    setLoadingFile(true);
    setGotoLine(line ?? null);
    try {
      const qs = new URLSearchParams({ dir, path: rel });
      if (reveal) qs.set("reveal", reveal);
      const res = await fetch(`/api/code/file?${qs}`);
      const json = await res.json();
      setFile(res.ok ? json : { path: rel, text: "", sizeBytes: 0, ...json });
      // 只有明碼要倒數；遮罩態沒有值，留著不會有事
      setRevealedAt(res.ok && reveal === "full" ? Date.now() : null);
    } finally {
      setLoadingFile(false);
    }
  };

  useEffect(() => {
    if (revealedAt === null) {
      setSecondsLeft(0);
      return;
    }
    const tick = () => {
      const left = revealSecondsLeft(revealedAt, Date.now());
      setSecondsLeft(left);
      // 到期就自己降回遮罩態（不是整個關掉 —— 欄位名沒有機敏性，留著比較好用）
      if (left === 0 && file?.path) void openFile(file.path, undefined, "masked");
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // openFile 每次 render 都是新的，放進相依會讓 interval 一直重建
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealedAt, file?.path]);

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

  /**
   * JSON 的收合。**換檔案就清掉** —— 行號是跟著檔案的，留著會把新檔案的
   * 不相干區段收起來。
   */
  const [folded, setFolded] = useState<Set<number>>(new Set());
  useEffect(() => setFolded(new Set()), [file?.path]);

  const ranges = useMemo(
    () => (lang === "json" && lines.length ? foldRanges(lines) : []),
    [lang, lines]
  );
  const foldStart = useMemo(() => new Map(ranges.map((r) => [r.start, r])), [ranges]);
  const hidden = useMemo(() => hiddenLines(ranges, folded), [ranges, folded]);

  const toggleFold = (start: number) =>
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(start)) next.delete(start);
      else next.add(start);
      return next;
    });

  const dark = diffTheme === "dark";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
                {/*
                  機敏檔案才給這兩顆。**按下去才會去打 API 拿內容** ——
                  在這之前值根本沒離開磁碟。解鎖不會被記住：換檔案、重整都會回到遮蔽。
                */}
                {file.sensitive && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => void openFile(file.path, undefined, "masked")}
                      className="rounded-lg border border-line px-3 py-1.5 text-xs text-fg hover:bg-surface-raised"
                    >
                      只顯示欄位名
                    </button>
                    <button
                      onClick={() => void openFile(file.path, undefined, "full")}
                      className="rounded-lg border border-warn px-3 py-1.5 text-xs text-warn hover:bg-surface-raised"
                    >
                      顯示內容
                    </button>
                    <span className="text-xs text-fg-subtle">
                      正在分享螢幕的話先別按
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface px-4 py-2">
                  <FileIcon path={file.path} size={14} />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg">{file.path}</span>
                  {file.sensitive && (
                    <span className="flex shrink-0 items-center gap-1 rounded-md border border-warn px-1.5 py-0.5 text-[11px] text-warn">
                      <Icon name="alert" size={11} />
                      {file.revealed === "masked"
                        ? "只有欄位名"
                        : `機敏內容已顯示 · ${secondsLeft} 秒後自動收回`}
                    </span>
                  )}
                  {/* 遮罩態要能往上解到明碼，明碼態要能收回 —— 兩個方向都留在標題列，
                      不然只遮一半的時候會卡住（實測：從遮罩態按不到「顯示內容」） */}
                  {file.sensitive && (
                    <button
                      onClick={() =>
                        void openFile(file.path, undefined, file.revealed === "full" ? "masked" : "full")
                      }
                      className="shrink-0 rounded-md border border-line px-1.5 py-0.5 text-[11px] text-fg-muted hover:text-fg"
                    >
                      {file.revealed === "full" ? "收回" : "顯示完整內容"}
                    </button>
                  )}
                  <span className="shrink-0 font-mono text-[11px] text-fg-subtle">
                    {lines.length} 行 · {(file.sizeBytes / 1024).toFixed(1)} KB
                  </span>
                </div>
                <div className={dark ? "bg-[#0d1117]" : "bg-surface"}>
                  <table className="w-full border-collapse font-mono text-[12px] leading-[1.55]">
                    <tbody>
                      {lines.map((l, i) => {
                        if (hidden.has(i)) return null;
                        const r = foldStart.get(i);
                        const isFolded = !!r && folded.has(i);
                        return (
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
                          {/* 收合把手。沒有可收的那幾行也要佔位，不然行首會抖 */}
                          <td className="w-4 select-none align-top">
                            {r && (
                              <button
                                onClick={() => toggleFold(i)}
                                aria-label={`${isFolded ? "展開" : "收合"}第 ${i + 1} 行`}
                                aria-expanded={!isFolded}
                                className={dark ? "text-fg-muted hover:text-on-solid" : "text-fg-subtle hover:text-fg"}
                              >
                                <Icon name={isFolded ? "chevronRight" : "chevronDown"} size={11} />
                              </button>
                            )}
                          </td>
                          <td className={`whitespace-pre-wrap break-all px-2 align-top ${dark ? "text-[#e6edf3]" : "text-fg"}`}>
                            {highlighted ? (
                              <span dangerouslySetInnerHTML={{ __html: highlighted[i] ?? "" }} />
                            ) : (
                              l || " "
                            )}
                            {isFolded && r && (
                              <span className={`ml-1 rounded px-1 text-[11px] ${dark ? "bg-[#161b22] text-[#8b949e]" : "bg-surface-sunken text-fg-muted"}`}>
                                … {r.end - r.start} 行
                              </span>
                            )}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
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
              <FileIcon path={e.name} folder={e.kind === "dir"} size={14} />
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
          <p className="flex items-center gap-1.5 truncate bg-surface-raised px-3 py-1 font-mono text-[11px] text-fg">
            <FileIcon path={g.path} size={12} />
            {g.path}
          </p>
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
