"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { groupRepos } from "@/lib/repoGroupRules";
import { needsFirstCommit, sortRepos, type SortKey } from "@/lib/repoSortRules";
import { emitPinChanged, onPinChanged } from "@/lib/pinEvents";

/**
 * 工作區的 repo 清單（本機 ＋ 外接），給「先選 repo」那一步用。
 *
 * 打的是 `/api/code/repos` 而不是 `/api/git/repos`：那支要對每個 repo 跑 5 個
 * git 指令（2.6 秒，有快取），而選 repo 只需要名字。外接那 327 個也是在這裡
 * 一起拿的（只 scandir，不跑 git）。
 */

export interface RepoRow {
  dir: string;
  /**
   * 跨機器通用的身分（`Viewsonic-EDU/ragdoll-cat`）。**網址一律用它**，
   * `dir` 只在同一台機器內部用 —— 見 `lib/repoRefRules.ts`。
   * 對不到任何 root 的極少數目錄會是 null，那種就沒辦法做可攜的連結。
   */
  ref: string | null;
  name: string;
  /** 搜尋時額外比對的字：worktree 帶上主 repo 名，這樣打 `mvbf` 也找得到它的分支 */
  keywords: string;
  /** 這一列是 linked worktree（不是主 checkout） */
  worktree: boolean;
  pinned: boolean;
  /** 分組的 key ＝ 主 repo 名 */
  group: string;
  /** 外接碟上的（offloaded）。不跑 git，所以沒有 worktree／分支資訊 */
  external: boolean;
  /** 最後一顆 commit（外接的沒有） */
  lastCommitAt: string | null;
  /** 第一顆 commit ＝ 專案何時開始。選到「建立時間」排序才會去算 */
  firstCommitAt: string | null;
}

interface Brief {
  name: string;
  dir: string;
  ref: string | null;
  worktreeOf: string | null;
  pinned: boolean;
  lastCommitAt: string | null;
  external?: boolean;
}

export interface RepoList {
  rows: RepoRow[];
  sort: SortKey;
  setSort: (k: SortKey) => void;
  /** 正在算第一顆 commit（第一次要 9 秒，之後走快取） */
  loadingFirstCommit: boolean;
  externalMounted: boolean;
  rescanning: boolean;
  /** `fresh` 會等 server 重新掃完（「重新掃描」按鈕要的是這個） */
  reload: (fresh?: boolean) => Promise<void>;
  /** pin／取消。傳哪一列就 pin 哪一列 —— worktree 的 pin 只管組內順序 */
  togglePin: (row: RepoRow) => Promise<void>;
  busyPin: boolean;
}

export function useRepoList(): RepoList {
  const [repos, setRepos] = useState<Brief[]>([]);
  const [externalMounted, setExternalMounted] = useState(true);
  const [rescanning, setRescanning] = useState(false);
  const [busyPin, setBusyPin] = useState(false);
  const [sort, setSort] = useState<SortKey>("default");
  const [firstCommit, setFirstCommit] = useState<Record<string, string | null>>({});
  const [loadingFirstCommit, setLoadingFirstCommit] = useState(false);

  const reload = useCallback(async (fresh = false) => {
    if (fresh) setRescanning(true);
    try {
      const res = await fetch(`/api/code/repos${fresh ? "?fresh=1" : ""}`, { cache: "no-store" });
      const d = (await res.json()) as {
        local: Brief[];
        external: { dir: string; ref: string | null; name: string }[];
        externalMounted: boolean;
      };
      setExternalMounted(d.externalMounted);
      setRepos([
        ...d.local,
        ...d.external.map((r) => ({
          ...r,
          worktreeOf: null,
          pinned: false,
          lastCommitAt: null,
          external: true,
        })),
      ]);
    } catch {
      // 抓不到就維持現狀，畫面上的數量（0）自己會說明
    } finally {
      setRescanning(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // 別的元件改了 pin（工作台的 header、Repo 總覽）也要跟上
  useEffect(() => onPinChanged(() => void reload()), [reload]);

  /**
   * 「建立時間」排序才需要第一顆 commit。那支 API **第一次要 9 秒**（475 個 repo
   * 各跑一次 git log），之後讀磁碟快取只要 130ms —— 所以用到才抓，而且抓過就留著。
   */
  useEffect(() => {
    if (!needsFirstCommit(sort) || Object.keys(firstCommit).length) return;
    setLoadingFirstCommit(true);
    fetch("/api/git/first-commit", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { firstCommitAt: Record<string, string | null> }) => setFirstCommit(d.firstCommitAt))
      .catch(() => undefined)
      .finally(() => setLoadingFirstCommit(false));
  }, [sort, firstCommit]);

  const grouped = useMemo<RepoRow[]>(
    () => [
      // 本機的照主 repo 分組（worktree 收在它底下）；外接的不分組 —— 那條路徑不跑 git
      ...groupRepos(repos.filter((r) => !r.external)).flatMap((g) => [
        ...(g.main
          ? [{
              dir: g.main.dir, ref: g.main.ref, name: g.main.name, keywords: "",
              worktree: false, pinned: g.main.pinned, group: g.name, external: false,
              lastCommitAt: g.main.lastCommitAt, firstCommitAt: firstCommit[g.main.dir] ?? null,
            }]
          : []),
        ...g.worktrees.map((w) => ({
          dir: w.dir, ref: w.ref, name: w.name, keywords: g.name,
          worktree: true, pinned: w.pinned, group: g.name, external: false,
          lastCommitAt: w.lastCommitAt, firstCommitAt: firstCommit[w.dir] ?? null,
        })),
      ]),
      ...repos
        .filter((r) => r.external)
        .map((r) => ({
          dir: r.dir, ref: r.ref, name: r.name, keywords: "",
          worktree: false, pinned: r.pinned, group: r.name, external: true,
          lastCommitAt: r.lastCommitAt, firstCommitAt: firstCommit[r.dir] ?? null,
        })),
    ],
    [repos, firstCommit]
  );

  /**
   * 排序在**分組之後**才做：分組負責「worktree 收在主 repo 底下」，這裡是把攤平
   * 之後的清單重排。工作台的清單不列 worktree（`showWorktrees={false}`），
   * 所以攤平沒差；有列的話 worktree 會跟著自己的日期排，那也合理。
   */
  const rows = useMemo(() => sortRepos(grouped, sort), [grouped, sort]);

  const togglePin = useCallback(
    async (row: RepoRow) => {
      setBusyPin(true);
      /*
       * **先在本地翻過來**：後面那次重抓要等 server 掃完（2.6 秒），
       * 中間沒有回饋的話按起來像沒反應（Jay 2026-09-23）。
       * 重抓回來的資料才是真相，樂觀更新只是把那 2.6 秒填起來。
       */
      setRepos((prev) =>
        prev.map((r) => (r.dir === row.dir ? { ...r, pinned: !r.pinned } : r))
      );
      try {
        await fetch("/api/git/pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dir: row.dir }),
        });
        emitPinChanged();
        // 不用 `fresh` —— pin 是在回應時疊上去的，走快取就已經是新的順序
        await reload();
      } finally {
        setBusyPin(false);
      }
    },
    [reload]
  );

  return { rows, sort, setSort, loadingFirstCommit, externalMounted, rescanning, reload, togglePin, busyPin };
}
