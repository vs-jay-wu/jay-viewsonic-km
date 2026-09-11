/** 指派給我的單：型別與排序規則（純函式，客戶端也要用） */

export interface MyTicket {
  key: string;
  summary: string;
  status: string;
  statusCategory: string;
  priority: string;
  issueType: string;
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
  { key: "in_progress", label: "進行中", statuses: ["進行中", "IN CODE REVIEW", "PR MERGED"] },
  { key: "verifying", label: "待驗證",
    statuses: ["STAGE READY(READY FOR QA)", "TRACKING BY QA", "VERIFYING", "QA REJECT"] },
  { key: "todo", label: "待處理",
    statuses: ["READY FOR DEV", "BACKLOG", "待辦事項", "DISCOVERY/REFINEMENT"] },
  { key: "on_hold", label: "擱置", statuses: ["Pending", "Blocked"] },
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

export function matchesTicketQuery(t: MyTicket, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = `${t.key} ${t.summary} ${t.status} ${t.issueType} ${t.priority}`.toLowerCase();
  return terms.every((x) => hay.includes(x));
}
