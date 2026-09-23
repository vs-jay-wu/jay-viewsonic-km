/**
 * 程式碼瀏覽的純規則（客戶端要用）。
 *
 * **唯讀**：這一整條路徑上沒有任何寫入的 API，跟 `/git` 同一個原則
 * （Jay 2026-09-18：只要看 code 與資料夾結構，不要改）。
 */

export interface TreeEntry {
  name: string;
  /** 相對 repo 根目錄 */
  path: string;
  kind: "dir" | "file";
  /** 檔案才有 */
  sizeBytes?: number;
}

export interface SearchHit {
  path: string;
  line: number;
  text: string;
}

/** 這種檔案不用開（開了也是亂碼），列得出來但點了直接說明 */
const BINARY_EXT = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico", "icns",
  "pdf", "zip", "gz", "tar", "jar", "aar", "apk", "aab", "so", "dylib", "a", "o",
  "ttf", "otf", "woff", "woff2", "eot", "mp3", "mp4", "mov", "wav", "m4a",
  "class", "dex", "bin", "dill", "keystore", "jks", "p12", "pem",
]);

export function extOf(path: string): string {
  const name = path.split("/").pop() ?? "";
  return name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
}

export function looksBinary(path: string): boolean {
  return BINARY_EXT.has(extOf(path));
}

/**
 * 這個檔名算不算機敏（預設遮起來）。
 *
 * 機敏檔案**預設不給看內容**（`.claude/rules/sensitive-files.md`）。
 * 2026-09-23 起這一頁多了「明確按一下才顯示」那條路（見 `isHardBlocked`）——
 * 但預設值不變，而且**不能只靠 UI 不點**：沒有帶明確的解鎖參數時，
 * 讀取那一層就要擋掉。
 */
export function isSensitivePath(path: string): boolean {
  const name = path.split("/").pop() ?? "";
  if (name === ".env" || name.startsWith(".env.")) return !name.endsWith(".example");
  if (/\.(jks|keystore|p12|pem|key)$/i.test(name)) return true;
  // ⚠️ `keystore.properties`（ragdoll-cat）與 `key.properties`（mvbf）是同一種東西：
  // 簽章用的密碼。只列其中一個等於另一個完全沒擋 —— 2026-09-23 實測 ragdoll-cat 的
  // 那份 695 bytes 直接讀得到。加名字時**兩個 repo 都要查一次叫什麼**。
  if (/^(key|keystore)\.properties$/.test(name) || name === "google-services.json") return true;
  if (/-firebase-adminsdk-.*\.json$/.test(name)) return true;
  // excluded-dirs.md：keystore 目錄整個不碰
  return /(^|\/)(mvbf_keystore|playstore_keystore)(\/|$)/.test(path);
}

/**
 * **連「按一下解鎖」都不給**的那一類：`excluded` 的那兩個 keystore 目錄。
 *
 * 只有它們，因為 `excluded-dirs.md` 寫的是「**禁止讀取**」—— 那是 Jay 自己定的、
 * 比「預設不顯示」更強的一條，這個解鎖機制不推翻它。
 *
 * ⚠️ **不要把副檔名（`.jks` / `.p12`…）也放進來。** 一開始是那樣寫的，結果
 * 點 `MVBA_PlatForm.jks` 只會看到「受保護，一律不顯示」，而真正的理由是
 * **它是二進位、顯示出來只是亂碼** —— 訊息講錯了原因，看起來也像功能壞了
 * （Jay 2026-09-23 回報）。二進位由 `looksBinary` 那條負責講，講得比較誠實。
 */
export function isHardBlocked(path: string): boolean {
  return /(^|\/)(mvbf_keystore|playstore_keystore)(\/|$)/.test(path);
}

/**
 * 機敏、但可以按一下看（＝畫面上要給解鎖按鈕的那些）。
 *
 * 二進位不算：那種檔解鎖也只是亂碼，按鈕只會浪費一次點擊。
 */
export function isRevealable(path: string): boolean {
  return isSensitivePath(path) && !isHardBlocked(path) && !looksBinary(path);
}

