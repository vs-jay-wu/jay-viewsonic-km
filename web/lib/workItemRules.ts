/**
 * 把 session 標題／PR 解析成「工作項目」的參照（ticket key、PR 編號）。
 *
 * 純函式（客戶端與 server 共用，不能帶 fs/promises）。
 *
 * 命名慣例是 Jay 自己維護的：`[repo/sub-repo] ticket desc`，例如
 * `[km/mvbf] 9208 font fallback`。**解析不到就不連結**，不要硬湊——
 * 這是人維護的東西，一定會有不符合規則的。
 */

export const JIRA_SITE = "https://viewsonic-vsi.atlassian.net";

/** 明確寫出來的 project key。VSFT／MT 是舊落點，仍會出現在既有 session 標題裡 */
export const KNOWN_PROJECTS = ["VB", "VSFT", "MT"] as const;

/**
 * 裸數字（`9208`）補哪個 project。
 *
 * Jay 2026-09-11 裁定：**一律當 VB**。這是當場定下的工作規則，不是查證過的
 * 組織政策——既有標題裡的裸數字有些其實是 VSFT 的舊單，所以猜出來的 key 一律
 * 標記 `ticketGuessed`，UI 要讓人看得出那是猜的。
 */
export const DEFAULT_PROJECT = "VB";

export interface WorkRef {
  /** `VB-1234`，解析不到是 null */
  ticketKey: string | null;
  /** true = 由裸數字補出來的，不是標題裡明寫的 */
  ticketGuessed: boolean;
  /** `PR#237` 這種寫法解析出來的編號（無單的工作用這個關聯） */
  prNumber: number | null;
  /** `[km/mvbf]` 裡的完整內容 */
  scope: string | null;
  /** scope 的最後一段，通常就是 repo 別名 */
  repo: string | null;
  /** 去掉 key／PR 之後剩下的描述 */
  desc: string;
}

const EMPTY: WorkRef = {
  ticketKey: null, ticketGuessed: false, prNumber: null,
  scope: null, repo: null, desc: "",
};

const PROJECT_RE = new RegExp(`^(${KNOWN_PROJECTS.join("|")})-?(\\d+)$`, "i");
const EMBEDDED_KEY_RE = new RegExp(`\\b(${KNOWN_PROJECTS.join("|")})-(\\d+)\\b`, "i");

