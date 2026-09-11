/**
 * `data/repos-overview.json` 的型別與篩選規則。
 *
 * 純函式，客戶端與 server 共用（不能把 `fs/promises` 帶進客戶端，見 web/AGENTS.md）。
 * 搜尋的判準會變（欄位會長出來），所以放在有測試的地方。
 */

export interface RepoEntry {
  name: string;
  /** 對應 `products` 的 key；沒歸屬的是 null */
  product: string | null;
  description: string;
  tech?: string[];
  aliases?: string[];
  /** 部署用的 host 前綴，找「哪個 repo 對應這個網址」時很有用 */
  hostPrefix?: string;
  archived?: boolean;
  /** fork / keystore / config —— 不是自家的產品程式碼 */
  type?: string;
  dependencies?: { repo: string; product?: string | null; note?: string }[];
  /** 不屬於 org 的（例如 Jay 自己的） */
  org?: string;
}

export interface ProductInfo {
  fullName: string;
  aliases?: string[];
  description?: string;
}

export interface ReposOverview {
  _meta: { description?: string; organization?: string; updated?: string; totalRepos?: number };
  products: Record<string, ProductInfo>;
  repos: RepoEntry[];
}

/** 沒填 product 的歸在這裡 */
export const UNGROUPED = "__ungrouped__";

export interface Filters {
  query: string;
  /** 已封存的預設不顯示 —— 它們多半只是歷史 */
  showArchived: boolean;
  /** fork / keystore / config 這些不是產品程式碼，預設也不顯示 */
  showNonCode: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  query: "",
  showArchived: false,
  showNonCode: false,
};

/**
 * 搜尋要吃得到「口語別名」—— 找 repo 時腦子裡想的常常是 `cs backend`
 * 或 `learn-swift`，而不是 `ocelot`。所以名稱、別名、描述、技術、host
 * 前綴、產品名全部一起比對。
 */
export function repoHaystack(repo: RepoEntry, product: ProductInfo | undefined): string {
  return [
    repo.name,
    repo.description,
    repo.product ?? "",
    repo.hostPrefix ?? "",
    repo.org ?? "",
    ...(repo.aliases ?? []),
    ...(repo.tech ?? []),
    product?.fullName ?? "",
    ...(product?.aliases ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

/** 空白分隔的每個詞都要命中（AND），才能用兩個詞收斂結果 */
export function matchesQuery(
  repo: RepoEntry,
  product: ProductInfo | undefined,
  query: string
): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const hay = repoHaystack(repo, product);
  return terms.every((t) => hay.includes(t));
}

export function filterRepos(
  overview: ReposOverview,
  filters: Filters
): RepoEntry[] {
  return overview.repos.filter((r) => {
    if (!filters.showArchived && r.archived) return false;
    if (!filters.showNonCode && r.type) return false;
    return matchesQuery(r, r.product ? overview.products[r.product] : undefined, filters.query);
  });
}

export interface RepoGroup {
  key: string;
  fullName: string;
  description?: string;
  aliases?: string[];
  repos: RepoEntry[];
}

/**
 * 依產品分組。產品照 repo 數由多到少，**未歸類永遠墊底** ——
 * 那是「還沒整理」，不是一條產品線（跟 VB Bug 總覽的（未分類）同一個處理）。
 */
export function groupByProduct(overview: ReposOverview, repos: RepoEntry[]): RepoGroup[] {
  const groups = new Map<string, RepoGroup>();
  for (const r of repos) {
    const key = r.product ?? UNGROUPED;
    let g = groups.get(key);
    if (!g) {
      const info = r.product ? overview.products[r.product] : undefined;
      g = {
        key,
        fullName: info?.fullName ?? (r.product ?? "未歸類"),
        description: info?.description,
        aliases: info?.aliases,
        repos: [],
      };
      groups.set(key, g);
    }
    g.repos.push(r);
  }
  for (const g of groups.values()) g.repos.sort((a, b) => a.name.localeCompare(b.name));
  return [...groups.values()].sort((a, b) => {
    if ((a.key === UNGROUPED) !== (b.key === UNGROUPED)) return a.key === UNGROUPED ? 1 : -1;
    return b.repos.length - a.repos.length;
  });
}