/**
 * 只留欄位名，值一律換成 `••••`。
 *
 * `.env` 這種 `KEY=VALUE` 的檔，**key 名不機敏、值才是** —— 多數時候你要找的是
 * 「有沒有這個欄位」，那不必真的解鎖。註解與空行原樣保留（它們常寫著這個欄位
 * 要去哪裡拿）。
 *
 * ⚠️ 遮罩是在 **server 端**做的，不是前端拿到全文再遮：前端遮的話，
 * 值仍然在回應裡，開 DevTools 就看得到，等於沒遮。
 */
export function maskEnvValues(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const t = line.trimStart();
      if (!t || t.startsWith("#")) return line;
      const eq = line.indexOf("=");
      if (eq === -1) return line;
      const value = line.slice(eq + 1).trim();
      return value ? `${line.slice(0, eq + 1)}••••` : line;
    })
    .join("\n");
}

/** 目錄在前、同類照名字。`.` 開頭的排在後面 —— 它們多半不是你要找的 */
export function sortEntries(entries: TreeEntry[]): TreeEntry[] {
  return [...entries].sort((a, b) => {
    if ((a.kind === "dir") !== (b.kind === "dir")) return a.kind === "dir" ? -1 : 1;
    const ad = a.name.startsWith(".");
    const bd = b.name.startsWith(".");
    if (ad !== bd) return ad ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

/** `git grep -n` 的一行：`path:line:text` —— 路徑裡可能有冒號，所以只切前兩個 */
export function parseGrepLine(line: string): SearchHit | null {
  const i = line.indexOf(":");
  if (i === -1) return null;
  const j = line.indexOf(":", i + 1);
  if (j === -1) return null;
  const n = Number(line.slice(i + 1, j));
  if (!Number.isInteger(n)) return null;
  return { path: line.slice(0, i), line: n, text: line.slice(j + 1) };
}

export function parseGrepOutput(stdout: string, limit = 300): SearchHit[] {
  const out: SearchHit[] = [];
  for (const raw of stdout.split("\n")) {
    if (!raw) continue;
    const hit = parseGrepLine(raw);
    // 太長的一行多半是壓縮過的產物，截斷就好，不要讓它撐爆畫面
    if (hit) out.push({ ...hit, text: hit.text.slice(0, 400) });
    if (out.length >= limit) break;
  }
  return out;
}

/** 命中依檔案收合，畫面上一個檔案一組 */
export function groupHits(hits: SearchHit[]): { path: string; hits: SearchHit[] }[] {
  const byPath = new Map<string, SearchHit[]>();
  for (const h of hits) {
    const list = byPath.get(h.path);
    if (list) list.push(h);
    else byPath.set(h.path, [h]);
  }
  return [...byPath.entries()].map(([path, hits]) => ({ path, hits }));
}

/**
 * 解鎖過的明碼內容，幾秒後自動收回成遮罩態。
 *
 * **為什麼要有**：`/code` 的畫面常被 agent 用瀏覽器工具讀（截圖、抓 DOM）。
 * `sensitive-files.md` 有寫「不得對已解鎖的畫面截圖」，但規則只對讀到規則的那個
 * agent 有效 —— 沒載入到、或換成別的工具在跑就擋不住。自動收回是**不依賴任何人
 * 守規矩**的那一層：多數時候畫面上早就遮回去了。
 *
 * 只收明碼。遮罩態沒有值，留著不會有事。
 */
export const REVEAL_TTL_MS = 60_000;

/** 還剩幾秒（給畫面上的倒數）。已經到期就是 0 */
export function revealSecondsLeft(
  revealedAt: number,
  now: number,
  ttlMs: number = REVEAL_TTL_MS
): number {
  // 夾在 [0, TTL]：時鐘倒退（睡眠喚醒、改系統時間）時 now 可能比 revealedAt 早，
  // 不夾的話畫面會倒數出一個比 TTL 還大的數字
  const left = Math.ceil((revealedAt + ttlMs - now) / 1000);
  return Math.min(Math.max(0, left), Math.ceil(ttlMs / 1000));
}
