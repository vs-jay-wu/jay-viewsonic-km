/** 指派給我的單：型別與排序規則（純函式，客戶端也要用） */

/** 沒填 Project 欄位的歸在這一類（值由 scripts/my-tickets.py 產生，跟 vb-bugs 一致） */
export const UNCATEGORISED = "（未分類）";

export interface Person {
  name: string;
  /** 判斷「是不是我」一律用 accountId，名字會撞 */
  accountId: string;
}

export interface MyTicket {
  key: string;
  summary: string;
  status: string;
  statusCategory: string;
  priority: string;
  issueType: string;
  /** VB 的「Project」欄位（多選取第一個）—— 頁面照它分群 */
  product: string;
  assignee: Person;
  reporter: Person;
  /** 指派給我的（由抓取腳本用 accountId 比對後標記） */
  assignedToMe: boolean;
  updated: string | null;
  url: string;
}

export interface MyTicketsSnapshot {
  fetchedAt: string;
  fetchedAs: string;
  project: string;
  mode: "full" | "incremental";
  jql: string;
  cursor: string;
  lastFullSyncAt: string | null;
  fetchedCount: number;
  removedKeys: string[];
  issueCount: number;
  issues: MyTicket[];
  lastError?: string | null;
}

/** 進度分組。用實際查到的 VB 狀態名，跟 vbBugsRules 的分組表對齊 */
export const TICKET_GROUPS: { key: string; label: string; statuses: string[] }[] = [
  { key: "in_progress", label: "In Progress", statuses: ["進行中", "IN CODE REVIEW", "PR MERGED"] },
  { key: "verifying", label: "In QA",
    statuses: ["STAGE READY(READY FOR QA)", "TRACKING BY QA", "VERIFYING", "QA REJECT"] },
  { key: "todo", label: "To Do",
    statuses: ["READY FOR DEV", "BACKLOG", "待辦事項", "DISCOVERY/REFINEMENT"] },
  { key: "on_hold", label: "Pending", statuses: ["Pending", "Blocked"] },
];

const ORDER = new Map<string, number>(
  TICKET_GROUPS.flatMap((g, gi) => g.statuses.map((s) => [s, gi] as const))
);

/** 沒列在分組表裡的狀態排在最後（代表 VB 加了新狀態，要回來補） */
export function groupIndexOf(status: string): number {
  return ORDER.get(status) ?? TICKET_GROUPS.length;
}

export function groupKeyOf(status: string): string | null {
  const i = groupIndexOf(status);
  return i < TICKET_GROUPS.length ? TICKET_GROUPS[i].key : null;
}

/** 依「進度分組 → 最近更新」排。手上要做的事排在前面，擱置的墊底。 */
export function sortTickets(tickets: MyTicket[]): MyTicket[] {
  return [...tickets].sort((a, b) => {
    const ga = groupIndexOf(a.status);
    const gb = groupIndexOf(b.status);
    if (ga !== gb) return ga - gb;
    return (b.updated ?? "") < (a.updated ?? "") ? -1 : 1;
  });
}

// ─── 排序與過濾 ──────────────────────────────────────────────────────────────

/** 優先度由高到低，跟 VB Bug 總覽的欄位順序一致 */
export const PRIORITY_ORDER = ["Urgent", "Highest", "High", "Medium", "Low"];

export function priorityIndexOf(priority: string): number {
  const i = PRIORITY_ORDER.indexOf(priority);
  return i === -1 ? PRIORITY_ORDER.length : i;
}

/**
 * 「等別人」的狀態 —— 球不在我這裡，往後擺（Jay 2026-09-11：
 * 我 care 的是需要我注意的，不是我處理完的）。
 *
 * `QA REJECT` **不算**等別人：被打回來就是球又回到我這裡。
 */
export const WAITING_ON_OTHERS_STATUSES = [
  "IN CODE REVIEW", "PR MERGED", "STAGE READY(READY FOR QA)",
  "TRACKING BY QA", "VERIFYING", "PRODUCTION READY", "QA ACCEPTED",
];

/**
 * 「需要注意」的排序鍵，數字小的排前面：
 *
 *   0  指派給我、球在我這裡
 *   1  指派給我、擱置（Pending / Blocked）
 *   2  指派給我、等別人（review／QA／已 merge）
 *   3+ 指派給別人的，同樣的三段再排一次
 *
 * 也就是「指派給誰」是第一維、「球在誰那裡」是第二維。
 */
export function attentionRank(t: MyTicket): number {
  const mine = t.assignedToMe ? 0 : 3;
  if (WAITING_ON_OTHERS_STATUSES.includes(t.status)) return mine + 2;
  if (groupKeyOf(t.status) === "on_hold") return mine + 1;
  return mine;
}

export type TicketSort = "attention" | "progress" | "updated" | "updatedAsc" | "priority" | "key";

export const TICKET_SORTS: { key: TicketSort; label: string }[] = [
  { key: "attention", label: "需要注意" },
  { key: "progress", label: "進度分組" },
  { key: "updated", label: "最近更新" },
  { key: "updatedAsc", label: "最久沒動" },
  { key: "priority", label: "優先度" },
  { key: "key", label: "單號" },
];

const byUpdatedDesc = (a: MyTicket, b: MyTicket) =>
  (b.updated ?? "").localeCompare(a.updated ?? "");

/** 單號要照數字比，不然 VB-999 會排在 VB-1000 後面 */
function keyNum(key: string): number {
  const m = /-(\d+)$/.exec(key);
  return m ? Number(m[1]) : 0;
}

