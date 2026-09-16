"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Icon from "@/components/Icon";
import Tooltip from "@/components/Tooltip";
import DiffView from "@/components/DiffView";
import ImageDiffView from "@/components/ImageDiffView";
import { FileRow, TreeRows, ViewToggle, useFileView } from "@/components/FileList";
import { hljsHref, type DiffTheme } from "@/lib/uiSettingsRules";
import {
  KIND_CLS, KIND_LABEL, KIND_TITLE, buildTree, countByKind,
  type ChangedFile, type DiffLine, type RepoChanges, type TreeNode,
} from "@/lib/changesRules";
import type { ImageSides } from "@/lib/changes";

interface Snapshot {
  scannedAt: string;
  scanned: number;
  repos: RepoChanges[];
  ignored: string[];
  ignoredChanges: number;
  skippedOffloaded: number;
}

/** 左欄預設寬度（原本的 `lg:w-96`） */
const DEFAULT_PANE_W = 384;
const MIN_PANE_W = 220;
const MAX_PANE_W = 900;
const WIDE_QUERY = "(min-width: 1024px)";

function clampPaneW(w: number): number {
  return Math.min(MAX_PANE_W, Math.max(MIN_PANE_W, Math.round(w)));
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
  /** 圖片改走 `ImageDiffView`（2-up／滑桿／洋蔥皮） */
  image?: ImageSides;
  error?: string;
}

/**
 * 雙欄版面（lg 以上）才套自訂寬度 —— 窄螢幕的清單是整頁寬，硬套會變成一條細長條。
 *
 * 用 `useSyncExternalStore` 而不是 effect＋setState：後者第一幀一定是 false，
 * 會先用預設寬度畫一次再跳成使用者的寬度（而且 lint 也會擋 effect 裡同步 setState）。
 */
function useWideLayout(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(WIDE_QUERY);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false // SSR：先當窄螢幕，掛載後立刻校正
  );
}

