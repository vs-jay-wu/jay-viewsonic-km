/**
 * VB Bug 總覽的純規則：狀態分組、優先度欄、聚合成矩陣、產品排序。
 *
 * 放在這裡（而不是抓取腳本裡）有兩個理由：
 * 1. 客戶端元件也要用，不能帶到 `fs/promises`（sessionRules 踩過）。
 * 2. 分組規則會隨 Jira 的狀態變動，放在有測試的地方才守得住。
 */

/** 產品欄位沒填的票會被歸到這一類（值由 scripts/vb-bugs.py 產生） */
export const UNCATEGORISED = "（未分類）";

export interface BugIssue {
  key: string;
  summary: string;
  status: string;
  statusCategory: string;
  priority: string;
  product: string;
  updated: string | null;
  url: string;
}

export interface PriorityCol { key: string; label: string; sub: string }
export interface StatusGroup { key: string; label: string; statuses: string[] }

/** 欄：沿用舊頁的五級與顯示名 */
export const PRIORITIES: PriorityCol[] = [
  { key: "Urgent", label: "P0", sub: "Urgent" },
  { key: "Highest", label: "P1", sub: "Highest" },
  { key: "High", label: "High P2", sub: "High" },
  { key: "Medium", label: "P2", sub: "Medium" },
  { key: "Low", label: "P3", sub: "Low" },
];

/**
 * 列：值是 **VB 實際查到的狀態名**，不是從舊的 VSFT 頁面搬過來的。
 * 舊頁的 `Open` 在 VB 不存在；`In Progress` 在 VB 是「進行中」；
 * `STAGE READY (READY FOR QA)` 在 VB 的括號前沒有空格；`PENDING` 是 `Pending`。
 */
export const STATUS_GROUPS: StatusGroup[] = [
  { key: "todo", label: "待處理",
    statuses: ["BACKLOG", "待辦事項", "READY FOR DEV", "DISCOVERY/REFINEMENT"] },
  { key: "in_progress", label: "進行中",
    statuses: ["進行中", "IN CODE REVIEW", "PR MERGED"] },
  { key: "verifying", label: "待驗證",
    statuses: ["STAGE READY(READY FOR QA)", "TRACKING BY QA", "VERIFYING", "QA REJECT"] },
  { key: "production_ready", label: "Production Ready",
    statuses: ["PRODUCTION READY", "QA ACCEPTED"] },
  { key: "on_hold", label: "擱置",
    statuses: ["Pending", "Blocked"] },
];

/** 預設收起來的那一列（Jay：對我意義不大，但保留功能） */
export const HIDDEN_BY_DEFAULT = "production_ready";

export interface BugCell { count: number; issues: BugIssue[] }
export interface BugProduct { name: string; total: number; cells: Record<string, BugCell> }
export interface Matrix {
  products: BugProduct[];
  /** 沒歸到任何一組的狀態；不是空的就代表 VB 加了新狀態，要回來補 STATUS_GROUPS */
  unmappedStatuses: Record<string, number>;
}

const statusToGroup = new Map<string, string>(
  STATUS_GROUPS.flatMap((g) => g.statuses.map((s) => [s, g.key] as const))
);
const priorityKeys = new Set(PRIORITIES.map((p) => p.key));

export function cellKey(groupKey: string, priorityKey: string): string {
  return `${groupKey}|${priorityKey}`;
}

/** 把扁平的票清單聚合成「產品 × 狀態分組 × 優先度」。 */
export function buildMatrix(issues: BugIssue[]): Matrix {
  const products = new Map<string, BugProduct>();
  const unmapped: Record<string, number> = {};

  for (const issue of issues) {
    const group = statusToGroup.get(issue.status);
    if (!group) {
      // 沒歸到組的要講出來，不要靜靜吞掉 —— 那代表分組表過期了
      unmapped[issue.status] = (unmapped[issue.status] ?? 0) + 1;
      continue;
    }
    const prio = priorityKeys.has(issue.priority) ? issue.priority : "Medium";
    const name = issue.product || UNCATEGORISED;

    let p = products.get(name);
    if (!p) {
      p = { name, total: 0, cells: {} };
      products.set(name, p);
    }
    const key = cellKey(group, prio);
    const cell = (p.cells[key] ??= { count: 0, issues: [] });
    cell.count++;
    cell.issues.push(issue);
    p.total++;
  }

  return { products: [...products.values()], unmappedStatuses: unmapped };
}

/**
 * pin 住的排前面（依 pin 的順序），其餘照總數由多到少，
 * 「（未分類）」永遠墊底 —— 那是資料沒填，不是一個產品。
 */
export function sortProducts<T extends { name: string; total: number }>(
  products: T[],
  pinned: string[]
): T[] {
  const tierOf = (p: T) => {
    if (pinned.includes(p.name)) return 0;
    return p.name === UNCATEGORISED ? 2 : 1;
  };
  return [...products].sort((a, b) => {
    const ta = tierOf(a), tb = tierOf(b);
    if (ta !== tb) return ta - tb;
    if (ta === 0) return pinned.indexOf(a.name) - pinned.indexOf(b.name);
    return b.total - a.total;
  });
}