/** 兩端的標點不算 token 的一部分（`(VB-1234)`、`9208:` 都要吃得到） */
function strip(token: string): string {
  return token.replace(/^[([{<"'`,.:;]+/, "").replace(/[)\]}>"'`,.:;]+$/, "");
}

/**
 * 解析 session 標題。
 *
 * 刻意用 token 掃描而不是一條大正則：
 * 一來好講清楚每一種寫法配到哪，二來**不需要 lookbehind**
 * （lookbehind 在打包降級時會變成執行期錯誤，cross-system-claims §2 記過）。
 */
export function parseSessionTitle(title: string): WorkRef {
  const raw = (title ?? "").trim();
  if (!raw) return { ...EMPTY };

  const bracket = raw.match(/^\[([^\]]*)\]\s*(.*)$/);
  const scope = bracket ? bracket[1].trim() : null;
  const rest = bracket ? bracket[2] : raw;
  const repo = scope ? (scope.split("/").pop() ?? "").trim() || null : null;

  let ticketKey: string | null = null;
  let ticketGuessed = false;
  let prNumber: number | null = null;
  let bareIndex = -1;
  let bareValue: string | null = null;

  const tokens = rest.split(/\s+/).filter(Boolean);
  const consumed = new Set<number>();

  tokens.forEach((token, i) => {
    const t = strip(token);
    if (!t) return;

    const key = t.match(PROJECT_RE);
    if (key && !ticketKey) {
      ticketKey = `${key[1].toUpperCase()}-${key[2]}`;
      consumed.add(i);
      return;
    }
    // `PR#237` / `PR237` / `#237`，但單純的數字不算（那是裸數字那條規則）
    const pr = /^(?:PR#?|#)(\d+)$/i.exec(t);
    if (pr && prNumber === null) {
      prNumber = Number(pr[1]);
      consumed.add(i);
      return;
    }
    if (bareValue === null && /^\d{2,6}$/.test(t)) {
      bareValue = t;
      bareIndex = i;
    }
  });

  // 夾在別的字裡的 key（`Jay/VSFT-9727-question-menu-style` 這種分支名）。
  // token 掃描看不到它，所以再用正則掃一次整串 —— 仍然算「明確寫出來的」。
  if (!ticketKey) {
    const embedded = EMBEDDED_KEY_RE.exec(rest);
    if (embedded) ticketKey = `${embedded[1].toUpperCase()}-${embedded[2]}`;
  }

  // 到這裡還沒有才拿裸數字補（而且要標記成猜的）
  if (!ticketKey && bareValue !== null) {
    ticketKey = `${DEFAULT_PROJECT}-${bareValue}`;
    ticketGuessed = true;
    consumed.add(bareIndex);
  }

  const desc = tokens
    .filter((_, i) => !consumed.has(i))
    .join(" ")
    // 拿掉 key 之後常留下開頭的連接符號（`[km/mvbf] 10002 - pptx parser`）
    .replace(/^[\s\-–—:：]+/, "")
    .trim();
  return { ticketKey, ticketGuessed, prNumber, scope, repo, desc };
}

/**
 * 裸數字要補哪個 project：**先看手上已經有的明確 key 有沒有同號的**。
 *
 * 由來（2026-09-11 實測）：`[km/cs] 9904 i18n` 照預設規則會變成 `VB-9904`，
 * 但同一批資料裡的 PR 分支明寫著 `VSFT-9904`；`9718` 也一樣。裸數字多半是
 * 舊的 VSFT 單號（VB 目前還在四位數），所以有同號的明確 key 就用它。
 *
 * 同號但撞到兩個 project（VB-9904 與 VSFT-9904 同時存在）時回 null ——
 * 分不出來就不要猜，交給呼叫端退回預設。
 */
export function matchKnownKey(num: string, knownKeys: Iterable<string>): string | null {
  const suffix = `-${num}`;
  const hits = new Set<string>();
  for (const k of knownKeys) if (k.endsWith(suffix)) hits.add(k.toUpperCase());
  return hits.size === 1 ? [...hits][0] : null;
}

/** `VB-9208` → `9208`；不是 key 就回 null */
export function keyNumber(key: string | null | undefined): string | null {
  const m = key ? /-(\d+)$/.exec(key) : null;
  return m ? m[1] : null;
}

/** PR 的 ticket 從標題與分支名找，**不猜裸數字** —— 分支名裡的數字太常是別的東西 */
export function parsePrTicketKey(pr: { title?: string; headRefName?: string }): string | null {
  const hay = `${pr.title ?? ""} ${pr.headRefName ?? ""}`;
  const m = new RegExp(`\\b(${KNOWN_PROJECTS.join("|")})-(\\d+)\\b`, "i").exec(hay);
  return m ? `${m[1].toUpperCase()}-${m[2]}` : null;
}

export function ticketUrl(key: string): string {
  return `${JIRA_SITE}/browse/${key}`;
}

/** 索引用的主鍵：有單就用單號，沒單就用 `PR:<repo>#<number>` */
export function workKeyOf(input: {
  ticketKey?: string | null;
  repo?: string | null;
  prNumber?: number | null;
}): string | null {
  if (input.ticketKey) return input.ticketKey;
  if (input.prNumber !== null && input.prNumber !== undefined) {
    return input.repo ? `PR:${input.repo}#${input.prNumber}` : `PR:#${input.prNumber}`;
  }
  return null;
}

/** 產生符合慣例的 session 標題（開新 session 時當預設值） */
export function formatSessionTitle(input: {
  scope: string;
  ticketKey?: string | null;
  desc?: string;
}): string {
  return [`[${input.scope}]`, input.ticketKey ?? "", (input.desc ?? "").trim()]
    .filter(Boolean)
    .join(" ");
}

// ─── repo 別名 ───────────────────────────────────────────────────────────────

/**
 * Session 標題寫的是口語別名（`[km/mvbf]`），PR 那邊是 repo 全名
 * （`Viewsonic-EDU/edu-droid-flutter`），要對得起來才連得上。
 *
 * 這裡只放**文件裡寫死、確定的**兩條（`.claude/rules/cross-repo-workflow.md` §0）；
 * 其餘由 `data/repos-overview.json` 的 aliases 動態補（見 lib/workIndex.ts）——
 * 那份檔案是維護中的資料，寫死一份到程式裡就會漂移。
 */
export const BUILTIN_REPO_ALIASES: Record<string, string> = {
  mvbf: "edu-droid-flutter",
  cs: "ragdoll-cat",
};

/** 把別名或 owner/repo 收斂成 repo 名（收不了就原樣回傳，小寫） */
export function canonicalRepo(
  name: string | null | undefined,
  aliases: Record<string, string> = {}
): string | null {
  if (!name) return null;
  const bare = name.trim().split("/").pop()!.trim().toLowerCase();
  if (!bare) return null;
  return aliases[bare] ?? BUILTIN_REPO_ALIASES[bare] ?? bare;
}

/** repo 名 → Jay 慣用的口語別名（只有確定的那幾條，其餘原樣用 repo 名） */
export const REPO_TO_ALIAS: Record<string, string> = Object.fromEntries(
  Object.entries(BUILTIN_REPO_ALIASES).map(([alias, repo]) => [repo, alias])
);

/**
 * 開新 session 時的預設標題：`[km/<別名>] <單號> <描述>`。
 *
 * 描述取 PR 標題，但**去掉開頭的票號 bracket**（mvbf 的格式是
 * `[User Story VSFT-9941] 埋點`，留著會讓標題出現兩次單號）。
 */
export function defaultSessionTitleForPr(pr: {
  repo: string;
  number: number;
  title: string;
  headRefName?: string;
}): string {
  const repo = canonicalRepo(pr.repo) ?? pr.repo;
  const alias = REPO_TO_ALIAS[repo] ?? repo;
  const ticketKey = parsePrTicketKey(pr);
  const desc = pr.title
    .replace(/^\s*(\[[^\]]*\]\s*)+/, "")   // 開頭連續的 bracket 全部去掉
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return formatSessionTitle({
    scope: `km/${alias}`,
    ticketKey: ticketKey ?? `PR#${pr.number}`,
    desc,
  });
}

/**
 * 開新 session 做某張單時的預設標題。
 *
 * 不知道要在哪個 repo 做的時候就只寫 `[km]` —— **不要猜**。Jira 的 summary
 * 裡雖然常有 `[MVBFv3]` 這種前綴，但那是產品標記不是 repo，猜錯會讓標題
 * 從此連到錯的地方（關聯是靠標題建立的）。
 */
export function defaultSessionTitleForTicket(input: {
  key: string;
  summary: string;
  /** 已知的 repo（例如這張單已經有 PR 了），沒有就留空 */
  repo?: string | null;
}): string {
  const repo = canonicalRepo(input.repo);
  const alias = repo ? (REPO_TO_ALIAS[repo] ?? repo) : null;
  const desc = input.summary
    .replace(/^\s*(\[[^\]]*\]\s*)+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return formatSessionTitle({
    scope: alias ? `km/${alias}` : "km",
    ticketKey: input.key,
    desc,
  });
}
