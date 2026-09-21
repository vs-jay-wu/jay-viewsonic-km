"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import Tooltip from "@/components/Tooltip";
import WorktreeBadge from "@/components/WorktreeBadge";
import DiffView from "@/components/DiffView";
import ImageDiffView from "@/components/ImageDiffView";
import { FileRow, StageBadge, TreeRows, ViewToggle, useFileView } from "@/components/FileList";
import { DragHandle, useDragWidth, useWideLayout } from "@/components/Split";
import { hljsHref, type DiffTheme } from "@/lib/uiSettingsRules";
import {
  KIND_CLS, KIND_LABEL, KIND_TITLE, buildTree, countByKind, countByStage, sortRepos, splitByStage,
  type ChangedFile, type DiffLine, type RepoChanges, type TreeNode, type WipSide,
} from "@/lib/changesRules";
import type { ImageSides } from "@/lib/changes";

interface Snapshot {
  scannedAt: string;
  scanned: number;
  repos: RepoChanges[];
  pinned: string[];
  skippedOffloaded: number;
}

/** 左欄預設寬度（原本的 `lg:w-96`） */
const DEFAULT_PANE_W = 384;
const MIN_PANE_W = 220;
const MAX_PANE_W = 900;

interface Selected {
  worktree: string;
  worktreeName: string;
  repo: string;
  file: ChangedFile;
  /**
   * 點的是哪一區。部分 staged 的檔案兩區都會列出來，而兩邊的 diff 不一樣 ——
   * 選取狀態與網址都要帶著它，否則點另一區會看起來沒反應。
   */
  side: WipSide;
}

/** 兩個區塊的標題與說明（照 VS Code 的用字） */
const SIDE_TITLE: Record<WipSide, string> = {
  index: "Staged Changes",
  worktree: "Changes",
};

const SIDE_DESC: Record<WipSide, string> = {
  index: "已 staged（HEAD → 索引，commit 會帶走）",
  worktree: "未 staged（索引 → 工作區，commit 不會帶走）",
};

interface DiffPayload {
  lines: DiffLine[];
  truncated: boolean;
  binary: boolean;
  /** 圖片改走 `ImageDiffView`（2-up／滑桿／洋蔥皮） */
  image?: ImageSides;
  error?: string;
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
  const paneRef = useRef<HTMLDivElement>(null);
  /** 左欄寬度。拖的是左欄，寬度就是「滑鼠 − 左緣」 */
  const listPane = useDragWidth({
    storageKey: "km.changes.paneW",
    defaultWidth: DEFAULT_PANE_W,
    min: MIN_PANE_W,
    max: MAX_PANE_W,
    measure: (clientX) => clientX - (paneRef.current?.getBoundingClientRect().left ?? 0),
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem("km.changes.collapsed");
      if (raw) setCollapsed(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* 讀不到就用預設值 */
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
    // 寫進網址（不進 history —— 每點一個檔案就多一筆上一頁會很難用），
    // 重新整理才回得到同一個檔案。`replaceState` 不會讓 Next 重新導航
    const url = new URL(window.location.href);
    url.searchParams.set("w", sel.worktree);
    url.searchParams.set("f", sel.file.path);
    url.searchParams.set("s", sel.side);
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
        // 哪一區：index ＝ `git diff --cached`、worktree ＝ `git diff`
        side: sel.side,
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
    // 舊網址沒有 `s`（那時還沒分區）—— 當成未 staged 那區，那是絕大多數的情況
    const side: WipSide = q.get("s") === "index" ? "index" : "worktree";
    for (const r of data.repos) {
      for (const wt of r.worktrees) {
        if (wt.path !== w) continue;
        const file = wt.files.find((x) => x.path === f);
        // 找不到就安靜地放掉：那個改動可能已經被 commit 或還原了
        if (file) void openFile({ worktree: wt.path, worktreeName: wt.name, repo: r.repo, file, side });
        return;
      }
    }
    // deps 只有 data：openFile 每次 render 都是新的函式，帶進來會無限重跑
  }, [data]);

  /**
   * pin／取消 pin。回來的清單直接套在手上這份快照上，**不重掃** ——
   * 重掃要跑一百多個 repo 的 git，為了換個順序讓整頁空白幾秒不划算。
   */
  const togglePin = async (repo: string) => {
    const res = await fetch("/api/changes/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo }),
    });
    const json = (await res.json()) as { pinned?: string[]; error?: string };
    if (!res.ok || !json.pinned) {
      setError(json.error ?? "pin 失敗");
      return;
    }
    const pinned = json.pinned;
    setData((prev) =>
      prev
        ? {
            ...prev,
            pinned,
            repos: sortRepos(prev.repos.map((r) => ({ ...r, pinned: pinned.includes(r.repo) }))),
          }
        : prev
    );
  };

