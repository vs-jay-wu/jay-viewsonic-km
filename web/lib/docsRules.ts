/**
 * km 的 HTML 文件索引：型別、meta 解析、分組與排序規則。
 *
 * 純函式（客戶端也要用，不能帶 fs/promises）。
 *
 * 文件的慣例（2026-09-11 定，見 `.claude/rules/docs-feature-spec.md`）：
 * 一個 feature 資料夾 = 一份「文件集」，**入口一律 `index.html`**，
 * 每份 HTML 在 head 帶三個 meta：`km-doc-kind` / `km-doc-status` / `km-doc-tickets`。
 */

export const DOC_KINDS = [
  "overview", "goal", "findings", "investigation", "verify", "test",
  "defects", "report", "handoff", "reference", "open-questions", "superseded",
] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export const KIND_LABEL: Record<DocKind, string> = {
  overview: "總覽", goal: "目標", findings: "調查結果", investigation: "調查",
  verify: "驗證", test: "測試", defects: "缺陷", report: "報告",
  handoff: "交接", reference: "參考", "open-questions": "待決", superseded: "已被取代",
};

export type DocStatus = "active" | "done" | "superseded";

export const STATUS_STYLE: Record<DocStatus, { label: string; cls: string }> = {
  active: { label: "進行中", cls: "border-sky-200 bg-sky-50 text-sky-700" },
  done: { label: "已完成", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  superseded: { label: "已被取代", cls: "border-gray-200 bg-gray-50 text-gray-400" },
};

export interface DocFile {
  /** 相對 repo 根目錄，例如 `docs/features/phet-cc-by-attribution/index.html` */
  path: string;
  name: string;
  title: string;
  kind: DocKind;
  status: DocStatus;
  tickets: string[];
  sizeBytes: number;
  /** 最後一次 commit 的日期（沒進版控就是 null）—— 不用 mtime，checkout 會把它洗掉 */
  updated: string | null;
}

export interface DocSet {
  /** 文件集資料夾，例如 `docs/repositories/Viewsonic-EDU/ragdoll-cat/features/quiz-tool-flow-v2` */
  dir: string;
  /** feature 資料夾名 */
  feature: string;
  /** repo 名；跨產品的文件集沒有（放在 docs/features/ 底下） */
  repo: string | null;
  /** 入口檔（照慣例是 index.html）；找不到時是 null，UI 要標出來 */
  entry: DocFile | null;
  files: DocFile[];
  /** 集內任一份文件的最後更新 */
  updated: string | null;
  /** 集內所有文件提到的票號聯集 */
  tickets: string[];
  status: DocStatus;
  totalBytes: number;
}

export interface DocsIndex {
  scannedAt: string;
  sets: DocSet[];
  /** 沒有 index.html 的文件集數（慣例沒跟上的） */
  missingEntry: number;
}

// ─── 從 HTML 的 head 取 metadata ─────────────────────────────────────────────

function metaOf(head: string, name: string): string | null {
  const re = new RegExp(`<meta[^>]+name=["']${name}["'][^>]*>`, "i");
  const tag = head.match(re)?.[0];
  if (!tag) return null;
  return tag.match(/content=["']([^"']*)["']/i)?.[1]?.trim() ?? null;
}

/** 檔名推 kind —— 只有在沒有 `km-doc-kind` 時才用（舊文件的退路） */
export function kindFromName(name: string): DocKind {
  const stem = name.replace(/\.html$/i, "");
  if (stem.startsWith("superseded")) return "superseded";
  if (stem === "index") return "overview";
  const direct = DOC_KINDS.find((k) => stem === k);
  if (direct) return direct;
  if (/test/.test(stem)) return "test";
  if (/investigation/.test(stem)) return "investigation";
  if (/report/.test(stem)) return "report";
  if (/handoff/.test(stem)) return "handoff";
  return "reference";
}

export interface ParsedDoc {
  title: string;
  kind: DocKind;
  status: DocStatus;
  tickets: string[];
}

/**
 * 解析文件的 head。**只吃前面幾 KB**（呼叫端負責截斷）——
 * 有些 findings 是 95KB，整份讀進來只為了拿標題不划算。
 */
export function parseDocHead(head: string, fileName: string): ParsedDoc {
  const rawTitle = head.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const title = rawTitle.replace(/\s+/g, " ").trim() || fileName;

  const kindMeta = metaOf(head, "km-doc-kind");
  const kind = (DOC_KINDS as readonly string[]).includes(kindMeta ?? "")
    ? (kindMeta as DocKind)
    : kindFromName(fileName);

  const statusMeta = metaOf(head, "km-doc-status");
  const status: DocStatus =
    statusMeta === "done" || statusMeta === "superseded" ? statusMeta : "active";

  const tickets = (metaOf(head, "km-doc-tickets") ?? "")
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);

  return { title, kind, status, tickets };
}

