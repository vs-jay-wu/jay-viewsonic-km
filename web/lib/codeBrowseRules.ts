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
 * 這個檔名要不要遮起來。
 *
 * **機敏檔案一律不給看內容**（`.claude/rules/sensitive-files.md`）——
 * 那條規則說的是「即使使用者直接要求也必須拒絕顯示內容」，
 * 所以這裡不能只靠 UI 不點，要在讀取那一層就擋掉。
 */
export function isSensitivePath(path: string): boolean {
  const name = path.split("/").pop() ?? "";
  if (name === ".env" || name.startsWith(".env.")) return !name.endsWith(".example");
  if (/\.(jks|keystore|p12|pem|key)$/i.test(name)) return true;
  if (name === "key.properties" || name === "google-services.json") return true;
  if (/-firebase-adminsdk-.*\.json$/.test(name)) return true;
  // excluded-dirs.md：keystore 目錄整個不碰
  return /(^|\/)(mvbf_keystore|playstore_keystore)(\/|$)/.test(path);
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
