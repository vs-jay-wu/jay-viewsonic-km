"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { groupRepos } from "@/lib/repoGroupRules";

/**
 * 工作區的 repo 清單（本機 ＋ 外接），給「先選 repo」那一步用。
 *
 * 打的是 `/api/code/repos` 而不是 `/api/git/repos`：那支要對每個 repo 跑 5 個
 * git 指令（2.6 秒，有快取），而選 repo 只需要名字。外接那 327 個也是在這裡
 * 一起拿的（只 scandir，不跑 git）。
 */

export interface RepoRow {
  dir: string;
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
}

interface Brief {
  name: string;
  dir: string;
  worktreeOf: string | null;
  pinned: boolean;
  lastCommitAt: string | null;
  external?: boolean;
}

export interface RepoList {
  rows: RepoRow[];
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

  const reload = useCallback(async (fresh = false) => {
    if (fresh) setRescanning(true);
    try {
      const res = await fetch(`/api/code/repos${fresh ? "?fresh=1" : ""}`, { cache: "no-store" });
      const d = (await res.json()) as {
        local: Brief[];
        external: { dir: string; name: string }[];
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

  const rows = useMemo<RepoRow[]>(
    () => [
      // 本機的照主 repo 分組（worktree 收在它底下）；外接的不分組 —— 那條路徑不跑 git
      ...groupRepos(repos.filter((r) => !r.external)).flatMap((g) => [
        ...(g.main
          ? [{
              dir: g.main.dir, name: g.main.name, keywords: "",
              worktree: false, pinned: g.main.pinned, group: g.name, external: false,
            }]
          : []),
        ...g.worktrees.map((w) => ({
          dir: w.dir, name: w.name, keywords: g.name,
          worktree: true, pinned: w.pinned, group: g.name, external: false,
        })),
      ]),
      ...repos
        .filter((r) => r.external)
        .map((r) => ({
          dir: r.dir, name: r.name, keywords: "",
          worktree: false, pinned: r.pinned, group: r.name, external: true,
        })),
    ],
    [repos]
  );

  const togglePin = useCallback(
    async (row: RepoRow) => {
      setBusyPin(true);
      try {
        await fetch("/api/git/pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dir: row.dir }),
        });
        // pin 會改排序，而那支 API 有快取 —— 要最新的順序就得強制重掃
        await reload(true);
      } finally {
        setBusyPin(false);
      }
    },
    [reload]
  );

  return { rows, externalMounted, rescanning, reload, togglePin, busyPin };
}
