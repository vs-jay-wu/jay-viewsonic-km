/**
 * 「有人動我的 PR」的分群規則。
 *
 * 純函式（客戶端要用，不能帶 fs/promises）。同一張 PR 上常常一次來三四則
 * （approve ＋ 幾則留言），攤平成一長串會讀不出「是哪幾張 PR 有動靜」。
 */

export type MyPrEventType = "approved" | "changes_requested" | "reviewed" | "commented";

export interface MyPrEventLike {
  id: string;
  type: MyPrEventType;
  at: string;
  actor: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  read: boolean;
}

export interface MyPrEventGroup<T extends MyPrEventLike> {
  key: string;
  repo: string;
  number: number;
  title: string;
  /** PR 本身的連結。事件的 url 會帶 `#pullrequestreview-…` 之類的錨點，要切掉 */
  prUrl: string;
  /** 這群裡最新那一則的時間，拿來排序 */
  latestAt: string;
  unread: number;
  events: T[];
}

export function prUrlOf(eventUrl: string): string {
  const hash = eventUrl.indexOf("#");
  return hash === -1 ? eventUrl : eventUrl.slice(0, hash);
}

/**
 * 依 PR 分群。群內照時間新到舊，群本身也照「最新一則」新到舊 ——
 * 有新動靜的 PR 要浮到最上面，跟未讀無關（已讀但剛發生的仍然值得看到）。
 */
export function groupEventsByPr<T extends MyPrEventLike>(events: T[]): MyPrEventGroup<T>[] {
  const groups = new Map<string, MyPrEventGroup<T>>();
  for (const e of events) {
    const key = `${e.repo}#${e.number}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key, repo: e.repo, number: e.number, title: e.title,
        prUrl: prUrlOf(e.url), latestAt: e.at, unread: 0, events: [],
      };
      groups.set(key, g);
    }
    g.events.push(e);
    if (!e.read) g.unread++;
    if (e.at > g.latestAt) {
      g.latestAt = e.at;
      // 標題以最新那則為準 —— PR 改過名的話，舊事件記的是舊標題
      g.title = e.title;
    }
  }
  for (const g of groups.values()) {
    g.events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  }
  return [...groups.values()].sort((a, b) =>
    a.latestAt < b.latestAt ? 1 : a.latestAt > b.latestAt ? -1 : 0
  );
}
