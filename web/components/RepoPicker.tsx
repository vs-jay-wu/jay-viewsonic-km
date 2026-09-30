"use client";

import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import Tooltip from "@/components/Tooltip";
import WorktreeBadge from "@/components/WorktreeBadge";
import type { RepoList, RepoRow } from "@/components/useRepoList";
import { SORT_LABEL, sortDateLabel, type SortKey } from "@/lib/repoSortRules";

/**
 * 「先選一個 repo」那一步的清單：搜尋、本機／外接、pin、重新掃描。
 *
 * **主畫面就是清單，不是一句「選一個 repo。」** —— 唯一的入口藏在右上角一顆小
 * 藥丸時，看起來就像頁面壞了（Jay 2026-09-22 連兩次回報「請求都正常但東西出不來」）。
 * 標題寫出數量，所以「真的一個都抓不到」這件事看得見，不必開 devtools 猜。
 */
export default function RepoPicker({
  list,
  onPick,
  /**
   * 要不要把 worktree 也列成獨立的一列。
   *
   * 「先選 repository、再選 worktree」的兩層介面上要關掉（選取單位是 repo）；
   * 還沒分兩層的頁面要留著，否則會變成開不了 worktree。
   */
  showWorktrees = true,
}: {
  list: RepoList;
  onPick: (row: RepoRow) => void;
  showWorktrees?: boolean;
}) {
  const { rows, sort, setSort, loadingFirstCommit, externalMounted, rescanning, reload, togglePin, busyPin } = list;
  const [query, setQuery] = useState("");
  const [place, setPlace] = useState<"all" | "local" | "external">("all");

  const listed = useMemo(
    () => (showWorktrees ? rows : rows.filter((r) => !r.worktree)),
    [rows, showWorktrees]
  );

  const counts = useMemo(
    () => ({
      all: listed.length,
      local: listed.filter((r) => !r.external).length,
      external: listed.filter((r) => r.external).length,
    }),
    [listed]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return listed.filter(
      (r) =>
        (place === "all" || (place === "external") === r.external) &&
        (!q || `${r.name} ${r.keywords}`.toLowerCase().includes(q))
    );
  }, [listed, query, place]);

  return (
    <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-sm text-fg-muted">
          選一個 repository（
          {visible.length === listed.length ? listed.length : `${visible.length} / ${listed.length}`}
          {" "}個）
          <Tooltip label="重新掃描工作區">
            <button
              onClick={() => void reload(true)}
              disabled={rescanning}
              aria-label="重新掃描"
              className="text-fg-subtle hover:text-fg disabled:opacity-40"
            >
              <Icon name="refresh" size={14} className={rescanning ? "animate-spin" : ""} />
            </button>
          </Tooltip>
        </p>

        <div className="flex items-center gap-1 rounded-lg border border-line p-0.5 text-xs">
          {(
            [
              ["all", "全部"],
              ["local", "本機"],
              ["external", "外接"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setPlace(k)}
              className={`rounded-md px-2 py-1 ${
                place === k ? "bg-surface-selected text-fg" : "text-fg-muted hover:text-fg"
              }`}
            >
              {label}
              <span className="ml-1 text-fg-subtle">{counts[k]}</span>
            </button>
          ))}
        </div>
        {!externalMounted && (
          <span className="text-xs text-fg-subtle">外接碟沒掛載，只看得到本機的</span>
        )}

        <label className="flex items-center gap-1.5 text-xs text-fg-muted">
          排序
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-lg border border-line bg-surface px-2 py-1 text-xs text-fg outline-none focus:border-line-strong"
          >
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABEL[k]}
              </option>
            ))}
          </select>
          {loadingFirstCommit && (
            <Tooltip label="第一次要對每個 repository 跑一次 git log，之後就有快取了">
              <span className="flex items-center gap-1 text-fg-subtle">
                <Icon name="refresh" size={12} className="animate-spin" />
                算建立時間…
              </span>
            </Tooltip>
          )}
        </label>

        <div className="relative ml-auto w-full sm:w-72">
          <Icon
            name="search"
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋 repositories…"
            className="w-full rounded-lg border border-line py-1.5 pl-8 pr-2 text-xs outline-none focus:border-line-strong"
          />
        </div>
      </div>

      {listed.length === 0 ? (
        <p className="mt-3 text-sm text-fg-subtle">還在抓 repositories 清單…</p>
      ) : visible.length === 0 ? (
        <p className="mt-3 text-sm text-fg-subtle">沒有符合「{query}」的 repository。</p>
      ) : (
        <div className="mt-3 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((r) => (
            <Row key={r.dir} row={r} sort={sort} onPick={onPick} onPin={togglePin} busyPin={busyPin} />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  row,
  sort,
  onPick,
  onPin,
  busyPin,
}: {
  row: RepoRow;
  sort: SortKey;
  onPick: (row: RepoRow) => void;
  onPin: (row: RepoRow) => Promise<void>;
  busyPin: boolean;
}) {
  // 只有跟時間有關的排序才標日期 —— 其餘情況它只會讓名字更難掃
  const date = sortDateLabel(sort, row);
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-line pr-2 hover:bg-surface-raised">
      <Tooltip
        label={
          row.pinned
            ? "取消 pin"
            : row.worktree
              ? "pin 住這個 worktree（只影響它在這個 repo 裡的順序）"
              : "pin 住這個 repository（排到最前面）"
        }
      >
        <button
          onClick={() => void onPin(row)}
          disabled={busyPin}
          aria-label={row.pinned ? `取消 pin ${row.name}` : `pin ${row.name}`}
          className={`shrink-0 pl-2 ${row.pinned ? "text-pin" : "text-fg-disabled hover:text-pin"}`}
        >
          <Icon name="pin" size={12} />
        </button>
      </Tooltip>
      <button
        onClick={() => onPick(row)}
        className="flex min-w-0 flex-1 items-center gap-1.5 py-2 pl-1 text-left font-mono text-xs text-fg"
      >
        <span className="min-w-0 flex-1 truncate">{row.name}</span>
        {date && (
          <Tooltip label={date.title}>
            <span className="shrink-0 font-mono text-[11px] text-fg-subtle">{date.text}</span>
          </Tooltip>
        )}
        {row.worktree && <WorktreeBadge />}
        {row.external && (
          <Tooltip label="在外接碟上（offloaded）">
            <span className="shrink-0 text-fg-disabled">
              <Icon name="package" size={12} />
            </span>
          </Tooltip>
        )}
      </button>
    </div>
  );
}
