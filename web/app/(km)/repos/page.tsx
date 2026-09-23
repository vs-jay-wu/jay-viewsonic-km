"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import Tooltip from "@/components/Tooltip";
import { useConfirm } from "@/components/Confirm";
import { formatBytes } from "@/lib/buildDirRules";
import {
  DEFAULT_FILTERS, UNGROUPED, filterRepos, groupByProduct,
  type RepoEntry, type ReposOverview,
} from "@/lib/reposOverviewRules";
import {
  PLACEMENT_LABEL, STORAGE_FILTER_LABEL, driftOf, matchesStorageFilter,
  moveDecision, progressPercent,
  type MoveAction, type MoveContext, type MoveJob, type RepoStorage,
  type StorageFilter, type StorageSnapshot,
} from "@/lib/repoStorageRules";

interface Payload {
  overview: ReposOverview;
  fileModifiedAt: string | null;
}

interface StoragePayload {
  snapshots: StorageSnapshot[];
  job: MoveJob | null;
  error?: string;
}

const GITHUB_ORG = "Viewsonic-EDU";

/**
 * overview 列得出來、但本機與外接碟都沒有的 repo（從來沒 clone 過）。
 * 腳本只回報「看得到的目錄」，所以這種要在這裡補一筆，
 * 不然那些列會什麼標記都沒有，看起來像還沒載入完。
 */
function absentEntry(name: string, snapshot: StorageSnapshot) {
  return {
    storage: {
      name,
      org: snapshot.org,
      placement: "absent" as const,
      listedOffloaded: false,
      excluded: false,
      protectedReason: null,
    },
    snapshot,
  };
}
/** 搬移進行中的輪詢間隔。進度本身是 3 秒 du 一次算出來的，再密也沒有新資訊 */
const POLL_MS = 2000;

function githubUrl(repo: RepoEntry, org: string): string {
  // Jay 自己的 repo 掛在個人帳號底下，不在 org 裡
  const owner = repo.org?.toLowerCase().includes("self") ? "vs-jay-wu" : org;
  return `https://github.com/${owner}/${repo.name}`;
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "gray" | "sky" | "amber" }) {
  const cls = {
    gray: "border-line bg-surface-raised text-fg-muted",
    sky: "border-accent/50 bg-surface-selected text-accent",
    amber: "border-warn/40 bg-warn-bg text-warn",
  }[tone];
  return (
    <span className={`rounded-full border px-1.5 py-0.5 text-[11px] leading-none ${cls}`}>
      {children}
    </span>
  );
}

/**
 * 這個 repo 現在在哪。
 *
 * 四種狀態要**一眼分得出來**，所以差異放在「填滿程度」而不是顏色：
 * 在手邊的是實心深色、不在手邊的是虛線空心、完全沒有的連字都是淡的。
 * 顏色只留給真正的例外（兩邊都有 = 警告，照 AGENTS.md 琥珀色只給警告）。
 * 外接碟沒掛載時位置是**依清單推測**的，字尾加問號並改虛線更淡的樣式。
 */
const PLACEMENT_STYLE: Record<RepoStorage["placement"], string> = {
  local: "border-control bg-control text-on-solid",
  external: "border-dashed border-line-strong bg-surface text-fg-muted",
  both: "border-warn/40 bg-warn/30 text-warn",
  absent: "border-dotted border-line bg-surface text-fg-disabled",
};

const PLACEMENT_ICON: Record<RepoStorage["placement"], "cpu" | "hardDrive" | "alert" | "x"> = {
  local: "cpu",
  external: "hardDrive",
  both: "alert",
  absent: "x",
};

