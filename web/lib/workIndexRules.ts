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