  const repos = useMemo(() => {
    if (!data) return [];
    // 未追蹤的一律顯示（Jay 2026-09-14）。只改模式的才預設藏起來 ——
    // 那是整個 repo 被 chmod 過的產物，會把真正的改動洗掉
    const keep = (f: ChangedFile) => showModeOnly || !f.modeOnly;
    const list = data.repos
      .map((r) => {
        const worktrees = r.worktrees
          .map((w) => ({ ...w, files: w.files.filter(keep) }))
          .filter((w) => w.files.length > 0);
        return { ...r, worktrees, total: worktrees.reduce((n, w) => n + w.files.length, 0) };
      })
      .filter((r) => r.total > 0);
    // 藏掉「只改模式」的檔案會改變各 repo 的改動數，順序要跟著重算
    return sortRepos(list);
  }, [data, showModeOnly]);

  const totalFiles = repos.reduce((n, r) => n + r.total, 0);

  /** 每個 worktree 切成 Staged／Changes 兩份（部分 staged 的兩邊都會有） */
  const sections = useMemo(() => {
    const m = new Map<string, Record<WipSide, ChangedFile[]>>();
    for (const r of repos) for (const w of r.worktrees) m.set(w.path, splitByStage(w.files));
    return m;
  }, [repos]);

  // 樹狀檢視時才建樹。拖寬度會一直重 render，沒有 memo 的話每一幀都重建一次。
  // 一區一棵樹（key 是 `<worktree>:<區>`）—— 兩區各自的目錄結構本來就不一樣
  const trees = useMemo(() => {
    const m = new Map<string, TreeNode[]>();
    if (view === "tree") {
      for (const [wPath, sec] of sections) {
        for (const side of ["index", "worktree"] as WipSide[]) {
          if (sec[side].length) m.set(`${wPath}:${side}`, buildTree(sec[side]));
        }
      }
    }
    return m;
  }, [sections, view]);

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
          ) : data && data.pinned.length > 0 ? (
            <span className="text-gray-400">已 pin {data.pinned.join("、")}（排在最前面）</span>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* 清單。選了檔案之後窄螢幕就讓位給 diff */}
        <div
          ref={paneRef}
          style={wide ? { width: listPane.width, flex: "0 0 auto" } : undefined}
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
                  // 不要 `flex-1`：整條列跟著最寬的路徑一起變寬，把 pin 推到捲軸的最右邊
                  // 就點不到了。pin 直接跟在名字後面，永遠在畫面上
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
                <Tooltip
                  side="left"
                  label={r.pinned ? "取消 pin" : "pin 住這個 repo（排到最前面，不會藏起任何東西）"}
                >
                  <button
                    onClick={() => void togglePin(r.repo)}
                    aria-label={r.pinned ? `取消 pin ${r.repo}` : `pin ${r.repo}`}
                    className={`shrink-0 ${
                      r.pinned ? "text-amber-500" : "text-gray-300 hover:text-amber-500"
                    }`}
                  >
                    <Icon name="pin" size={13} />
                  </button>
                </Tooltip>
              </div>

              {!collapsed.has(r.repo) && r.worktrees.map((w) => {
                const counts = countByKind(w.files);
                const stage = countByStage(w.files);
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
                        <WorktreeBadge sessionBound={w.isSessionBound} />
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
                      {/* 收起來的時候也要看得出「有東西已經 add 了」，不然要展開才知道 */}
                      {(stage.staged > 0 || stage.partial > 0) && (
                        <span className="text-gray-500">
                          {stage.staged > 0 && (
                            <span className="text-emerald-600">{stage.staged} staged</span>
                          )}
                          {stage.partial > 0 && (
                            <span className="text-indigo-600">
                              {stage.staged > 0 ? " · " : ""}
                              {stage.partial} 部分 staged
                            </span>
                          )}
                        </span>
                      )}
                    </button>

                    {/*
                      * 照 VS Code 分成 Staged Changes／Changes 兩區。
                      * **部分 staged 的檔案兩邊都會出現**（`MM` ＝ 索引有一版、工作區
                      * 還有沒 add 的改動），而且兩邊點開看到的 diff 不一樣 —— 那不是
                      * 重複列，正是分區的理由。只有一區有東西時仍然畫標題：它同時是
                      * 收合的把手，而且「這些是不是已經 add 了」本來就要看得出來。
                      */}
                    <div className={wOpen ? "" : "hidden"}>
                      {(["index", "worktree"] as WipSide[]).map((side) => {
                        const files = sections.get(w.path)?.[side] ?? [];
                        if (!files.length) return null;
                        const secKey = `${w.path}:sec:${side}`;
                        const secOpen = !collapsed.has(secKey);
                        const open = (file: ChangedFile) =>
                          openFile({
                            worktree: w.path, worktreeName: w.name, repo: r.repo, file, side,
                          });
                        const isSelected = (file: ChangedFile) =>
                          selected?.worktree === w.path &&
                          selected.side === side &&
                          selected.file.path === file.path;
                        return (
                          <div key={side}>
                            <Tooltip side="left" label={SIDE_DESC[side]}>
                              <button
                                onClick={() => toggleCollapsed(secKey)}
                                className="flex w-full items-center gap-1 whitespace-nowrap py-1 pl-6 pr-4 text-left text-[11px] font-medium text-gray-500 hover:text-gray-800"
                              >
                                <Icon
                                  name={secOpen ? "chevronDown" : "chevronRight"}
                                  size={12}
                                  className="shrink-0 text-gray-400"
                                />
                                {SIDE_TITLE[side]}
                                <span className="font-normal text-gray-400">{files.length}</span>
                              </button>
                            </Tooltip>
                            <div className={secOpen ? "" : "hidden"}>
                              {view === "list"
                                ? files.map((f) => (
                                    <FileRow
                                      key={f.path}
                                      file={f}
                                      label="path"
                                      // 區塊標題自己縮了一層，底下的檔案要再縮一層才看得出從屬
                                      depth={1}
                                      selected={isSelected(f)}
                                      onOpen={() => open(f)}
                                      trailing={<FileBadges file={f} />}
                                    />
                                  ))
                                : (
                                  <TreeRows
                                    nodes={trees.get(`${w.path}:${side}`) ?? []}
                                    depth={1}
                                    keyPrefix={`${w.path}:${side}`}
                                    collapsed={collapsed}
                                    onToggle={toggleCollapsed}
                                    selectedPath={
                                      selected?.worktree === w.path && selected.side === side
                                        ? selected.file.path
                                        : null
                                    }
                                    onOpen={open}
                                    extras={(f) => ({ trailing: <FileBadges file={f} /> })}
                                  />
                                )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          </div>
          </div>
        </div>

        {/* 拖這裡改左欄寬度 */}
        <DragHandle handleProps={listPane.handleProps} />

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
                {/* 同一個檔案在兩區看到的 diff 不一樣，一定要標出現在看的是哪一邊 */}
                <span className="shrink-0 font-mono text-[11px] text-gray-400">
                  {SIDE_DESC[selected.side]}
                </span>
              </div>

              {diffLoading ? (
                <p className="px-4 py-6 text-sm text-gray-400">讀取中…</p>
              ) : diff?.error ? (
                <p className="px-4 py-6 text-sm text-red-600">{diff.error}</p>
              ) : diff?.image ? (
                <ImageDiffView
                  // 換檔案就重建，狀態（尺寸、滑桿位置）跟著歸零
                  key={`${selected.worktree}:${selected.side}:${selected.file.path}`}
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
                  // 未追蹤的檔案整份都是新的，沒有「更多上下文」可言
                  loadLines={
                    selected.file.kind === "untracked"
                      ? undefined
                      : (from, to) =>
                          fetchDiffLines(
                            selected.worktree,
                            selected.file.path,
                            // staged 那側的行號指的是索引的內容，不是工作區的
                            selected.side === "index" ? ":" : "",
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
 * 只有這一頁要的兩個小標：只改模式、部分 staged。
 *
 * 清單已經分成 Staged／Changes 兩區，所以**只標「部分 staged」** —— 「staged」三個字
 * 是區塊標題講過的廢話，但部分 staged 的檔案兩區都會出現，不標會看起來像重複列。
 */
function FileBadges({ file }: { file: ChangedFile }) {
  return (
    <>
      {file.modeOnly && <span className="shrink-0 text-[10px] text-gray-300">模式</span>}
      <StageBadge file={file} onlyPartial />
    </>
  );
}

/**
 * 給 DiffView 抓「展開更多上下文」用的那幾行。
 *
 * rev 決定讀哪一版的新側：看單一 commit 是那個 sha，`":"` 是索引裡那一版
 * （Staged Changes 區塊），其餘（HEAD→工作區、base→工作區）都是工作區現在的檔案，
 * 所以是空字串。
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