function PlacementChip({ storage, known }: { storage: RepoStorage; known: boolean }) {
  const guessed = !known && storage.placement === "external";
  const label = PLACEMENT_LABEL[storage.placement] + (guessed ? "？" : "");
  return (
    <Tooltip
      label={
        guessed
          ? "外接硬碟沒掛載，這是依 offloaded 清單推測的，不是實際看到的"
          : `實際位置：${PLACEMENT_LABEL[storage.placement]}`
      }
    >
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-medium leading-none ${
          PLACEMENT_STYLE[storage.placement]
        } ${guessed ? "opacity-60" : ""}`}
      >
        <Icon name={PLACEMENT_ICON[storage.placement]} size={10} />
        {label}
      </span>
    </Tooltip>
  );
}

function MoveProgress({ job }: { job: MoveJob }) {
  const pct = progressPercent(job);
  return (
    <div className="mt-2 rounded-lg border border-line bg-surface-raised px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-fg-muted">
        <Icon name="spinner" size={12} className="animate-spin text-fg-subtle" />
        <span>{job.action === "offload" ? "搬往外接硬碟" : "搬回本機"}</span>
        <span className="ml-auto tabular-nums text-fg-muted">
          {pct === null
            ? "計算大小中…"
            : `${pct}%　${formatBytes(job.copiedBytes)} / ${formatBytes(job.totalBytes)}`}
        </span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-sunken">
        <div
          className={`h-full bg-control/80 transition-all duration-500 ${pct === null ? "w-1/4 animate-pulse" : ""}`}
          style={pct === null ? undefined : { width: `${pct}%` }}
        />
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-fg-muted">
        複製完會逐檔比對，對得起來才刪來源 —— 中途失敗不會掉資料。
      </p>
    </div>
  );
}

function RepoRow({
  repo, org, storage, snapshot, ctx, job, onMove, pinned, busyPin, onPin,
}: {
  repo: RepoEntry;
  org: string;
  storage: RepoStorage | undefined;
  snapshot: StorageSnapshot | undefined;
  ctx: MoveContext;
  job: MoveJob | null;
  onMove: (repo: RepoStorage, action: MoveAction) => void;
  pinned: string[];
  busyPin: boolean;
  onPin: (dir: string) => void;
}) {
  /*
   * 這一列的實際路徑。**要跟 placement 一致**：搬到外接的 repo 本機沒有那個
   * 目錄，拿本機路徑去 pin 會被 API 擋掉（它會檢查路徑存不存在）。
   * `both` 的情況以本機為準 —— 那是你實際會打開的那一份。
   */
  const dir =
    storage && snapshot
      ? `${storage.placement === "external" ? snapshot.externalPath : snapshot.localPath}/${storage.name}`
      : null;
  const isPinned = !!dir && pinned.includes(dir);
  const decision = storage ? moveDecision(storage, ctx) : null;
  const drift = storage && snapshot ? driftOf(storage, snapshot) : null;
  const activeJob =
    job && job.state === "running" && storage && job.repo === storage.name ? job : null;

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {dir && (
          <Tooltip label={isPinned ? "取消 pin" : "pin 住這個 repo（工作台與側邊欄都會排到前面）"}>
            <button
              onClick={() => onPin(dir)}
              disabled={busyPin}
              aria-label={isPinned ? `取消 pin ${repo.name}` : `pin ${repo.name}`}
              className={`shrink-0 ${isPinned ? "text-pin" : "text-fg-disabled hover:text-pin"}`}
            >
              <Icon name="pin" size={12} />
            </button>
          </Tooltip>
        )}
        <a
          href={githubUrl(repo, org)}
          target="_blank"
          rel="noreferrer"
          className="group inline-flex items-center gap-1 font-mono text-sm text-fg hover:underline"
        >
          {repo.name}
          <Icon name="external" size={12} className="text-fg-disabled group-hover:text-fg-muted" />
        </a>
        {repo.archived && <Chip tone="amber">已封存</Chip>}
        {repo.type && <Chip>{repo.type}</Chip>}
        {repo.org && <Chip>{repo.org}</Chip>}
        {storage && snapshot && (
          <PlacementChip storage={storage} known={snapshot.externalKnown} />
        )}
        {repo.hostPrefix && (
          <Tooltip label="部署的 host 前綴">
            <span className="font-mono text-[11px] text-fg-subtle">{repo.hostPrefix}.*</span>
          </Tooltip>
        )}

        {/* 搬移按鈕靠右。位置固定，不隨其他 chip 數量位移 */}
        {storage && decision && (
          <div className="ml-auto">
            {decision.action === null || !decision.enabled ? (
              <Tooltip label={decision.reason}>
                <span className="inline-flex cursor-default items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] text-fg-subtle">
                  <Icon
                    name={storage.protectedReason ? "lock" : decision.action ? "clock" : "alert"}
                    size={11}
                  />
                  {decision.label}
                </span>
              </Tooltip>
            ) : (
              <Tooltip label={decision.reason}>
                <button
                  onClick={() => onMove(storage, decision.action as MoveAction)}
                  className="inline-flex items-center gap-1 rounded-lg border border-line-strong px-2 py-1 text-[11px] text-fg hover:border-line-strong hover:bg-surface-raised"
                >
                  <Icon name={decision.action === "offload" ? "toBottom" : "toTop"} size={11} />
                  {decision.label}
                </button>
              </Tooltip>
            )}
          </div>
        )}
      </div>

      {drift && (
        <div className="mt-1.5 flex items-start gap-1.5 rounded-lg border border-warn/40 bg-warn-bg px-2 py-1 text-[11px] leading-relaxed text-warn">
          <Icon name="alert" size={11} className="mt-0.5" />
          <span>{drift}</span>
        </div>
      )}

      {activeJob && <MoveProgress job={activeJob} />}

      {(repo.aliases?.length ?? 0) > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <span className="text-[11px] text-fg-subtle">別名</span>
          {repo.aliases!.map((a) => <Chip key={a}>{a}</Chip>)}
        </div>
      )}

      <p className="mt-1 text-xs leading-relaxed text-fg-muted">{repo.description}</p>

      {((repo.tech?.length ?? 0) > 0 || (repo.dependencies?.length ?? 0) > 0) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {repo.tech?.map((t) => <Chip key={t} tone="sky">{t}</Chip>)}
          {repo.dependencies?.map((d) => (
            <Tooltip key={d.repo} label={d.note ?? "依賴"}>
              <span className="inline-flex items-center gap-1 rounded-full border border-line px-1.5 py-0.5 text-[11px] leading-none text-fg-muted">
                <Icon name="chevronRight" size={10} className="text-fg-subtle" />
                {d.repo}
              </span>
            </Tooltip>
          ))}
        </div>
      )}
    </li>
  );
}

export default function ReposPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [storageFilter, setStorageFilter] = useState<StorageFilter>("all");
  /** 手動收合的群組。未歸類預設就是收的 —— 那一組有一百多個，展開會蓋掉其他產品 */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set([UNGROUPED]));

  const [storage, setStorage] = useState<StoragePayload | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const confirm = useConfirm();
  /**
   * pin 住的路徑。這頁的資料沒有路徑（只有 name ＋ org），所以要自己拼
   * `localPath/name`（外接的是 `externalPath/name`）—— 跟 repo-storage 的
   * placement 一致才 pin 得到對的那一份。
   */
  const [pinned, setPinned] = useState<string[]>([]);
  const [busyPin, setBusyPin] = useState(false);

  const loadPinned = useCallback(async () => {
    try {
      const d = (await (await fetch("/api/git/pin")).json()) as { pinned?: string[] };
      setPinned(d.pinned ?? []);
    } catch {
      /* 抓不到就當作沒有 pin，圖示留在灰色 */
    }
  }, []);

  useEffect(() => {
    void loadPinned();
  }, [loadPinned]);

  const togglePin = useCallback(
    async (dir: string) => {
      setBusyPin(true);
      try {
        await fetch("/api/git/pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dir }),
        });
        await loadPinned();
      } finally {
        setBusyPin(false);
      }
    },
    [loadPinned]
  );
  /** 上一次看到的工作狀態；用來偵測「剛剛從進行中變成結束」那一刻 */
  const lastJobState = useRef<string | null>(null);

  useEffect(() => {
    fetch("/api/repos-overview")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "讀取失敗");
        setData(j as Payload);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  /**
   * 讀儲存狀態，順便偵測「剛剛從進行中變成結束」那一刻。
   *
   * 偵測刻意做在這裡而不是 effect 裡：effect 裡再 setState 會被
   * `react-hooks/set-state-in-effect` 擋下，而且會多一輪 render。
   */
  const loadStorage = useCallback(async () => {
    let json: StoragePayload;
    try {
      const res = await fetch("/api/repo-storage");
      json = (await res.json()) as StoragePayload;
    } catch (e) {
      setStorage({ snapshots: [], job: null, error: (e as Error).message });
      return;
    }

    const was = lastJobState.current;
    const now = json.job;
    lastJobState.current = now?.state ?? null;
    if (was === "running" && now && now.state !== "running") {
      if (now.state === "done") {
        setNotice(now.message);
        setMoveError(null);
      } else {
        setMoveError(now.error ?? "搬移失敗");
      }
    }
    setStorage(json);
  }, []);

  useEffect(() => { void loadStorage(); }, [loadStorage]);

  // 搬移中才輪詢。停下來之後不再打 API —— 這個頁面常常開著沒在看
  const job = storage?.job ?? null;
  useEffect(() => {
    if (job?.state !== "running") return;
    const t = setInterval(() => { void loadStorage(); }, POLL_MS);
    return () => clearInterval(t);
  }, [job?.state, loadStorage]);

  const storageByName = useMemo(() => {
    const map = new Map<string, { storage: RepoStorage; snapshot: StorageSnapshot }>();
    for (const snap of storage?.snapshots ?? []) {
      for (const r of snap.repos) map.set(r.name, { storage: r, snapshot: snap });
    }
    return map;
  }, [storage]);

  const primary = storage?.snapshots[0];
  const ctx: MoveContext = useMemo(
    () => ({
      externalMounted: primary?.externalMounted ?? false,
      externalVolume: primary?.externalVolume ?? null,
      busyWith:
        job?.state === "running" ? { repo: job.repo, action: job.action } : null,
    }),
    [primary, job]
  );

  const startMove = async (target: RepoStorage, action: MoveAction) => {
    const toExternal = action === "offload";
    const ok = await confirm({
      title: toExternal ? `把 ${target.name} 搬到外接硬碟？` : `把 ${target.name} 搬回本機？`,
      message:
        `整個目錄會搬過去（含 .git 與未 commit 的改動），` +
        `並同步更新 local.workspace.json 的 offloaded 清單。\n` +
        `複製完成後會逐檔比對，對得起來才刪掉來源；比對不過就原地保留，不會掉資料。\n` +
        `大的 repo 走 USB 可能要好幾分鐘，過程中不要拔硬碟。`,
      confirmLabel: toExternal ? "搬到外接" : "搬回本機",
    });
    if (!ok) return;

    setNotice(null);
    setMoveError(null);
    const res = await fetch("/api/repo-storage/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo: target.name, org: target.org, action }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMoveError(json.error ?? "無法開始搬移");
      return;
    }
    setStorage((s) => (s ? { ...s, job: json.job as MoveJob } : s));
    lastJobState.current = "running";
  };

  const runReconcile = async (org: string) => {
    const ok = await confirm({
      title: "把 offloaded 清單對齊實際狀態？",
      message: "只會改 local.workspace.json，不搬任何檔案。",
      confirmLabel: "對齊清單",
    });
    if (!ok) return;
    setNotice(null);
    setMoveError(null);
    const res = await fetch("/api/repo-storage/reconcile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ org }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      setMoveError(json.error ?? "對齊失敗");
      return;
    }
    setNotice(json.message ?? "清單已對齊");
    await loadStorage();
  };

  const searching = filters.query.trim().length > 0;
  const groups = useMemo(() => {
    if (!data) return [];
    const byText = filterRepos(data.overview, filters);
    const byStorage = byText.filter((r) =>
      matchesStorageFilter(storageByName.get(r.name)?.storage.placement, storageFilter)
    );
    return groupByProduct(data.overview, byStorage);
  }, [data, filters, storageFilter, storageByName]);

  const shown = groups.reduce((n, g) => n + g.repos.length, 0);
  const total = data?.overview.repos.length ?? 0;

  const counts = useMemo(() => {
    let local = 0;
    let external = 0;
    for (const { storage: s } of storageByName.values()) {
      if (s.placement === "local" || s.placement === "both") local += 1;
      if (s.placement === "external" || s.placement === "both") external += 1;
    }
    return { local, external };
  }, [storageByName]);

  const driftCount = useMemo(() => {
    let n = 0;
    for (const { storage: s, snapshot } of storageByName.values()) {
      if (driftOf(s, snapshot)) n += 1;
    }
    return n;
  }, [storageByName]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-6 sm:px-8 sm:py-10">
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-fg">
          <Icon name="repos" size={22} className="text-fg-subtle" />
          Repos 總覽
        </h1>
        <p className="mt-1.5 text-sm text-fg-muted">
          {data?.overview._meta.description ?? "org 底下每個 repo 是做什麼的"}
          {data?.overview._meta.updated && `（內容標記更新於 ${data.overview._meta.updated}）`}
        </p>

        {error && (
          <div className="mt-6 flex items-start gap-2 rounded-xl border border-danger/40 bg-danger-bg px-4 py-3 text-sm text-danger">
            <Icon name="alert" size={15} className="mt-0.5" />
            <div>
              {error}
              <div className="mt-1 text-xs">這份檔案是手動維護的，不是排程產的。</div>
            </div>
          </div>
        )}

        {/* 儲存位置狀態列。高度固定，不隨掛載狀態變動 */}
        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-line px-4 py-2.5 text-xs text-fg-muted">
          <Icon
            name="hardDrive"
            size={14}
            className={primary?.externalMounted ? "text-fg-subtle" : "text-pin"}
          />
          {primary ? (
            <>
              <span>
                本機 <b className="font-semibold text-fg">{counts.local}</b>
                　外接 <b className="font-semibold text-fg">{counts.external}</b>
              </span>
              <span className="text-fg-disabled">·</span>
              <span className={primary.externalMounted ? "text-fg-muted" : "text-warn"}>
                {primary.externalMounted
                  ? `${primary.externalVolume ?? primary.externalPath} 已掛載`
                  : `外接硬碟未掛載${primary.externalVolume ? `（${primary.externalVolume}）` : ""}，位置只能依清單推測`}
              </span>
              {driftCount > 0 && (
                <>
                  <span className="text-fg-disabled">·</span>
                  <span className="text-warn">{driftCount} 筆清單與實際不符</span>
                  <button
                    onClick={() => void runReconcile(primary.org)}
                    className="rounded-lg border border-line-strong px-2 py-0.5 text-[11px] text-fg hover:border-line-strong hover:bg-surface-raised"
                  >
                    對齊清單
                  </button>
                </>
              )}
              <Link
                href="/repos/history"
                className="ml-auto inline-flex items-center gap-1 rounded-lg border border-line-strong px-2 py-0.5 text-[11px] text-fg hover:border-line-strong hover:bg-surface-raised"
              >
                <Icon name="clock" size={11} />
                搬遷紀錄
              </Link>
              <button
                onClick={() => void loadStorage()}
                className="inline-flex items-center gap-1 rounded-lg border border-line-strong px-2 py-0.5 text-[11px] text-fg hover:border-line-strong hover:bg-surface-raised"
              >
                <Icon name="refresh" size={11} />
                重新偵測
              </button>
            </>
          ) : (
            <span className="text-fg-subtle">偵測儲存位置中…</span>
          )}
        </div>

        {storage?.error && (
          <div className="mt-2 flex items-start gap-2 rounded-xl border border-warn/40 bg-warn-bg px-4 py-2.5 text-xs text-warn">
            <Icon name="alert" size={13} className="mt-0.5" />
            <span>{storage.error}</span>
          </div>
        )}
        {moveError && (
          <div className="mt-2 flex items-start gap-2 rounded-xl border border-danger/40 bg-danger-bg px-4 py-2.5 text-xs text-danger">
            <Icon name="alert" size={13} className="mt-0.5" />
            <span className="whitespace-pre-wrap">{moveError}</span>
          </div>
        )}
        {notice && (
          <div className="mt-2 flex items-start gap-2 rounded-xl border border-line bg-surface-raised px-4 py-2.5 text-xs text-fg-muted">
            <Icon name="check" size={13} className="mt-0.5 text-fg-subtle" />
            <span className="whitespace-pre-wrap">{notice}</span>
          </div>
        )}

        {/* 篩選列：高度固定，不隨結果變動（版面不要跳） */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[16rem]">
            <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input
              value={filters.query}
              onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
              placeholder="搜尋 repo 名、別名、用途、技術、host…"
              className="w-full rounded-lg border border-line-strong py-2 pl-9 pr-3 text-sm outline-none focus:border-line-strong"
            />
          </div>
          <select
            value={storageFilter}
            onChange={(e) => setStorageFilter(e.target.value as StorageFilter)}
            className="rounded-lg border border-line-strong px-2 py-2 text-xs text-fg outline-none focus:border-line-strong"
          >
            {(Object.keys(STORAGE_FILTER_LABEL) as StorageFilter[]).map((k) => (
              <option key={k} value={k}>{STORAGE_FILTER_LABEL[k]}</option>
            ))}
          </select>
          <label className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
            <input
              type="checkbox"
              checked={filters.showArchived}
              onChange={(e) => setFilters((f) => ({ ...f, showArchived: e.target.checked }))}
            />
            已封存
          </label>
          <label className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
            <input
              type="checkbox"
              checked={filters.showNonCode}
              onChange={(e) => setFilters((f) => ({ ...f, showNonCode: e.target.checked }))}
            />
            fork／keystore
          </label>
        </div>

        <div className="mt-2 h-4 text-xs text-fg-subtle">
          {data && `顯示 ${shown} / ${total} 個 repo · ${groups.length} 條產品線`}
        </div>

        {/* 產品分組 */}
        <div className="mt-4 space-y-3">
          {data && groups.length === 0 && (
            <p className="rounded-xl border border-line px-4 py-8 text-center text-sm text-fg-subtle">
              沒有符合的 repo。試試別名（例如 <code>cs backend</code>、<code>learn-swift</code>）。
            </p>
          )}
          {groups.map((g) => {
            // 搜尋中一律展開 —— 收合起來會讓人以為沒找到
            const open = searching || !collapsed.has(g.key);
            return (
              <section key={g.key} className="rounded-xl border border-line">
                <button
                  onClick={() =>
                    setCollapsed((prev) => {
                      const next = new Set(prev);
                      if (next.has(g.key)) next.delete(g.key);
                      else next.add(g.key);
                      return next;
                    })
                  }
                  disabled={searching}
                  className="flex w-full items-start gap-2.5 px-4 py-3 text-left disabled:cursor-default"
                >
                  <Icon
                    name={open ? "chevronDown" : "chevronRight"}
                    size={15}
                    className="mt-0.5 text-fg-subtle"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-fg">{g.fullName}</span>
                      <span className="text-xs text-fg-subtle">{g.repos.length}</span>
                      {g.aliases?.slice(0, 4).map((a) => <Chip key={a}>{a}</Chip>)}
                    </div>
                    {g.description && (
                      <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{g.description}</p>
                    )}
                  </div>
                </button>
                {open && (
                  <ul className="divide-y divide-line border-t border-line">
                    {g.repos.map((r) => {
                      const entry =
                        storageByName.get(r.name) ??
                        (primary ? absentEntry(r.name, primary) : undefined);
                      return (
                        <RepoRow
                          key={r.name}
                          repo={r}
                          org={data?.overview._meta.organization ?? GITHUB_ORG}
                          storage={entry?.storage}
                          snapshot={entry?.snapshot}
                          ctx={ctx}
                          job={job}
                          onMove={(s, a) => void startMove(s, a)}
                          pinned={pinned}
                          busyPin={busyPin}
                          onPin={(dir) => void togglePin(dir)}
                        />
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
