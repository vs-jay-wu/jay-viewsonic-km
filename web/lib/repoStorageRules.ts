/**
 * 「這個 repo 在本機還是外接碟、現在能不能搬」的判斷規則。
 *
 * 純函式，客戶端與 server 共用（不能把 `fs/promises` 帶進客戶端，見 web/AGENTS.md）。
 * 實際的搬移與 `local.workspace.json` 的維護都在 `scripts/repo-storage.py`，
 * 這裡只負責「按鈕要不要亮、亮起來寫什麼」。
 */

export type Placement = "local" | "external" | "both" | "absent";
export type MoveAction = "offload" | "restore";

export interface RepoStorage {
  name: string;
  org: string;
  placement: Placement;
  /** `local.workspace.json` 的 offloaded 清單有沒有這一筆 */
  listedOffloaded: boolean;
  /** excluded 清單（keystore 等），永遠不可搬 */
  excluded: boolean;
  /** 不為 null 就是「不能搬」，內容直接給人看 */
  protectedReason: string | null;
}

export interface StorageSnapshot {
  org: string;
  localPath: string;
  externalPath: string;
  externalMounted: boolean;
  /** 外接碟沒掛載時 placement 是**用清單推測**的，不是實際看到的 */
  externalKnown: boolean;
  externalVolume: string | null;
  repos: RepoStorage[];
}

export type JobState = "running" | "done" | "error";

export interface MoveJob {
  id: string;
  repo: string;
  org: string;
  action: MoveAction;
  state: JobState;
  startedAt: string;
  finishedAt?: string;
  totalBytes: number;
  copiedBytes: number;
  fileCount: number;
  message: string;
  error?: string;
}

export const PLACEMENT_LABEL: Record<Placement, string> = {
  local: "本機",
  external: "外接",
  both: "兩邊都有",
  absent: "未 clone",
};

export const ACTION_LABEL: Record<MoveAction, string> = {
  offload: "搬到外接",
  restore: "搬回本機",
};

export interface MoveContext {
  externalMounted: boolean;
  externalVolume: string | null;
  /** 同一時間只允許一個搬移 —— 兩個一起跑會同時改 local.workspace.json */
  busyWith: { repo: string; action: MoveAction } | null;
}

export interface MoveDecision {
  action: MoveAction | null;
  enabled: boolean;
  label: string;
  /** 不能按的原因；能按時是「按下去會發生什麼」 */
  reason: string;
}

/**
 * 這一列要顯示哪個動作、能不能按。
 *
 * 順序有意義：**擋下的理由由重到輕**，先講最根本的那個。
 * 例如 excluded 的 repo 就算外接碟沒掛載，也該顯示「禁止搬移」而不是「請接上硬碟」。
 */
export function moveDecision(repo: RepoStorage, ctx: MoveContext): MoveDecision {
  if (repo.protectedReason) {
    return { action: null, enabled: false, label: "不可搬移", reason: repo.protectedReason };
  }

  if (repo.placement === "both") {
    return {
      action: null,
      enabled: false,
      label: "需人工處理",
      reason: "本機與外接碟各有一份。程式不會自己刪任何一邊，請先確認要留哪一份。",
    };
  }

  if (repo.placement === "absent") {
    return {
      action: null,
      enabled: false,
      label: "未 clone",
      reason: "兩邊都沒有這個 repo，先 clone 下來才談得上搬移。",
    };
  }

  const action: MoveAction = repo.placement === "local" ? "offload" : "restore";
  const label = ACTION_LABEL[action];

  if (!ctx.externalMounted) {
    return {
      action,
      enabled: false,
      label,
      reason: `外接硬碟沒有掛載${ctx.externalVolume ? `（${ctx.externalVolume}）` : ""}，接上之後重新整理。`,
    };
  }

  if (ctx.busyWith) {
    const same = ctx.busyWith.repo === repo.name;
    return {
      action,
      enabled: false,
      label,
      reason: same
        ? "這個 repo 正在搬移中。"
        : `${ctx.busyWith.repo} 正在搬移中，一次只能搬一個（同時搬會撞到 local.workspace.json）。`,
    };
  }

  return {
    action,
    enabled: true,
    label,
    reason:
      action === "offload"
        ? "整個目錄搬到外接硬碟，並加進 local.workspace.json 的 offloaded 清單。"
        : "從外接硬碟搬回本機，並從 offloaded 清單移除。",
  };
}

/** 清單與實際狀態對不上的描述；一致就是 null。 */
export function driftOf(repo: RepoStorage, snapshot: { externalKnown: boolean }): string | null {
  if (repo.placement === "both") {
    return "本機與外接碟各有一份，offloaded 清單無法同時成立";
  }
  // 外接碟沒掛載時 placement 是從清單推測的，拿它去比對清單必然一致，沒有意義
  if (!snapshot.externalKnown) return null;
  if (repo.placement === "local" && repo.listedOffloaded) {
    return "清單說它在外接碟，實際在本機";
  }
  if (repo.placement === "external" && !repo.listedOffloaded) {
    return "實際在外接碟，但清單沒記";
  }
  return null;
}

export type StorageFilter = "all" | "local" | "external" | "absent";

export const STORAGE_FILTER_LABEL: Record<StorageFilter, string> = {
  all: "不限位置",
  local: "只看本機",
  external: "只看外接",
  absent: "只看未 clone",
};

export function matchesStorageFilter(
  placement: Placement | undefined,
  filter: StorageFilter
): boolean {
  if (filter === "all") return true;
  // 沒有儲存狀態資料的（repos-overview 有、兩個目錄都沒有）當成未 clone
  const p = placement ?? "absent";
  if (filter === "local") return p === "local" || p === "both";
  if (filter === "external") return p === "external" || p === "both";
  return p === "absent";
}

/** 進度百分比。總量還不知道（du 還沒跑完）時回 null，UI 要顯示不定長度的條。 */
export function progressPercent(job: MoveJob): number | null {
  if (job.state === "done") return 100;
  if (!job.totalBytes) return null;
  return Math.min(100, Math.round((job.copiedBytes / job.totalBytes) * 100));
}
