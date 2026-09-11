/** 工作項目索引的型別與排序規則（純函式，客戶端也要用） */

export interface IndexedSession {
  id: string;
  title: string;
  cwd: string;
  repo: string | null;
  modifiedAt: string;
  pinned: boolean;
}

export interface IndexedPr {
  repo: string;
  number: number;
  title: string;
  url: string;
  state: "OPEN" | "MERGED" | "CLOSED";
  updatedAt: string;
  reviewDecision: string | null;
}

export interface WorkItem {
  /** ticket key，或沒有單時的 `PR:<repo>#<number>` */
  key: string;
  ticketKey: string | null;
  /** key 是由裸數字猜出來的 —— UI 要標示，不要讓人以為是確定的 */
  ticketGuessed: boolean;
  sessions: IndexedSession[];
  prs: IndexedPr[];
  /** 底下任一 session／PR 的最後動靜 */
  latestAt: string;
}

export interface WorkIndex {
  builtAt: string;
  items: WorkItem[];
  sessionCount: number;
  /** 標題不符合慣例、掛不上任何工作項目的 session 數 */
  unlinkedSessions: number;
}

/** 有動靜的排前面。同分時有 PR 的優先（那通常是還在跑的工作） */
export function sortWorkItems(items: WorkItem[]): WorkItem[] {
  return [...items].sort((a, b) => {
    if (a.latestAt !== b.latestAt) return a.latestAt < b.latestAt ? 1 : -1;
    return b.prs.length - a.prs.length;
  });
}

/** 某個 session 掛在哪個工作項目底下（session 一次只會掛一個） */
export function findItemBySession<T extends WorkItem>(
  items: T[],
  sessionId: string
): T | undefined {
  return items.find((it) => it.sessions.some((s) => s.id === sessionId));
}

/**
 * PR 狀態的顯示樣式。
 *
 * 只有 OPEN 值得亮色 —— merged／closed 是「這件事過去了」，
 * 在 session 清單裡是背景資訊，不該跟未處理的東西搶注意力。
 */
export function prStateStyle(state: IndexedPr["state"]): { label: string; cls: string } {
  switch (state) {
    case "OPEN":
      return { label: "open", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" };
    case "MERGED":
      return { label: "merged", cls: "border-violet-200 bg-violet-50 text-violet-700" };
    default:
      return { label: "closed", cls: "border-gray-200 bg-gray-50 text-gray-500" };
  }
}

/** open 的 PR 上，review 的結論比狀態更有資訊量 */
export function prDecisionLabel(pr: IndexedPr): string | null {
  if (pr.state !== "OPEN") return null;
  if (pr.reviewDecision === "APPROVED") return "approved";
  if (pr.reviewDecision === "CHANGES_REQUESTED") return "要求修改";
  return null;
}
