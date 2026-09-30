"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { rememberView, type RepoView as View } from "@/lib/repoViewPref";
import { emitPinChanged } from "@/lib/pinEvents";
import Icon from "@/components/Icon";
import Tooltip from "@/components/Tooltip";
import WorktreeBadge from "@/components/WorktreeBadge";
import SearchSelect, { type SearchOption } from "@/components/SearchSelect";
import { useConfirm } from "@/components/Confirm";
import { useToast } from "@/components/Toast";
import RepoPicker from "@/components/RepoPicker";
import { useRepoList } from "@/components/useRepoList";
import CodeView from "@/components/CodeView";
import GitView from "@/components/GitView";

/**
 * Repo 工作台：先選 repository → 再選 worktree → 切「檔案／版本」兩個視圖。
 *
 * **選取的單位是 repo，不是 checkout**（Jay 2026-09-23）：清單上一個 repo 一列，
 * 選完直接進它的主 checkout，要看別的 worktree 用麵包屑第二顆下拉切 ——
 * 多數時候看的就是主 checkout，不該為此多一次點擊。
 *
 * 網址：`/repo/code` 與 `/repo/git`，`?dir=<worktree 路徑>`，其餘參數屬於各自的
 * 視圖（`sha`／`file`／`side` 是版本視圖的）。
 *
 * **兩個視圖是兩條路徑、不是 `?view=`**：側邊欄要分辨「現在在哪一個」就得讀
 * query，而 `useSearchParams` 會讓整個 `(km)` 群組的預渲染都需要 Suspense 邊界
 * （`npm run build` 實測會失敗）。分成兩條路徑也讓分頁標題能各自不同。
 */

interface Worktree {
  dir: string;
  name: string;
  branch: string | null;
  isMain: boolean;
  isSessionBound: boolean;
  pinned: boolean;
}

