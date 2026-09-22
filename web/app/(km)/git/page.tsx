"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import Tooltip from "@/components/Tooltip";
import { useConfirm } from "@/components/Confirm";
import { useResolvedTheme } from "@/components/useResolvedTheme";
import { useToast } from "@/components/Toast";
import CommitGraph, { type WipSide } from "@/components/CommitGraph";
import DiffView from "@/components/DiffView";
import WorktreeBadge from "@/components/WorktreeBadge";
import ImageDiffView from "@/components/ImageDiffView";
import { ViewToggle, useFileView } from "@/components/FileList";
import SearchSelect, { type SearchOption } from "@/components/SearchSelect";
import { filterGroups, groupRepos } from "@/lib/repoGroupRules";
import { DragHandle, useDragWidth, useWideLayout } from "@/components/Split";
import {
  hljsHref, resolveDiffTheme, type DiffThemePref, type Theme,
} from "@/lib/uiSettingsRules";
import { buildTree, type ChangedFile, type DiffLine, type TreeNode } from "@/lib/changesRules";
import type { ImageSides } from "@/lib/changes";
import {
  layoutGraph, mergeCommitPage, pushPlan,
  type Branch, type Commit, type RepoHead,
} from "@/lib/gitViewRules";

/**
 * Repo 檢視：commit 歷史、分支、HEAD、graph。
 *
 * **唯讀，唯二的動作是 fetch 與 push**（Jay 2026-09-16：「不要有 checkout」）。
 * 目的是「不用開 IDE 或 CLI 就看得到現況」，實際要動的事都由 AI 在 CLI 做。
 * 加東西之前先問一次：這顆按鈕會不會改到工作區？會的話就不該出現在這裡。
 */

interface RepoBrief {
  name: string;
  dir: string;
  head: RepoHead;
  ahead: number | null;
  behind: number | null;
  dirty: number;
  worktrees: number;
  lastCommitAt: string | null;
  worktreeOf: string | null;
  pinned: boolean;
}

interface CommitInfo {
  message: string;
  files: ChangedFile[];
}

interface DiffPayload {
  lines: DiffLine[];
  truncated: boolean;
  binary: boolean;
  image?: ImageSides;
  error?: string;
}

interface RepoDetail {
  name: string;
  dir: string;
  head: RepoHead;
  remotes: string[];
  branches: Branch[];
  commits: Commit[];
  hasMore: boolean;
  wip: ChangedFile[];
}

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86_400_000);
  if (d === 0) {
    const h = Math.floor(diff / 3_600_000);
    if (h === 0) return `${Math.max(1, Math.floor(diff / 60_000))} 分鐘前`;
    return `${h} 小時前`;
  }
  if (d === 1) return "昨天";
  if (d < 30) return `${d} 天前`;
  return new Date(iso).toISOString().slice(0, 10);
}

/** diff 欄的預設寬度（px）。repo 清單刻意固定寬，只有 commits ↔ diff 之間可以調 */
const DEFAULT_DIFF_W = 720;
/** 網址裡代表「未提交的改動」那一列 */
const WIP = "wip";
/** 分支選單最上面那一列（不屬於任何群組） */
const ALL_BRANCHES: SearchOption = { value: "--all", label: "全部分支", keywords: "all 全部" };