// ─── 分組與排序 ──────────────────────────────────────────────────────────────

/** 從路徑推 repo 與 feature：`docs/repositories/<org>/<repo>/features/<feature>/…` */
export function scopeOf(dir: string): { repo: string | null; feature: string } {
  const parts = dir.split("/").filter(Boolean);
  const featureIdx = parts.lastIndexOf("features");
  const feature = featureIdx >= 0 ? parts[featureIdx + 1] ?? "" : parts[parts.length - 1];
  const repo = parts[1] === "repositories" ? parts[3] ?? null : null;
  return { repo, feature };
}

/** 集內排序：總覽永遠第一，已被取代的永遠最後，其餘照 kind 的自然順序 */
export function sortFiles(files: DocFile[]): DocFile[] {
  const rank = (f: DocFile) =>
    f.kind === "overview" ? -1 : f.status === "superseded" ? 99 : DOC_KINDS.indexOf(f.kind);
  return [...files].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/**
 * 文件集排序：pin 的在最前面（照 pin 的順序），其餘照最後更新新到舊，
 * 已被取代／已完成的不特別往後 —— 「最近動過」本身就是最好的相關性訊號。
 */
export function sortSets(sets: DocSet[], pinned: string[]): DocSet[] {
  return [...sets].sort((a, b) => {
    const pa = pinned.indexOf(a.dir);
    const pb = pinned.indexOf(b.dir);
    if (pa !== -1 || pb !== -1) {
      if (pa === -1) return 1;
      if (pb === -1) return -1;
      return pa - pb;
    }
    return (b.updated ?? "").localeCompare(a.updated ?? "");
  });
}

export function matchesDocQuery(set: DocSet, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = [
    set.dir, set.feature, set.repo ?? "", ...set.tickets,
    ...set.files.map((f) => `${f.title} ${f.name} ${f.kind}`),
  ].join(" ").toLowerCase();
  return terms.every((t) => hay.includes(t));
}

// ─── 依 repo 分群 ────────────────────────────────────────────────────────────

export interface DocRepoGroup {
  /** repo 名；跨產品的文件集是 null */
  repo: string | null;
  label: string;
  sets: DocSet[];
  /** 群裡最新的更新日期，拿來排群 */
  updated: string | null;
}

export const CROSS_PRODUCT_LABEL = "跨產品";

/**
 * 照 repo 分群（Jay 2026-09-14）。
 *
 * 群內沿用 `sortSets`（pin 的在前、其餘照最後更新），群本身照「群裡最新的更新」
 * 由新到舊 —— 最近在動的 repo 排前面。**跨產品那群不特別往後**：它是一種正當的
 * 分類（`docs/features/`），不是「還沒分類」。
 */
export function groupSetsByRepo(sets: DocSet[], pinned: string[] = []): DocRepoGroup[] {
  const groups = new Map<string, DocRepoGroup>();
  for (const set of sets) {
    const key = set.repo ?? "";
    let g = groups.get(key);
    if (!g) {
      g = { repo: set.repo, label: set.repo ?? CROSS_PRODUCT_LABEL, sets: [], updated: null };
      groups.set(key, g);
    }
    g.sets.push(set);
    if ((set.updated ?? "") > (g.updated ?? "")) g.updated = set.updated;
  }
  for (const g of groups.values()) g.sets = sortSets(g.sets, pinned);
  return [...groups.values()].sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""));
}