export default function RepoWorkbench({ view }: { view: View }) {
  const params = useSearchParams();
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const repoList = useRepoList();

  const dir = params.get("dir") ?? "";

  /**
   * 網址是唯一真相（`/code` 那個 bug 的教訓：state 與網址各存一份會對不起來，
   * 側邊欄導回 `/repo` 時畫面還停在上一個 repo）。
   *
   * 換 repo／worktree 時**把視圖自己的參數清掉** —— `sha`／`file` 指的是上一個
   * repo 的東西，帶過去會讀不到而且看起來像壞了。
   */
  const go = useCallback(
    (next: { dir?: string | null; view?: View }, keepViewParams = false) => {
      const url = new URLSearchParams(keepViewParams ? params.toString() : "");
      const d = next.dir === undefined ? dir : next.dir;
      if (d) url.set("dir", d);
      else url.delete("dir");
      const v = next.view ?? view;
      // 記住偏好：側邊欄的「Repo」下次會直接進這個視圖
      if (next.view) rememberView(next.view);
      const q = url.toString();
      router.replace(`/repo/${v}${q ? `?${q}` : ""}`, { scroll: false });
    },
    [params, router, dir, view]
  );

  /**
   * 目前開著的檔案也寫進網址 —— 重整、上一頁、把網址貼給自己看都要回到同一個檔
   * （Jay 2026-09-24：重整之後變回「選一個檔案」）。
   *
   * **用 `push` 不用 `replace`**：換檔案是一次導覽，上一頁要能回到剛剛那個檔
   * （Jay 2026-09-30）。
   *
   * ⚠️ **跟現在網址一樣就什麼都不做**：按上一頁回到 A 時，還原那條路徑會再
   * 呼叫一次 `openFile("A")`，沒有這個守衛就會再 push 一筆一模一樣的 A ——
   * 於是上一頁看起來像卡住（回到的還是 A）。
   */
  const setFile = useCallback(
    (p: string | null) => {
      if ((params.get("file") ?? "") === (p ?? "")) return;
      const url = new URLSearchParams(params.toString());
      if (p) url.set("file", p);
      else url.delete("file");
      const q = url.toString();
      router.push(`/repo/${view}${q ? `?${q}` : ""}`, { scroll: false });
    },
    [params, router, view]
  );

  // ── 這個 repo 有哪些 worktree ────────────────────────────────────────────
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [loadingWt, setLoadingWt] = useState(false);

  /**
   * 目前這個 dir 屬於哪一組。`dir` 可能是主 checkout，也可能是某個 worktree ——
   * 兩種都要能反查出「這是哪個 repo」，麵包屑才寫得出來。
   */
  const row = useMemo(() => repoList.rows.find((r) => r.dir === dir), [repoList.rows, dir]);
  const repoName = row?.group ?? worktrees.find((w) => w.isMain)?.name ?? "";

  const loadWorktrees = useCallback(async (d: string) => {
    setLoadingWt(true);
    try {
      const res = await fetch(`/api/git/worktrees?dir=${encodeURIComponent(d)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setWorktrees([]);
        return;
      }
      const j = (await res.json()) as { worktrees: Worktree[] };
      setWorktrees(j.worktrees);
    } catch {
      setWorktrees([]);
    } finally {
      setLoadingWt(false);
    }
  }, []);

  useEffect(() => {
    if (!dir) {
      setWorktrees([]);
      return;
    }
    void loadWorktrees(dir);
  }, [dir, loadWorktrees]);

  /**
   * 點 repo 清單上的一列 → 進它的**主 checkout**。
   *
   * 清單給的是 repo 的路徑（＝主 checkout），所以直接用就對了；
   * 那個 repo 有沒有 worktree 是進去之後才問的事。
   */
  const pickRepo = useCallback((d: string) => go({ dir: d }), [go]);

  const wtOptions = useMemo<SearchOption[]>(
    () =>
      worktrees.map((w) => ({
        value: w.dir,
        label: w.isMain ? `主要 · ${w.branch ?? "(detached)"}` : `${w.name} · ${w.branch ?? "(detached)"}`,
        keywords: `${w.name} ${w.branch ?? ""}`,
        hint: w.isMain ? undefined : <WorktreeBadge sessionBound={w.isSessionBound} />,
      })),
    [worktrees]
  );

  const current = worktrees.find((w) => w.dir === dir);

  /**
   * 外接碟上的 repo 只能讀。`row` 是從 repo 清單找的，但直接貼網址進來時清單
   * 可能還沒回來 —— 那時退回看路徑（外接的路徑在 `/Volumes/` 底下）。
   * 兩個都只是**畫面上要不要出現按鈕**；真正的把關在 server（`resolveRepo`）。
   */
  const external = row?.external ?? dir.startsWith("/Volumes/");

  const togglePinWorktree = useCallback(async () => {
    if (!current) return;
    // 先在本地翻過來 —— 後面的重抓要等 server 掃完，中間沒有回饋會像沒反應
    setWorktrees((prev) =>
      prev.map((w) => (w.dir === current.dir ? { ...w, pinned: !w.pinned } : w))
    );
    await fetch("/api/git/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dir: current.dir }),
    });
    emitPinChanged(); // 側邊欄的「已 pin」要跟著動
    await loadWorktrees(dir);
  }, [current, dir, loadWorktrees]);

  /**
   * 移除一個 linked worktree。**這是這頁唯一會刪東西的動作**，所以一定跳確認，
   * 而且文案要講清楚失去什麼（工作區）與保留什麼（分支與 commit）。
   * 不提供 `--force` —— 有未提交改動時讓 git 擋下來是刻意的。
   */
  const removeWorktree = useCallback(async () => {
    if (!current || current.isMain) return;
    const ok = await confirm({
      title: `移除 worktree ${current.name}？`,
      message:
        `會刪掉這個工作目錄。分支與 commit 都還在，之後可以重新 git worktree add 回來。\n\n` +
        `裡面若有未提交的改動或未追蹤的檔案，git 會擋下來不刪 —— 那些東西刪掉就沒了。`,
      danger: true,
    });
    if (!ok) return;
    const res = await fetch("/api/git/worktree", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dir: current.dir }),
    });
    const json = (await res.json()) as { ok?: boolean; summary?: string; detail?: string };
    if (!res.ok || !json.ok) {
      toast({ ok: false, text: json.detail?.split("\n").pop() || json.summary || "刪不掉" });
      return;
    }
    toast({ ok: true, text: `${current.name}：${json.summary}` });
    // 刪掉的正是目前開著的那個 —— 回到主 checkout
    const main = worktrees.find((w) => w.isMain);
    go({ dir: main?.dir ?? null });
    await repoList.reload(true);
  }, [current, confirm, toast, worktrees, go, repoList]);

  if (!dir) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <Header view={view} onView={(v) => go({ view: v }, true)} showSwitch={false} />
        {/* 選取單位是 repo，所以 worktree 不列成獨立的一列 —— 進去之後再選 */}
        <RepoPicker list={repoList} onPick={pickRepo} showWorktrees={false} />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Header
        view={view}
        onView={(v) => go({ view: v }, true)}
        showSwitch
        left={
          <>
            <Tooltip label="回到 repositories 清單">
              <button
                onClick={() => go({ dir: null })}
                className="flex items-center gap-1.5 font-mono text-sm font-medium text-fg hover:text-accent"
              >
                <Icon name="chevronRight" size={14} className="rotate-180 text-fg-subtle" />
                {repoName || "…"}
              </button>
            </Tooltip>
            <SearchSelect
              ariaLabel="選 worktree"
              value={dir}
              onChange={(d) => go({ dir: d })}
              placeholder={loadingWt ? "讀取中…" : "搜尋 worktree…"}
              width={360}
              options={wtOptions}
            />
            {current && (
              <Tooltip
                label={current.pinned ? "取消 pin" : "pin 住這個 worktree（只影響它在這個 repo 裡的順序）"}
              >
                <button
                  onClick={() => void togglePinWorktree()}
                  aria-label={current.pinned ? "取消 pin" : "pin 這個 worktree"}
                  className={current.pinned ? "text-pin" : "text-fg-disabled hover:text-pin"}
                >
                  <Icon name="pin" size={13} />
                </button>
              </Tooltip>
            )}
            {current && !current.isMain && !external && (
              <Tooltip label="移除這個 worktree（會跳確認）">
                <button
                  onClick={() => void removeWorktree()}
                  aria-label="移除 worktree"
                  className="text-fg-disabled hover:text-danger"
                >
                  <Icon name="trash" size={13} />
                </button>
              </Tooltip>
            )}
          </>
        }
      />
      {view === "code" ? (
        <CodeView dir={dir} file={params.get("file") ?? ""} onFile={setFile} />
      ) : (
        <GitView dir={dir} writable={!external} />
      )}
    </div>
  );
}

/** 麵包屑那一列。切換鈕放右邊，跟 IDE 的 explorer ↔ source control 是同一個意思 */
function Header({
  view,
  onView,
  showSwitch,
  left,
}: {
  view: View;
  onView: (v: View) => void;
  showSwitch: boolean;
  left?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2 sm:px-6">
      {left ?? (
        <h1 className="flex items-center gap-2 text-lg font-semibold text-fg">
          <Icon name="repos" size={18} className="text-fg-subtle" />
          Repositories
        </h1>
      )}
      {showSwitch && (
        /*
         * 切換鈕**貼著麵包屑**，不是靠右對齊 —— 螢幕寬的時候右側離視線太遠
         * （Jay 2026-09-23），而它跟「你在看哪個 repo」是同一組資訊。
         */
        <div className="flex items-center gap-0.5 rounded-lg border border-line p-0.5">
          {(
            [
              ["code", "檔案", "code"],
              ["git", "版本", "repos"],
            ] as const
          ).map(([v, label, icon]) => (
            <Tooltip key={v} label={label}>
              <button
                onClick={() => onView(v)}
                aria-label={label}
                aria-pressed={view === v}
                className={`rounded-md px-2 py-1 ${
                  view === v ? "bg-surface-selected text-fg" : "text-fg-muted hover:text-fg"
                }`}
              >
                <Icon name={icon} size={14} />
              </button>
            </Tooltip>
          ))}
        </div>
      )}
    </div>
  );
}
