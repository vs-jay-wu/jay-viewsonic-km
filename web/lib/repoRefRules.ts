/**
 * repo 的身分（純規則，有測試）。
 *
 * **問題**：km 到處拿**絕對路徑**當 repo 的識別 —— `/repo/code?dir=/Users/…`、
 * `/code-view/<base64 絕對路徑>/…`、狀態檔的 key、session 的 cwd 對應。單機時這沒問題，
 * 多機器之後會產生**最難發現的壞法**：
 *
 * > A 上複製的連結貼到 B → 路徑在 B 上**也合法**（兩台的短名都是 jay.wj.wu）→
 * > 頁面正常打開 → 但顯示的是 B 的磁碟。**沒有任何錯誤訊息。**
 *
 * **做法**：身分改成 `<rootId>/<相對路徑>`，絕對路徑降級成「每台機器自己解析的結果」。
 *
 * ```
 * Viewsonic-EDU/ragdoll-cat            org 底下的 repo
 * Viewsonic-EDU/edu-droid-flutter-x    同層的 worktree（也在 org 底下，自然成立）
 * Viewsonic-EDU@external/old-repo      搬到外接碟的
 * km                                   km 自己
 * home/.mvb-worktrees/poc-desktop      放在別處的 linked worktree
 * ```
 *
 * `home` 那條是**兜底**：worktree 可以開在任何地方，少了它那些 repo 會沒有身分。
 * 它**不放寬任何權限** —— 能不能瀏覽仍然由 `isKnownWorktree` 決定（見
 * `codeBrowse.ts` 的兩層驗證），這裡只負責「同一個目錄在不同機器上叫同一個名字」。
 *
 * 設計見 `docs/ideas/km-multi-machine.md` §6。
 */

export interface RefRoot {
  /** 身分的第一段。不可以含 `/` */
  id: string;
  /** 這台機器上的絕對路徑 */
  base: string;
}

/** 去掉結尾斜線；不動其他東西（這裡不做 realpath，那是 fs 的事） */
function trimSlash(p: string): string {
  return p.length > 1 && p.endsWith("/") ? p.replace(/\/+$/, "") : p;
}

function isUnder(abs: string, base: string): boolean {
  return abs === base || abs.startsWith(base + "/");
}

/**
 * 絕對路徑 → 身分。對不到任何 root 就回 null。
 *
 * **最長的 base 優先**：org 的 localPath 一定在 home 底下，先比到 home 就全錯了。
 */
export function encodeRepoRef(abs: string, roots: RefRoot[]): string | null {
  const target = trimSlash(abs);
  const sorted = [...roots].sort((a, b) => trimSlash(b.base).length - trimSlash(a.base).length);
  for (const r of sorted) {
    const base = trimSlash(r.base);
    if (!isUnder(target, base)) continue;
    const rel = target === base ? "" : target.slice(base.length + 1);
    return rel ? `${r.id}/${rel}` : r.id;
  }
  return null;
}

/**
 * 身分 → 這台機器上的絕對路徑。認不得的 root、或想往上跳的相對路徑一律 null。
 *
 * ⚠️ `..` 要在**這裡**擋掉，不要指望後面那層。後面那層（`resolveIn`）比的是
 * 「解析後還在不在 repo 底下」，而這裡解出來的東西**就是** repo 的位置 ——
 * `Viewsonic-EDU/../../../etc` 對它而言是個完全合法的 repo 根目錄。
 */
export function decodeRepoRef(ref: string, roots: RefRoot[]): string | null {
  const clean = ref.trim().replace(/^\/+|\/+$/g, "");
  if (!clean) return null;
  const slash = clean.indexOf("/");
  const id = slash < 0 ? clean : clean.slice(0, slash);
  const rel = slash < 0 ? "" : clean.slice(slash + 1);
  if (rel.split("/").some((s) => s === ".." || s === "." || s === "")) return null;
  const root = roots.find((r) => r.id === id);
  if (!root) return null;
  const base = trimSlash(root.base);
  return rel ? `${base}/${rel}` : base;
}

/** 畫面上顯示用的短名：身分的最後一段（`Viewsonic-EDU/ragdoll-cat` → `ragdoll-cat`） */
export function repoRefName(ref: string): string {
  const parts = ref.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? ref;
}
