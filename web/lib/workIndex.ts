import { readFile, mkdir } from "fs/promises";
import path from "path";
import { listSessions } from "@/lib/sessions";
import { readSnapshot } from "@/lib/myPrs";
import { readReposOverview } from "@/lib/reposOverview";
import {
  canonicalRepo, keyNumber, matchKnownKey, parsePrTicketKey, parseSessionTitle, workKeyOf,
} from "@/lib/workItemRules";
import type { IndexedPr, IndexedSession, WorkIndex, WorkItem } from "@/lib/workIndexRules";
import { sortWorkItems } from "@/lib/workIndexRules";
import { statePath } from "@/lib/statePaths";
import { writeStateFile } from "@/lib/stateWrite";

export type { WorkIndex, WorkItem, IndexedPr, IndexedSession };

const FILE = statePath("work-index.json");
/** 重建一次要掃全部 session 標題（有 meta cache，但仍不便宜），所以有最小間隔 */
const MIN_REBUILD_GAP_MS = 60_000;

/**
 * 把 session 與 PR 掛到同一個「工作項目」底下。
 *
 * 主鍵是 ticket key；沒有單的工作用 `PR:<repo>#<number>`（Jay 的慣例是
 * 在標題寫 `PR#237`）。關聯全靠**人維護的命名慣例**，所以解析不到就不掛，
 * 不要硬湊 —— 寧可少連，不要連錯。
 */
async function build(): Promise<WorkIndex> {
  const [sessions, prSnapshot, overview] = await Promise.all([
    listSessions().catch(() => []),
    readSnapshot().catch(() => null),
    readReposOverview().catch(() => ({ overview: null, fileModifiedAt: null })),
  ]);

  // repo 別名 → repo 名。alias 有可能撞名，先到先贏（repos-overview 自己就是這個順序）
  const aliasMap: Record<string, string> = {};
  for (const r of overview.overview?.repos ?? []) {
    for (const a of r.aliases ?? []) {
      const k = a.trim().toLowerCase();
      if (k && !(k in aliasMap)) aliasMap[k] = r.name;
    }
  }

  const items = new Map<string, WorkItem>();
  const take = (key: string, ticketKey: string | null, guessed: boolean): WorkItem => {
    let it = items.get(key);
    if (!it) {
      it = { key, ticketKey, ticketGuessed: guessed, sessions: [], prs: [], latestAt: "" };
      items.set(key, it);
    }
    // 只要有任何一處是明確寫出來的，就不再算「猜的」
    if (it.ticketKey && !guessed) it.ticketGuessed = false;
    return it;
  };

  // 先把**明確寫出來的** key 收齊（PR 的分支名／標題，以及 session 標題裡明寫的），
  // 裸數字才有東西可以比對。順序很重要：先收集，再解析裸數字。
  const parsed = sessions.map((s) => ({ s, ref: parseSessionTitle(s.title) }));
  const knownKeys = new Set<string>();
  for (const pr of prSnapshot?.prs ?? []) {
    const k = parsePrTicketKey(pr);
    if (k) knownKeys.add(k);
  }
  for (const { ref } of parsed) {
    if (ref.ticketKey && !ref.ticketGuessed) knownKeys.add(ref.ticketKey);
  }

  let unlinkedSessions = 0;
  for (const { s, ref } of parsed) {
    let ticketKey = ref.ticketKey;
    let guessed = ref.ticketGuessed;
    if (guessed) {
      const matched = matchKnownKey(keyNumber(ticketKey) ?? "", knownKeys);
      if (matched) ticketKey = matched; // 仍標記為猜的，只是猜得有依據
    }
    const repo = canonicalRepo(ref.repo, aliasMap);
    const key = workKeyOf({ ticketKey, repo, prNumber: ref.prNumber });
    if (!key) {
      unlinkedSessions++;
      continue;
    }
    const it = take(key, ticketKey, guessed);
    const entry: IndexedSession = {
      id: s.id, title: s.title, cwd: s.cwd, repo,
      modifiedAt: s.modifiedAt, pinned: s.pinned,
    };
    it.sessions.push(entry);
    if (s.modifiedAt > it.latestAt) it.latestAt = s.modifiedAt;
  }

  for (const pr of prSnapshot?.prs ?? []) {
    const ticketKey = parsePrTicketKey(pr);

    const repo = canonicalRepo(pr.repo, aliasMap);
    const key = workKeyOf({ ticketKey, repo, prNumber: pr.number });
    if (!key) continue;
    const it = take(key, ticketKey, false);
    const entry: IndexedPr = {
      repo: pr.repo, number: pr.number, title: pr.title, url: pr.url,
      headRefName: pr.headRefName,
      state: pr.state, updatedAt: pr.updatedAt, reviewDecision: pr.reviewDecision,
    };
    it.prs.push(entry);
    if (pr.updatedAt > it.latestAt) it.latestAt = pr.updatedAt;
  }

  for (const it of items.values()) {
    it.sessions.sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1));
    it.prs.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  return {
    builtAt: new Date().toISOString(),
    items: sortWorkItems([...items.values()]),
    sessionCount: sessions.length,
    unlinkedSessions,
  };
}

async function readCache(): Promise<WorkIndex | null> {
  const raw = await readFile(FILE, "utf8").catch(() => null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as WorkIndex;
    return Array.isArray(parsed.items) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * 拿索引。預設吃快取 —— 連續重整不該每次都重掃全部 session。
 * `force` 是使用者按「重新整理」時用的。
 */
export async function getWorkIndex(opts: { force?: boolean } = {}): Promise<WorkIndex> {
  const cached = await readCache();
  const fresh =
    cached && Date.now() - Date.parse(cached.builtAt) < MIN_REBUILD_GAP_MS;
  if (cached && fresh && !opts.force) return cached;

  const index = await build();
  await mkdir(path.dirname(FILE), { recursive: true })
    .then(() => writeStateFile(FILE, JSON.stringify(index, null, 2) + "\n"))
    .catch(() => undefined);
  return index;
}