export function sortBy(tickets: MyTicket[], sort: TicketSort): MyTicket[] {
  const list = [...tickets];
  switch (sort) {
    case "attention":
      // 同一段裡照最近更新 —— 段內看得出哪張最近有動
      return list.sort((a, b) => attentionRank(a) - attentionRank(b) || byUpdatedDesc(a, b));
    case "updated":
      return list.sort(byUpdatedDesc);
    case "updatedAsc":
      return list.sort((a, b) => (a.updated ?? "").localeCompare(b.updated ?? ""));
    case "priority":
      // 同優先度時照最近更新，不然同一級的順序會看起來是亂的
      return list.sort(
        (a, b) => priorityIndexOf(a.priority) - priorityIndexOf(b.priority) || byUpdatedDesc(a, b)
      );
    case "key":
      return list.sort((a, b) => keyNum(b.key) - keyNum(a.key));
    case "progress":
      return sortTickets(list);
    default:
      return list.sort((a, b) => attentionRank(a) - attentionRank(b) || byUpdatedDesc(a, b));
  }
}

/**
 * 指派給誰的篩選。預設只看我的 —— 快照裡是 VB **所有**未完成的單（673 筆），
 * 別人的是背景資訊，要看的時候切過去或直接搜名字就好（不必挑人）。
 */
export type AssigneeFilter = "mine" | "others" | "unassigned" | "all";

export interface TicketView {
  query: string;
  sort: TicketSort;
  assignee: AssigneeFilter;
  /** 只看這些進度分組；空集合＝全部 */
  groups: string[];
  /** 只看這些優先度；空集合＝全部 */
  priorities: string[];
}

export const DEFAULT_VIEW: TicketView = {
  query: "", sort: "attention", assignee: "mine", groups: [], priorities: [],
};

/** 過濾＋排序一起做，讓畫面只呼叫一次（也讓這條路徑整段有測試守著） */
export function applyView(tickets: MyTicket[], view: TicketView): MyTicket[] {
  const filtered = tickets.filter((t) => {
    const hasAssignee = !!t.assignee?.accountId;
    if (view.assignee === "mine" && !t.assignedToMe) return false;
    // 「別人的」不含未指派 —— 未指派是「還沒人接」，不是別人手上
    if (view.assignee === "others" && (t.assignedToMe || !hasAssignee)) return false;
    if (view.assignee === "unassigned" && hasAssignee) return false;
    if (!matchesTicketQuery(t, view.query)) return false;
    if (view.groups.length) {
      const g = groupKeyOf(t.status);
      // 沒歸到分組的狀態在「有選分組」時一律不顯示 —— 它不屬於任何一個被選的
      if (!g || !view.groups.includes(g)) return false;
    }
    if (view.priorities.length && !view.priorities.includes(t.priority)) return false;
    return true;
  });
  return sortBy(filtered, view.sort);
}

export function matchesTicketQuery(t: MyTicket, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = `${t.key} ${t.summary} ${t.status} ${t.issueType} ${t.priority} `
    .concat(`${t.assignee?.name ?? ""} ${t.reporter?.name ?? ""}`)
    .toLowerCase();
  return terms.every((x) => hay.includes(x));
}

// ─── 議題類型的樣式（貼近 Jira）────────────────────────────────────────────
//
// Jira 的顏色慣例：漏洞紅、任務藍、故事綠、Spike 紫。**用名稱比對而不是 id**，
// 因為這個站是中文介面，回傳的是「漏洞」「任務」這種字（英文名也一起收，
// 之後若切回英文介面不會整排變成灰色）。

export interface IssueTypeStyle {
  icon: "bug" | "task" | "story" | "spike" | "ops";
  cls: string;
}

export function issueTypeStyle(issueType: string): IssueTypeStyle {
  const t = issueType.toLowerCase();
  if (t.includes("漏洞") || t.includes("bug")) return { icon: "bug", cls: "text-red-600" };
  if (t.includes("故事") || t.includes("story")) return { icon: "story", cls: "text-emerald-600" };
  if (t.includes("spike")) return { icon: "spike", cls: "text-violet-600" };
  if (t.includes("ops")) return { icon: "ops", cls: "text-amber-600" };
  return { icon: "task", cls: "text-sky-600" };
}

// ─── 依 Project 分群 ─────────────────────────────────────────────────────────

export interface TicketGroup {
  product: string;
  tickets: MyTicket[];
}

/**
 * 照 Jira 的「Project」欄位分群。單多的排前面，**未分類永遠墊底**
 * （那是資料沒填，不是一條產品線 —— 跟 VB Bug 總覽同一個處理）。
 * 群內順序由呼叫端先排好（applyView 已經排過）。
 */
export function groupByProduct(tickets: MyTicket[]): TicketGroup[] {
  const groups = new Map<string, MyTicket[]>();
  for (const t of tickets) {
    const key = t.product || UNCATEGORISED;
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }
  return [...groups.entries()]
    .map(([product, list]) => ({ product, tickets: list }))
    .sort((a, b) => {
      const ua = a.product === UNCATEGORISED;
      const ub = b.product === UNCATEGORISED;
      if (ua !== ub) return ua ? 1 : -1;
      return b.tickets.length - a.tickets.length;
    });
}

/**
 * 一次最多畫幾筆。
 *
 * 快照裡有 VB 全部未完成的單（實測 673 筆），「全部」直接畫下去會拖慢畫面，
 * 而且一頁看幾百筆本來也沒意義 —— 超過就提示用搜尋收斂。
 */
export const DISPLAY_CAP = 150;

export function capForDisplay<T>(list: T[], cap = DISPLAY_CAP): { shown: T[]; hidden: number } {
  return list.length <= cap
    ? { shown: list, hidden: 0 }
    : { shown: list.slice(0, cap), hidden: list.length - cap };
}