export default function GitPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const wide = useWideLayout();
  const rowRef = useRef<HTMLDivElement>(null);
  // 拖的是**右邊那一欄**，所以寬度是「這一列的右緣 − 滑鼠」
  const diffPane = useDragWidth({
    storageKey: "km.git.diffW",
    defaultWidth: DEFAULT_DIFF_W,
    min: 360,
    max: 1600,
    measure: (clientX) => (rowRef.current?.getBoundingClientRect().right ?? 0) - clientX,
  });
  const [repos, setRepos] = useState<RepoBrief[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<RepoDetail | null>(null);
  const [ref, setRef] = useState("--all");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  /** commit 清單捲動的是中欄本身，所以 IntersectionObserver 的 root 要綁它，不是 viewport */
  const centerPane = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  /**
   * 下一頁要從第幾顆開始。
   *
   * ⚠️ **不能拿 `commits.length` 當這個值**：去重之後長度會小於實際要過的位移，
   * 而某一頁若整頁都是看過的（分支被刪、`fetch --prune` 之後 graph 縮短就會這樣），
   * 長度根本不動 —— 下一輪又去要同一段，變成打不完的迴圈。
   * 這個游標一律照**伺服器回了幾顆**往前推，跟留下幾顆無關。
   */
  const nextSkip = useRef(0);
  /** `detail` 的鏡像：讓「這頁還算不算數」的判斷不必寫進 setState 的 updater 裡 */
  const detailRef = useRef<RepoDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [openCommit, setOpenCommit] = useState<string | null>(null);
  const [commitInfo, setCommitInfo] = useState<Record<string, CommitInfo>>({});
  /** 點檔案看 diff。用浮動抽屜而不是再切一欄 —— 版面不要因為開面板而位移（web/AGENTS.md） */
  /** `sha: null` ＝ 未提交那一列；`side` 是它的哪一區（索引／工作區） */
  const [diffFor, setDiffFor] = useState<
    { sha: string | null; file: ChangedFile; side?: WipSide } | null
  >(null);
  const [wipOpen, setWipOpen] = useState(false);
  const [flashSha, setFlashSha] = useState<string | null>(null);
  const [diff, setDiff] = useState<DiffPayload | null>(null);
  /** 使用者設的三態；深色目前只有這一頁吃得到（其餘鎖淺色，見 AppShell） */
  const [appTheme, setAppTheme] = useState<Theme>("system");
  const [diffPref, setDiffPref] = useState<DiffThemePref>("dark");
  // `follow` 要看實際解析出來的全域配色 —— `system` 只有瀏覽器知道答案
  const diffTheme = resolveDiffTheme(diffPref, useResolvedTheme(appTheme));
  const [view, switchView] = useFileView();
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());
  const [busyPin, setBusyPin] = useState(false);
  /** 網址還原只做一次 —— 之後重新掃描不該把當下選的東西蓋掉 */
  const restored = useRef(false);

  const loadRepos = useCallback(async () => {
    const res = await fetch("/api/git/repos", { cache: "no-store" });
    const d = (await res.json()) as { repos: RepoBrief[] };
    setRepos(d.repos);
    return d.repos;
  }, []);

  useEffect(() => {
    void loadRepos();
  }, [loadRepos]);

  const loadDetail = useCallback(async (dir: string, r: string) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ dir, ref: r });
      const res = await fetch(`/api/git/repo?${qs}`, { cache: "no-store" });
      const json = await res.json();
      setDetail(res.ok ? (json as RepoDetail) : null);
      // 換 repo／換分支就是一份新的 graph，游標跟著回到第一頁的尾端
      nextSkip.current = res.ok ? (json as RepoDetail).commits.length : 0;
      if (!res.ok) toast({ ok: false, text: json.error ?? "讀取失敗" });
    } finally {
      setLoading(false);
    }
    // toast 是 provider 裡 useCallback([]) 出來的，identity 穩定
  }, [toast]);

  useEffect(() => {
    if (selected) void loadDetail(selected, ref);
  }, [selected, ref, loadDetail]);

  useEffect(() => {
    detailRef.current = detail;
  }, [detail]);

  /**
   * 捲到接近底部就接著載下一頁 commit。
   *
   * 每次 `detail` 換掉就重建一個 observer —— 載完之後 sentinel 若還在畫面裡，
   * 重建的那個會立刻再觸發一次，自然接成連續載入（例如螢幕很高、一頁填不滿）。
   *
   * 位移看 `nextSkip`，不是 `commits.length`；理由見那個 ref 的註解。
   */
  useEffect(() => {
    const el = sentinel.current;
    const root = centerPane.current;
    if (!el || !root || !selected || !detail?.hasMore || loadingMore) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        io.disconnect(); // 這一頁回來之前不要再觸發
        void (async () => {
          setLoadingMore(true);
          try {
            const qs = new URLSearchParams({
              dir: selected,
              ref,
              commitsOnly: "1",
              skip: String(nextSkip.current),
            });
            const res = await fetch(`/api/git/repo?${qs}`, { cache: "no-store" });
            const json = await res.json();
            if (!res.ok) {
              toast({ ok: false, text: json.error ?? "載入更多失敗" });
              return;
            }
            const page = json.commits as Commit[];
            // 這一頁在路上時換了 repo／分支，或第一頁被重新載過 —— 整頁作廢，
            // 接上去會把兩棵不同的 graph 併在一起
            if (detailRef.current !== detail) return;
            // 游標在 updater 外面推：StrictMode 會把 updater 跑兩次，
            // 在裡面改 ref 會一次跳兩頁
            nextSkip.current += page.length;
            setDetail((prev) =>
              prev === detail
                ? {
                    ...prev,
                    commits: mergeCommitPage(prev.commits, page),
                    hasMore: page.length > 0 && (json.hasMore as boolean),
                  }
                : prev
            );
          } finally {
            setLoadingMore(false);
          }
        })();
      },
      // 離底部還有半個畫面就先要下一頁，捲到底時通常已經接上了
      { root, rootMargin: "400px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [detail, loadingMore, selected, ref, toast]);

  // 重整後把網址上的 repo／commit／檔案選回來
  useEffect(() => {
    if (restored.current || !repos.length) return;
    restored.current = true;
    const q = new URLSearchParams(window.location.search);
    const dir = q.get("repo");
    if (dir && repos.some((r) => r.dir === dir)) setSelected(dir);
  }, [repos]);

  const togglePin = async (dir: string) => {
    setBusyPin(true);
    try {
      await fetch("/api/git/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dir }),
      });
      await loadRepos();
    } finally {
      setBusyPin(false);
    }
  };

  /**
   * 移除一個 linked worktree。**這是這頁唯一會刪東西的動作**，所以：
   * 一定跳確認，而且確認文案要講清楚失去什麼（工作區）與保留什麼（分支與 commit）。
   * 不提供 `--force` —— 有未提交改動時讓 git 擋下來是刻意的（cross-repo-workflow §4
   * 講的就是「工作區的未 commit 改動不會留下」）。
   */
  const removeWorktree = async (dir: string, name: string) => {
    const ok = await confirm({
      title: `移除 worktree ${name}？`,
      message:
        `會刪掉這個工作目錄。分支與 commit 都還在，之後可以重新 git worktree add 回來。\n\n` +
        `裡面若有未提交的改動或未追蹤的檔案，git 會擋下來不刪 —— 那些東西刪掉就沒了。`,
      danger: true,
    });
    if (!ok) return;
    setBusyPin(true);
    try {
      const res = await fetch("/api/git/worktree", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dir }),
      });
      const json = (await res.json()) as { ok?: boolean; summary?: string; detail?: string };
      if (!res.ok || !json.ok) {
        toast({ ok: false, text: json.detail?.split("\n").pop() || json.summary || "刪不掉" });
        return;
      }
      toast({ ok: true, text: `${name}：${json.summary}` });
      // 刪掉的正好是選中的那個，畫面要跟著回到沒選的狀態
      if (selected === dir) {
        setSelected(null);
        setDetail(null);
        syncUrl({ dir: null, sha: null, file: null, side: null });
      }
      await loadRepos();
    } finally {
      setBusyPin(false);
    }
  };

  /** 照主 repo 分組：worktree 收在它底下，pin 是 pin 整組（Jay 2026-09-18） */
  const groups = useMemo(() => filterGroups(groupRepos(repos), query), [repos, query]);

  const graph = useMemo(() => layoutGraph(detail?.commits ?? []), [detail]);
  /** HEAD 有沒有出現在目前載入的這批 commit 裡 —— 切到別條分支時就不會有 */
  const headInView = useMemo(
    () => !!detail && detail.commits.some((c) => c.sha === detail.head.sha),
    [detail]
  );

  /** 分支選單。照 `/` 分層，所以這裡只給分支本身（「全部分支」釘在最上面） */
  const branchOptions = useMemo<SearchOption[]>(
    () =>
      (detail?.branches ?? []).map((b) => ({
        value: b.name,
        label: b.name,
        keywords: b.upstream ?? "",
        hint: (
          <span className="shrink-0 text-[10px]">
            {b.checkedOutAt && <span className="text-accent">●</span>}
            {b.ahead > 0 && <span className="ml-1 text-ok">↑{b.ahead}</span>}
            {b.behind > 0 && <span className="ml-1 text-warn">↓{b.behind}</span>}
            {b.remote && <span className="ml-1 text-fg-disabled">remote</span>}
          </span>
        ),
      })),
    [detail]
  );

  const doFetch = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      const res = await fetch("/api/git/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dir: detail.dir }),
      });
      const json = (await res.json()) as { ok: boolean; summary: string; detail?: string };
      // 標題就是結論（「3 條分支更新（12 個 commit）」），細節只列動到的分支
      toast({ ok: json.ok, text: `${detail.name}：${json.summary}`, detail: json.detail });
      await loadDetail(detail.dir, ref);
    } finally {
      setBusy(false);
    }
  };

  const doPush = async (b: Branch) => {
    if (!detail) return;
    const plan = pushPlan(b);
    if (!plan.ok) {
      toast({ ok: false, text: `${b.name} 推不了`, detail: plan.reason });
      return;
    }
    // push 會把東西送到外面，一定要先確認（`web/AGENTS.md`：不用原生 confirm）
    const okToPush = await confirm({
      title: `push ${b.name}？`,
      message: `${plan.reason}\n\n${detail.name} · git push ${plan.remote} ${plan.refspec}\n不會加 --force，也不會改上游設定。`,
    });
    if (!okToPush) return;
    setBusy(true);
    try {
      const res = await fetch("/api/git/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dir: detail.dir, branch: b.name }),
      });
      const json = (await res.json()) as { ok: boolean; summary: string; detail?: string };
      toast({ ok: json.ok, text: `${b.name}：${json.summary}`, detail: json.detail });
      await loadDetail(detail.dir, ref);
    } finally {
      setBusy(false);
    }
  };

  /** 選到的 repo／commit／檔案寫進網址（replace，不塞 history），重整才回得來 */
  const syncUrl = (next: {
    dir?: string | null; sha?: string | null; file?: string | null; side?: string | null;
  }) => {
    const url = new URL(window.location.href);
    const set = (k: string, v: string | null | undefined) => {
      if (v === undefined) return;
      if (v) url.searchParams.set(k, v);
      else url.searchParams.delete(k);
    };
    set("repo", next.dir);
    set("sha", next.sha);
    set("file", next.file);
    set("side", next.side);
    window.history.replaceState(null, "", url);
  };

  /**
   * 捲到 local HEAD 那一列（VS Code 那顆同心圓按鈕）。
   *
   * 用 `data-sha` 找元素而不是一路傳 ref 下去：中間隔著 CommitGraph 與它的子元件，
   * 為了捲一次畫面拉一條 ref 鏈不划算。跳完閃一下 —— 一百多列裡不閃的話會找不到。
   */
  const jumpToHead = () => {
    const sha = detail?.head.sha;
    if (!sha) return;
    const el = document.querySelector(`[data-sha="${sha}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setFlashSha(sha);
    window.setTimeout(() => setFlashSha(null), 1600);
  };

  const toggleCommit = async (sha: string) => {
    const opening = openCommit !== sha;
    setOpenCommit(opening ? sha : null);
    if (opening) setWipOpen(false);
    syncUrl({ sha: opening ? sha : null, file: null, side: null });
    if (!opening) setDiffFor(null);
    if (commitInfo[sha] || !detail) return;
    const qs = new URLSearchParams({ dir: detail.dir, sha });
    const res = await fetch(`/api/git/commit?${qs}`);
    if (!res.ok) return;
    const json = (await res.json()) as CommitInfo;
    setCommitInfo((m) => ({ ...m, [sha]: json }));
  };

  // 配色沿用設定頁那兩項
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((x: { theme?: Theme; diffTheme?: DiffThemePref }) => {
        if (x.theme === "light" || x.theme === "dark" || x.theme === "system") setAppTheme(x.theme);
        if (x.diffTheme) setDiffPref(x.diffTheme);
      })
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

  const closeDiff = () => {
    setDiffFor(null);
    // 網址裡的 file 也要清掉，不然重整又會把它開回來
    syncUrl({ file: null });
  };

  // 開著 diff 時按 Esc 收起來
  useEffect(() => {
    if (!diffFor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDiff();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // closeDiff 每次 render 都是新的函式，帶進來只會反覆重掛監聽
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diffFor]);

  const openFileDiff = async (sha: string | null, file: ChangedFile, side?: WipSide) => {
    if (!detail) return;
    setDiffFor({ sha, file, side });
    // 網址裡用 `wip` 這個字代表「未提交那一列」，重整才回得到同一個狀態
    syncUrl({ sha: sha ?? WIP, file: file.path, side: side ?? "" });
    setDiff(null);
    const qs = new URLSearchParams({
      worktree: detail.dir,
      file: file.path,
      from: file.from ?? "",
    });
    // 未提交的改動比的是 HEAD → 工作區，沒有 sha；未追蹤的檔案 git diff 看不到
    if (sha) qs.set("sha", sha);
    else if (file.kind === "untracked") qs.set("untracked", "1");
    // 分區之後兩邊看的差異不同：index=`git diff --cached`／worktree=`git diff`
    else if (side) qs.set("side", side);
    try {
      const res = await fetch(`/api/changes/diff?${qs}`);
      const json = await res.json();
      setDiff(res.ok ? json : { lines: [], truncated: false, binary: false, error: json.error });
    } catch (e) {
      setDiff({ lines: [], truncated: false, binary: false, error: (e as Error).message });
    }
  };

  const pendingSha = useRef<string | null>(null);
  useEffect(() => {
    // detail 回來之後才有 commit 可以展開；`pendingSha` 只在第一次載入時有值
    if (!detail) return;
    const q = new URLSearchParams(window.location.search);
    const sha = pendingSha.current ?? q.get("sha");
    if (!sha) return;
    if (sha === WIP) {
      // 未提交那一列：沒有 sha 可以比對，直接展開（檔案清單已經在 detail 裡）
      if (wipOpen) return;
      setWipOpen(true);
      const wipFile = q.get("file");
      const f = detail.wip.find((x) => x.path === wipFile);
      const s = q.get("side");
      if (f) void openFileDiff(null, f, s === "index" || s === "worktree" ? s : undefined);
      return;
    }
    if (openCommit === sha) return;
    if (!detail.commits.some((c) => c.sha === sha)) return;
    pendingSha.current = null;
    void toggleCommit(sha);
    const file = q.get("file");
    if (file) {
      void fetch(`/api/git/commit?${new URLSearchParams({ dir: detail.dir, sha })}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((info: CommitInfo | null) => {
          const f = info?.files.find((x) => x.path === file);
          if (f) void openFileDiff(sha, f);
        })
        .catch(() => undefined);
    }
    // 只在 detail 換掉時還原一次；其餘 deps 每次 render 都是新的函式，帶進來會無限重跑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-fg">
            <Icon name="repos" size={18} className="text-fg-subtle" />
            Repo 檢視
          </h1>
          <span className="text-xs text-fg-subtle">
唯讀 —— 動到東西的只有 fetch、push 與移除 worktree，不做 checkout
          </span>
          {detail && (
            <div className="ml-auto flex items-center gap-2">
              <Tooltip label={`git fetch --prune --all（只更新遠端追蹤 ref，不動工作區）`}>
                <button
                  onClick={() => void doFetch()}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-1.5 text-xs text-fg hover:bg-surface-raised disabled:opacity-50"
                >
                  <Icon name="toBottom" size={13} />
                  fetch
                </button>
              </Tooltip>
            </div>
          )}
        </div>
      </div>

      <div ref={rowRef} className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* repo 清單。寬度固定 —— Jay 2026-09-16：只有 commits ↔ diff 之間要能調 */}
        <div
          className={`flex min-h-0 flex-col border-line lg:w-72 lg:shrink-0 lg:border-r ${
            selected ? "hidden lg:flex" : "flex-1"
          }`}
        >
          <div className="shrink-0 border-b border-line p-2">
            <div className="relative">
              <Icon name="search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`搜尋 ${repos.length} 個 repo…`}
                className="w-full rounded-lg border border-line-strong py-1.5 pl-8 pr-2 text-xs outline-none focus:border-line-strong"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {groups.map((g) => {
              const pinTarget = g.main ?? g.worktrees[0];
              /*
               * 沒有 worktree 的 repo 不畫組標題 —— 那一列除了掛 pin 之外只是把
               * 同一個名字再寫一次，卻要你多看一列才找得到真正能點的那一列
               * （Jay 2026-09-22）。這種情況把 pin 直接放到唯一那一列上。
               */
              const flat = g.worktrees.length === 0;
              return (
                <div key={g.name} className="border-b border-line last:border-0">
                  {!flat && (
                  <div className="flex items-center gap-1.5 bg-surface-raised px-2 py-1">
                    <Tooltip label={g.pinned ? "取消 pin（整組）" : "pin 住這個 repo（worktree 會跟著排到前面）"}>
                      <button
                        onClick={() => pinTarget && void togglePin(pinTarget.dir)}
                        disabled={busyPin || !pinTarget}
                        className={g.pinned ? "text-pin" : "text-fg-disabled hover:text-pin"}
                        aria-label={g.pinned ? `取消 pin ${g.name}` : `pin ${g.name}`}
                      >
                        <Icon name="pin" size={12} />
                      </button>
                    </Tooltip>
                    <span className="truncate font-mono text-[11px] font-medium text-fg">
                      {g.name}
                    </span>
                    {g.worktrees.length > 0 && (
                      <Tooltip label={`${g.worktrees.length} 個 worktree`}>
                        <span className="shrink-0 text-[10px] text-fg-subtle">
                          +{g.worktrees.length}
                        </span>
                      </Tooltip>
                    )}
                    {!g.main && (
                      <Tooltip label="主 repo 不在掃描範圍內（被 offload，或在工作區之外）">
                        <span className="shrink-0 text-[10px] text-fg-disabled">主 repo 不在</span>
                      </Tooltip>
                    )}
                  </div>
                  )}

                  {[...(g.main ? [g.main] : []), ...g.worktrees].map((r) => (
                    <div key={r.dir} className="flex items-stretch">
                    {flat && (
                      <Tooltip label={g.pinned ? "取消 pin" : "pin 住這個 repo（排到最前面）"}>
                        <button
                          onClick={() => pinTarget && void togglePin(pinTarget.dir)}
                          disabled={busyPin || !pinTarget}
                          className={`shrink-0 pl-2 ${g.pinned ? "text-pin" : "text-fg-disabled hover:text-pin"}`}
                          aria-label={g.pinned ? `取消 pin ${g.name}` : `pin ${g.name}`}
                        >
                          <Icon name="pin" size={12} />
                        </button>
                      </Tooltip>
                    )}
                    <button
                      onClick={() => {
                        setSelected(r.dir);
                        setRef("--all");
                        setOpenCommit(null);
                        setDiffFor(null);
                        syncUrl({ dir: r.dir, sha: null, file: null });
                      }}
                      className={`flex w-full flex-col gap-0.5 py-1.5 pr-2 text-left hover:bg-surface-raised ${
                        flat ? "pl-1.5" : "pl-3"
                      } ${selected === r.dir ? "bg-surface-selected" : ""}`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-mono text-xs text-fg">
                          {/* 組標題已經有主 repo 名，worktree 只顯示後綴 */}
                          {r.worktreeOf && r.name.startsWith(`${g.name}-`)
                            ? r.name.slice(g.name.length + 1)
                            : r.name}
                        </span>
                        {r.worktreeOf && <WorktreeBadge />}
                      </span>
                      <span className="flex items-center gap-2 text-[11px] text-fg-subtle">
                        <span className="truncate font-mono">
                          {r.head.branch ?? `(detached ${r.head.sha.slice(0, 8)})`}
                        </span>
                        {(r.ahead ?? 0) > 0 && <span className="text-ok">↑{r.ahead}</span>}
                        {(r.behind ?? 0) > 0 && <span className="text-warn">↓{r.behind}</span>}
                        {r.dirty > 0 && (
                          <Tooltip label={`${r.dirty} 個未提交的改動`}>
                            <span className="text-fg-muted">●{r.dirty}</span>
                          </Tooltip>
                        )}
                        <span className="ml-auto shrink-0">{relTime(r.lastCommitAt)}</span>
                      </span>
                    </button>
                    {/* 只有 linked worktree 能刪；主 repo 沒有這顆。
                        只有圖示一定要包 Tooltip（web/AGENTS.md），而且這顆會刪東西 */}
                    {r.worktreeOf && (
                      <Tooltip side="left" label={`移除 worktree ${r.name}（分支會留著）`}>
                        <button
                          onClick={() => void removeWorktree(r.dir, r.name)}
                          disabled={busyPin}
                          aria-label={`移除 worktree ${r.name}`}
                          className="shrink-0 px-2 text-fg-disabled hover:text-danger disabled:opacity-40"
                        >
                          <Icon name="trash" size={12} />
                        </button>
                      </Tooltip>
                    )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* 一個 repo 的內容。**橫向可捲**，右邊開 diff 時就靠它讓出空間 */}
        <div
          ref={centerPane}
          className={`min-h-0 flex-1 overflow-auto ${selected ? "" : "hidden lg:block"}`}
        >
          {!detail ? (
            <p className="px-6 py-10 text-sm text-fg-subtle">
              {loading ? "讀取中…" : "選一個 repo。"}
            </p>
          ) : (
            <div className="min-w-[56rem]">
              {/* `min-w-[56rem]`：欄位寬度固定，窄於這個寬度就讓中欄自己橫捲
                  （右邊開 diff 時就會這樣），而不是把 sha／作者／日期擠掉 */}
              <div className="sticky top-0 z-10 border-b border-line bg-surface px-4 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setSelected(null)}
                    className="text-fg-subtle hover:text-fg lg:hidden"
                    aria-label="回到清單"
                  >
                    <Icon name="chevronRight" size={16} className="rotate-180" />
                  </button>
                  <span className="font-mono text-sm font-medium text-fg">{detail.name}</span>
                  <Tooltip label={detail.head.detached ? "HEAD 沒有指著任何分支" : "HEAD 指著這條分支"}>
                    <span className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">
                      HEAD → {detail.head.branch ?? detail.head.sha.slice(0, 8)}
                    </span>
                  </Tooltip>
                  <span className="ml-auto" />
                  {detail.wip.length > 0 && (
                    <Tooltip label="展開最上面那一列看未提交的改動">
                      <button
                        onClick={() => {
                          setWipOpen(true);
                          setOpenCommit(null);
                          syncUrl({ sha: WIP, file: null });
                        }}
                        className="rounded-full border border-dashed border-line-strong px-1.5 py-0.5 text-[11px] text-fg-muted hover:bg-surface-raised"
                      >
                        {detail.wip.length} 個未提交
                      </button>
                    </Tooltip>
                  )}
                  <Tooltip
                    label={
                      headInView
                        ? `跳到 HEAD（${detail.head.branch ?? detail.head.sha.slice(0, 8)}）`
                        : "HEAD 不在目前這批 commit 裡（換個分支或載入更多）"
                    }
                  >
                    <button
                      onClick={jumpToHead}
                      disabled={!headInView}
                      aria-label="跳到 HEAD"
                      className="rounded p-1 text-fg-subtle hover:bg-surface-sunken hover:text-fg disabled:opacity-30"
                    >
                      <Icon name="target" size={15} />
                    </button>
                  </Tooltip>
                  <Tooltip label="fetch">
                    <button
                      onClick={() => void doFetch()}
                      disabled={busy}
                      aria-label="fetch"
                      className="rounded p-1 text-fg-subtle hover:bg-surface-sunken hover:text-fg disabled:opacity-40"
                    >
                      {/* 箭頭朝下＝東西拉進來，跟 push 的 toTop 剛好成對 */}
                      <Icon name="toBottom" size={15} />
                    </button>
                  </Tooltip>
                  <ViewToggle view={view} onChange={switchView} />
                  <SearchSelect
                    ariaLabel="選分支"
                    value={ref}
                    onChange={setRef}
                    placeholder="搜尋分支…"
                    width={340}
                    grouped
                    pinned={[ALL_BRANCHES]}
                    options={branchOptions}
                  />
                </div>
              </div>

              <BranchList branches={detail.branches} busy={busy} onPush={doPush} />

              <div className="px-2 py-2">
                <div className="px-2 pb-1 text-[11px] text-fg-subtle">
                  {ref === "--all" ? "全部分支" : ref} · {detail.commits.length} 個 commit
                </div>
                <CommitGraph
                  commits={detail.commits}
                  graph={graph}
                  openSha={openCommit}
                  info={commitInfo}
                  onToggle={toggleCommit}
                  onOpenFile={openFileDiff}
                  view={view}
                  collapsedDirs={collapsedDirs}
                  onToggleDir={(key) =>
                    setCollapsedDirs((prev) => {
                      const next = new Set(prev);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    })
                  }
                  openFile={
                    diffFor
                      ? { sha: diffFor.sha, path: diffFor.file.path, side: diffFor.side }
                      : null
                  }
                  flashSha={flashSha}
                  wip={{
                    files: detail.wip,
                    open: wipOpen,
                    onToggle: () => {
                      const next = !wipOpen;
                      setWipOpen(next);
                      setOpenCommit(null);
                      syncUrl({ sha: next ? WIP : null, file: null });
                      if (!next) setDiffFor(null);
                    },
                  }}
                />
                {/* 高度固定的一列：捲到它就載下一頁。文字換不換都不改變高度，
                    所以載入前後版面不會跳（web/AGENTS.md） */}
                <div
                  ref={sentinel}
                  className="flex h-8 items-center justify-center text-[11px] text-fg-subtle"
                >
                  {loadingMore ? "載入更多…" : detail.hasMore ? "" : "已經到最早的 commit"}
                </div>
              </div>
            </div>
          )}
        </div>

      {/* 檔案 diff：同一列的第三欄（Jay 2026-09-16：不要浮動）。
          它出現時中欄會變窄，中欄自己橫捲，欄位不會被擠掉 */}
      {diffFor && detail && <DragHandle handleProps={diffPane.handleProps} />}
      {diffFor && detail && (
        <div
          style={wide ? { width: diffPane.width, flex: "0 0 auto" } : undefined}
          className="flex min-h-0 w-full flex-col border-l border-line bg-surface"
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2">
            <span className="font-mono text-xs text-fg-muted">{detail.name}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg">
              {diffFor.file.path}
            </span>
            <span className="shrink-0 font-mono text-[11px] text-fg-subtle">
              {diffFor.sha
                ? `commit ${diffFor.sha.slice(0, 8)}`
                : diffFor.side === "index"
                  ? "已 staged（HEAD → 索引，commit 會帶走）"
                  : diffFor.side === "worktree"
                    ? "未 staged（索引 → 工作區，commit 不會帶走）"
                    : "未提交（HEAD → 工作區）"}
            </span>
            <Tooltip side="left" label="關閉（Esc）">
              <button
                onClick={closeDiff}
                className="shrink-0 text-fg-subtle hover:text-fg"
                aria-label="關閉 diff"
              >
                <Icon name="x" size={16} />
              </button>
            </Tooltip>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {!diff ? (
              <p className="px-4 py-6 text-sm text-fg-subtle">讀取中…</p>
            ) : diff.error ? (
              <p className="px-4 py-6 text-sm text-danger">{diff.error}</p>
            ) : diff.image ? (
              <ImageDiffView
                key={`${diffFor.sha ?? WIP}:${diffFor.file.path}`}
                worktree={detail.dir}
                file={diffFor.file.path}
                oldPath={diff.image.oldPath}
                oldRev={diff.image.oldRev}
                newRev={diff.image.newRev}
                oldBytes={diff.image.oldBytes}
                newBytes={diff.image.newBytes}
                theme={diffTheme}
                source={
                  diff.binary ? undefined : (
                    <DiffView lines={diff.lines} file={diffFor.file.path} truncated={diff.truncated} theme={diffTheme} />
                  )
                }
              />
            ) : diff.binary ? (
              <p className="px-4 py-6 text-sm text-fg-subtle">二進位檔，不顯示內容。</p>
            ) : (
              <DiffView
                lines={diff.lines}
                file={diffFor.file.path}
                truncated={diff.truncated}
                theme={diffTheme}
                loadLines={
                  diffFor.file.kind === "untracked"
                    ? undefined
                    : (from, to) =>
                        fetchDiffLines(detail.dir, diffFor.file.path, diffFor.sha ?? "", from, to)
                }
              />
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

/**
 * 分支清單，**照 `/` 分層收合**（Jay 2026-09-17）。
 *
 * `Jay/VB-2267-…`、`Jay/VB-2164-…` 會收在一個 `Jay` 底下，一次展開或收起。
 * ragdoll-cat 有 103 條分支，攤平根本讀不了。
 *
 * 樹是拿 `buildTree` 建的（跟檔案清單同一支，有測試）——分支名本來就是路徑形狀，
 * 連「只有一條路的層要壓成一行」都是同一個道理（`origin/jay/window-…` 併成一列）。
 */
function BranchList({
  branches,
  busy,
  onPush,
}: {
  branches: Branch[];
  busy: boolean;
  onPush: (b: Branch) => void;
}) {
  const local = branches.filter((b) => !b.remote);
  const remote = branches.filter((b) => b.remote);
  // 分支多的時候預設收起來（ragdoll-cat 有 104 條，攤開會把 graph 擠到畫面外）
  const [open, setOpen] = useState(branches.length <= 12);
  /** 被手動切換過的節點（存的是「跟預設相反」，不是「收起來」）*/
  const [toggled, setToggled] = useState<Set<string>>(new Set());

  const nodes = useMemo(
    () => buildTree(branches.map((b) => ({ ...b, path: b.name }))),
    [branches]
  );

  /** 現在簽出的那條分支，它的每一層祖先預設展開 —— 不然打開只看到一排資料夾 */
  const openByDefault = useMemo(() => {
    const at = branches.find((b) => b.checkedOutAt);
    if (!at) return new Set<string>();
    const parts = at.name.split("/");
    return new Set(parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/")));
  }, [branches]);

  const toggle = (key: string) =>
    setToggled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="border-b border-line px-4 py-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] text-fg-muted hover:text-fg"
      >
        <Icon name={open ? "chevronDown" : "chevronRight"} size={11} />
        分支（本地 {local.length} · 遠端 {remote.length}）
      </button>
      {open && (
        <div className="mt-1.5 max-h-52 overflow-auto pr-1">
          <BranchNodes
            nodes={nodes}
            depth={0}
            toggled={toggled}
            openByDefault={openByDefault}
            onToggle={toggle}
            busy={busy}
            onPush={onPush}
          />
        </div>
      )}
    </div>
  );
}

/** 一個節點底下有幾條分支（收起來時顯示的數字） */
function countLeaves(n: TreeNode<Branch & { path: string }>): number {
  return n.file ? 1 : n.children.reduce((sum, c) => sum + countLeaves(c), 0);
}

function BranchNodes({
  nodes,
  depth,
  toggled,
  openByDefault,
  onToggle,
  busy,
  onPush,
}: {
  nodes: TreeNode<Branch & { path: string }>[];
  depth: number;
  /** 被手動切換過的節點 —— 值的意思是「跟預設相反」 */
  toggled: Set<string>;
  openByDefault: Set<string>;
  onToggle: (key: string) => void;
  busy: boolean;
  onPush: (b: Branch) => void;
}) {
  return (
    <>
      {nodes.map((n) => {
        if (n.file) {
          const b = n.file;
          const plan = pushPlan(b);
          return (
            <div
              key={n.path}
              style={{ paddingLeft: depth * 12 }}
              className="flex items-center gap-2 text-[11px]"
            >
              <span
                className={`w-1.5 shrink-0 ${b.checkedOutAt ? "text-accent" : "text-transparent"}`}
                title={b.checkedOutAt ? `簽出在 ${b.checkedOutAt}` : undefined}
              >
                ●
              </span>
              <span className={`font-mono ${b.remote ? "text-fg-subtle" : "text-fg"}`}>
                {n.name}
              </span>
              {b.upstream && <span className="font-mono text-fg-disabled">→ {b.upstream}</span>}
              {b.ahead > 0 && <span className="text-ok">↑{b.ahead}</span>}
              {b.behind > 0 && <span className="text-warn">↓{b.behind}</span>}
              {!b.remote && !b.upstream && <span className="text-fg-disabled">沒有上游</span>}
              <span className="ml-auto shrink-0 text-fg-disabled">{relTime(b.date)}</span>
              {!b.remote && (
                <Tooltip side="left" label={plan.reason}>
                  <button
                    onClick={() => onPush(b)}
                    disabled={busy || !plan.ok}
                    className="shrink-0 text-fg-disabled hover:text-accent disabled:opacity-30"
                    aria-label={`push ${b.name}`}
                  >
                    <Icon name="toTop" size={13} />
                  </button>
                </Tooltip>
              )}
            </div>
          );
        }

        // 預設收起來，只有「現在簽出那條」的祖先預設展開；點過就反過來
        const byDefault = openByDefault.has(n.path);
        const expanded = toggled.has(n.path) ? !byDefault : byDefault;
        return (
          <div key={n.path}>
            <button
              onClick={() => onToggle(n.path)}
              style={{ paddingLeft: depth * 12 }}
              className="flex w-full items-center gap-1.5 py-px text-left text-[11px] text-fg-muted hover:text-fg"
            >
              <Icon
                name={expanded ? "chevronDown" : "chevronRight"}
                size={11}
                className="shrink-0 text-fg-subtle"
              />
              <span className="font-mono">{n.name}</span>
              <span className="text-fg-disabled">{countLeaves(n)}</span>
            </button>
            {expanded && (
              <BranchNodes
                nodes={n.children}
                depth={depth + 1}
                toggled={toggled}
                openByDefault={openByDefault}
                onToggle={onToggle}
                busy={busy}
                onPush={onPush}
              />
            )}
          </div>
        );
      })}
    </>
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
