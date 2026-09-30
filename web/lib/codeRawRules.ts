/**
 * `/code-view/<repoKey>/<檔案路徑…>` 的網址與白名單規則（純規則，有測試）。
 *
 * 為什麼是**路徑式**而不是 `?dir=&path=`：HTML 裡的相對資產（`./style.css`、
 * `img/x.png`）是相對**網址路徑**解析的。query 版的話 `./style.css` 會解析到
 * `/api/code/style.css`，466 個引相對資產的 HTML 全部破圖（2026-09-30 實測分布）。
 *
 * repo 的絕對路徑用 base64url 編一段放進路徑：不必另外維護一份 id 對照表，
 * 而且**編碼不是授權** —— 解出來之後照樣要過 `openRepo` 那一整套守衛。
 */

/** 白名單。**先只開 HTML 預覽真正需要的**，其餘一律 415，缺了再加 */
const RAW_MIME: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  // 音檔（工作區裡有 60 個 mp3、28 個 wav —— 提示音、錄音 fixture 那些）
  wav: "audio/wav",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  flac: "audio/flac",
  txt: "text/plain; charset=utf-8",
  md: "text/plain; charset=utf-8",
};

export function rawMimeOf(filePath: string): string | null {
  const name = filePath.split("/").pop() ?? "";
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return RAW_MIME[ext] ?? null;
}

export function encodeRepoKey(dir: string): string {
  const b64 = typeof btoa === "function"
    ? btoa(unescape(encodeURIComponent(dir)))
    : Buffer.from(dir, "utf8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeRepoKey(key: string): string | null {
  try {
    const b64 = key.replace(/-/g, "+").replace(/_/g, "/");
    const s = typeof atob === "function"
      ? decodeURIComponent(escape(atob(b64)))
      : Buffer.from(b64, "base64").toString("utf8");
    // 空字串或含 NUL 的一律當壞掉的 key —— 後面的路徑檢查不該收到這種東西
    return s && !s.includes("\0") ? s : null;
  } catch {
    return null;
  }
}

/**
 * 預覽用的網址。**每一段各自 encode**：檔名可能有空白或中文，
 * 整串一次 encode 會把 `/` 也編掉，路徑就散了。
 */
export function codeRawUrl(dir: string, filePath: string, opts: { scripts?: boolean } = {}): string {
  const segs = filePath.split("/").filter(Boolean).map(encodeURIComponent);
  const q = opts.scripts ? "?scripts=1" : "";
  return `/code-view/${encodeRepoKey(dir)}/${segs.join("/")}${q}`;
}

/**
 * 這條路由回應的 CSP。
 *
 * **這裡才是真正管得住的地方**：iframe 的 sandbox 只管 iframe，使用者若把網址
 * 貼到新分頁，那份 HTML 就是跟 km 同源的一般頁面 —— 標頭上的 CSP 兩種情境都算。
 *
 * `connect-src`／`form-action` 一律關掉：km 的 API 沒有檢查 `Origin`，
 * 不關的話頁面裡的 script 可以用 km 的身分去打它。
 */
export function rawCsp(allowScripts: boolean): string {
  const parts = [
    "default-src 'none'",
    // `'self'` 才載得到隔壁的相對資產（這條路由與 km 同源）
    "img-src 'self' data: blob: https:",
    "style-src 'self' 'unsafe-inline' data: https:",
    "font-src 'self' data: https:",
    "media-src 'self' data: blob: https:",
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-ancestors 'self'",
  ];
  if (allowScripts) parts.push("script-src 'self' 'unsafe-inline' 'unsafe-eval' https:");
  return parts.join("; ");
}

/**
 * 這個檔在 `/repo/code` 要用哪種預覽。
 *
 * 判準只看白名單給的 MIME —— 副檔名認不出來的一律 `null`（顯示「二進位檔」），
 * 不要猜：猜錯的後果是畫面上出現一個放不出來的播放器或空白的圖框。
 */
export type RawPreviewKind = "image" | "audio" | "video" | "font";

export function previewKindOf(filePath: string): RawPreviewKind | null {
  const mime = rawMimeOf(filePath);
  if (!mime) return null;
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("font/")) return "font";
  return null;
}