export default function ChangesPage() {
  const wide = useWideLayout();
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModeOnly, setShowModeOnly] = useState(false);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [diff, setDiff] = useState<DiffPayload | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diffTheme, setDiffTheme] = useState<DiffTheme>("dark");
  /** 收起來的 repo、worktree 與目錄（key 用 repo 名／worktree 絕對路徑／`<worktree>:<目錄>`）。
   *  存 localStorage —— 純畫面偏好，不值得上 server，但要撐過重新整理 */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  /** 清單要平鋪還是樹狀（VS Code 的 List／Tree）。跟「這條線的改動」共用同一個偏好 */
  const [view, switchView] = useFileView();
  /** 左欄寬度（px）。只在雙欄版面（lg 以上）才套用 */
  const [paneW, setPaneW] = useState(DEFAULT_PANE_W);
  const dragging = useRef(false);
  const paneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("km.changes.collapsed");
      if (raw) setCollapsed(new Set(JSON.parse(raw) as string[]));
      const w = Number(localStorage.getItem("km.changes.paneW"));
      if (Number.isFinite(w) && w > 0) setPaneW(clampPaneW(w));
    } catch {
      /* 讀不到就用預設值 */
    }
  }, []);


  // 拖左欄邊界。監聽掛在 window 上，滑鼠衝出分隔線也不會斷
  useEffect(() => {
    const widthAt = (clientX: number) =>
      clampPaneW(clientX - (paneRef.current?.getBoundingClientRect().left ?? 0));
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      e.preventDefault();
      setPaneW(widthAt(e.clientX));
    };
    // 存的是**從這個事件重算**的寬度，不是讀 state：拖曳過程沒有等 React 重繪的保證，
    // 讀 state／ref 會存到上一次的值
    const onUp = (e: PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.removeProperty("user-select");
      try {
        localStorage.setItem("km.changes.paneW", String(widthAt(e.clientX)));
      } catch {
        /* 存不了就算了 */
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
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
    // 寫進網址（不進 history —— 每點一個檔案就多一筆上一頁會很難用），
    // 重新整理才回得到同一個檔案。`replaceState` 不會讓 Next 重新導航
    const url = new URL(window.location.href);
    url.searchParams.set("w", sel.worktree);
    url.searchParams.set("f", sel.file.path);
    window.history.replaceState(null, "", url);
    setDiff(null);
    setDiffLoading(true);
    try {
      const qs = new URLSearchParams({
        worktree: sel.worktree,
        file: sel.file.path,
        untracked: sel.file.kind === "untracked" ? "1" : "0",
        // 改名的檔案，HEAD 那側要用舊路徑才抓得到
        from: sel.file.from ?? "",
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

  // 重新整理之後把網址上的檔案選回來。掃描結果回來才找得到那筆（要它的 kind／from），
  // 而且只做一次 —— 之後的重掃不該把使用者當下選的檔案蓋掉
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !data) return;
    restored.current = true;
    const q = new URLSearchParams(window.location.search);
    const w = q.get("w");
    const f = q.get("f");
    if (!w || !f) return;
    for (const r of data.repos) {
      for (const wt of r.worktrees) {
        if (wt.path !== w) continue;
        const file = wt.files.find((x) => x.path === f);
        // 找不到就安靜地放掉：那個改動可能已經被 commit 或還原了
        if (file) void openFile({ worktree: wt.path, worktreeName: wt.name, repo: r.repo, file });
        return;
      }
    }
    // deps 只有 data：openFile 每次 render 都是新的函式，帶進來會無限重跑
  }, [data]);

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

  // 樹狀檢視時才建樹。拖寬度會一直重 render，沒有 memo 的話每一幀都重建一次
  const trees = useMemo(() => {
    const m = new Map<string, TreeNode[]>();
    if (view === "tree") {
      for (const r of repos) for (const w of r.worktrees) m.set(w.path, buildTree(w.files));
    }
    return m;
  }, [repos, view]);

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
          ref={paneRef}
          style={wide ? { width: paneW, flex: "0 0 auto" } : undefined}
          className={`flex min-h-0 flex-col border-gray-200 lg:border-r ${
            selected ? "hidden lg:flex" : "flex-1"
          }`}
        >
          {/* 清單自己的工具列。檢視切換是**一顆按鈕直接切**（Jay 2026-09-14）——
              兩顆分頁按鈕佔掉的寬度跟它帶來的資訊不成比例 */}
          <div className="flex shrink-0 items-center justify-end border-b border-gray-100 px-2 py-1">
            <ViewToggle view={view} onChange={switchView} />
          </div>

          {/* 路徑不截斷，改成可以左右捲（Jay 2026-09-14）——「…」會把最有辨識度的
              中間段吃掉，而這裡的路徑常常只差中間那一段。
              `w-max min-w-full`：內容窄時每一列仍撐滿整欄（hover 底色才不會只有半截），
              內容寬時整塊跟著變寬，捲動時底色跟著延伸 */}
          <div className="min-h-0 flex-1 overflow-auto">
          <div className="w-max min-w-full">
          {!loading && repos.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-gray-400">
              沒有未提交的改動。
            </p>
          )}
          {repos.map((r) => (
            <div key={r.repo} className="border-b border-gray-100">
              {/* 標題跟著一起橫捲（VS Code 也是這樣）。試過 `sticky left-0` 把它釘住，
                  但一整條灰底停在原地、底下的檔名從它旁邊滑過去，看起來像卡住了
                  （Jay 2026-09-14 回報）。而且「現在在看哪個檔案」右邊 diff 的標題列
                  本來就寫著 repo／worktree／完整路徑，釘住並沒有換到資訊 */}
              <div className="flex w-full items-center gap-2 bg-gray-50 px-4 py-2">
                <button
                  onClick={() => toggleCollapsed(r.repo)}
                  // 不要 `flex-1`：整條列跟著最寬的路徑一起變寬，把 ✕ 推到捲軸的最右邊
                  // 就點不到了。✕ 直接跟在名字後面，永遠在畫面上
                  className="flex items-center gap-2 text-left"
                >
                  <Icon
                    name={collapsed.has(r.repo) ? "chevronRight" : "chevronDown"}
                    size={13}
                    className="shrink-0 text-gray-400"
                  />
                  <span className="whitespace-nowrap font-mono text-xs font-medium text-gray-900">{r.repo}</span>
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
                      className="flex w-full items-center gap-1.5 whitespace-nowrap px-4 py-1.5 text-left text-[11px] hover:bg-gray-50"
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
                      <span className="whitespace-nowrap text-gray-500">{w.name}</span>
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

                    <div className={wOpen ? "" : "hidden"}>
                      {view === "list"
                        ? w.files.map((f) => (
                            <FileRow
                              key={f.path}
                              file={f}
                              label="path"
                              selected={selected?.worktree === w.path && selected.file.path === f.path}
                              onOpen={() =>
                                openFile({ worktree: w.path, worktreeName: w.name, repo: r.repo, file: f })
                              }
                              trailing={<FileBadges file={f} />}
                            />
                          ))
                        : (
                          <TreeRows
                            nodes={trees.get(w.path) ?? []}
                            keyPrefix={w.path}
                            collapsed={collapsed}
                            onToggle={toggleCollapsed}
                            selectedPath={selected?.worktree === w.path ? selected.file.path : null}
                            onOpen={(f) =>
                              openFile({ worktree: w.path, worktreeName: w.name, repo: r.repo, file: f })
                            }
                            extras={(f) => ({ trailing: <FileBadges file={f} /> })}
                          />
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          </div>
          </div>
        </div>

        {/* 拖這裡改左欄寬度。窄螢幕是上下排版，沒有這條 */}
        <div
          onPointerDown={(e) => {
            e.preventDefault();
            dragging.current = true;
            document.body.style.userSelect = "none";
          }}
          onDoubleClick={() => {
            setPaneW(DEFAULT_PANE_W);
            try {
              localStorage.setItem("km.changes.paneW", String(DEFAULT_PANE_W));
            } catch {
              /* 存不了就算了 */
            }
          }}
          title="拖曳改寬度（雙擊回預設）"
          className="hidden w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-sky-300 active:bg-sky-400 lg:block"
        />

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
              ) : diff?.image ? (
                <ImageDiffView
                  // 換檔案就重建，狀態（尺寸、滑桿位置）跟著歸零
                  key={`${selected.worktree}:${selected.file.path}`}
                  worktree={selected.worktree}
                  file={selected.file.path}
                  oldPath={diff.image.oldPath}
                  oldBytes={diff.image.oldBytes}
                  newBytes={diff.image.newBytes}
                  theme={diffTheme}
                  // SVG 是文字檔，所以還有原始碼可以看
                  source={
                    diff.binary ? undefined : (
                      <DiffView
                        lines={diff.lines}
                        file={selected.file.path}
                        truncated={diff.truncated}
                        theme={diffTheme}
                      />
                    )
                  }
                />
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

/** 只有這一頁要的兩個小標：只改模式、已 git add */
function FileBadges({ file }: { file: ChangedFile }) {
  return (
    <>
      {file.modeOnly && <span className="shrink-0 text-[10px] text-gray-300">模式</span>}
      {file.staged && <span className="shrink-0 text-[10px] text-emerald-600">staged</span>}
    </>
  );
}
