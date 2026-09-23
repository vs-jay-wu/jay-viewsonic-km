/**
 * `/git` 的 repo 清單怎麼分組。純函式（客戶端用，有測試）。
 *
 * 同一個 repo 的 worktree 在檔案系統上是分開的目錄（`edu-droid-flutter-vb-2267`），
 * 攤平列出來時它們散在各處、而且看起來像不同的專案。**照主 repo 收在一起**
 * （Jay 2026-09-18）。
 *
 * **pin 分兩層**（Jay 2026-09-23）：
 * - pin **主 repo** → 那一組排到 repo 清單最前面，它的 worktree 跟著走。
 * - pin **worktree** → 只影響那個 repo 底下 worktree 的順序，**不會**把整組往上推。
 *
 * 之前是「成員有一個被 pin 就整組算 pin」。那在「選 repo → 再選 worktree」的
 * 兩層介面下會變得莫名其妙：你為了方便切換 pin 了一條分支，結果整個 repo
 * 跳到清單最上面，而 repo 清單那一層根本看不到你 pin 的是誰。
 */

export interface GroupableRepo {
  name: string;
  dir: string;
  /** 這是某個 repo 的 linked worktree 時，主 repo 的名字 */
  worktreeOf: string | null;
  pinned: boolean;
  lastCommitAt: string | null;
}

export interface RepoGroup<T extends GroupableRepo> {
  /** 主 repo 的名字 —— 也是分組的 key */
  name: string;
  /** 主 repo 本身。**可能是 null**：主 repo 被 offload 或不在掃描範圍時，
   *  只有 worktree 在清單裡（例如 `~/.mvb-worktrees/…`） */
  main: T | null;
  worktrees: T[];
  /** 整組有沒有被 pin ——「**主 repo** 被 pin」才算，worktree 的 pin 不往上傳染 */
  pinned: boolean;
  /** 組內最新的一次 commit —— 排序用 */
  latestAt: string | null;
}

/**
 * 分組並排序。
 *
 * - 組跟組之間：pin 了主 repo 的在最前面，其餘照組內最新的 commit 時間。
 * - 組**內**的 worktree：pin 過的在前面，其餘照最後 commit 時間。
 *
 * 主 repo 不在清單裡時（被 offload、或在掃描範圍外），退回「任一 worktree 被 pin
 * 就算整組 pin」—— 否則那種組**永遠沒辦法被 pin**，因為根本沒有主 repo 可以 pin。
 */
export function groupRepos<T extends GroupableRepo>(repos: T[]): RepoGroup<T>[] {
  const byName = new Map<string, RepoGroup<T>>();
  const take = (name: string): RepoGroup<T> => {
    let g = byName.get(name);
    if (!g) {
      g = { name, main: null, worktrees: [], pinned: false, latestAt: null };
      byName.set(name, g);
    }
    return g;
  };

  for (const r of repos) {
    const g = take(r.worktreeOf ?? r.name);
    if (r.worktreeOf) g.worktrees.push(r);
    else g.main = r;
    if (!g.latestAt || (r.lastCommitAt ?? "") > g.latestAt) g.latestAt = r.lastCommitAt;
  }

  for (const g of byName.values()) {
    // 主 repo 在 → 只看它；主 repo 不在 → 任一 worktree 被 pin 就算（否則這種組 pin 不了）
    g.pinned = g.main ? g.main.pinned : g.worktrees.some((w) => w.pinned);
    g.worktrees.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (a.lastCommitAt ?? "") < (b.lastCommitAt ?? "") ? 1 : -1;
    });
  }

  return [...byName.values()].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (a.latestAt ?? "") < (b.latestAt ?? "") ? 1 : -1;
  });
}

/**
 * 搜尋時要保留整組還是只留命中的？
 *
 * **命中主 repo 名就整組留下**（搜 `mvbf` 想看的是它全部的 worktree），
 * 否則只留命中的那幾個 worktree。
 */
export function filterGroups<T extends GroupableRepo>(
  groups: RepoGroup<T>[],
  query: string
): RepoGroup<T>[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  const out: RepoGroup<T>[] = [];
  for (const g of groups) {
    if (g.name.toLowerCase().includes(q)) {
      out.push(g);
      continue;
    }
    const worktrees = g.worktrees.filter((w) => w.name.toLowerCase().includes(q));
    const mainHit = g.main?.name.toLowerCase().includes(q) ?? false;
    if (worktrees.length || mainHit) {
      out.push({ ...g, worktrees, main: mainHit ? g.main : null });
    }
  }
  return out;
}
