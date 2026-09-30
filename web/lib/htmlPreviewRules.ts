/**
 * `/repo/code` 的 HTML 預覽。判準與字串處理放這裡（純規則，有測試）。
 *
 * 預覽是 **`<iframe srcdoc>` ＋ sandbox**，不是新開一條「把 repo 檔案送出去」的
 * 路由 —— 內容已經在 `/api/code/file` 的回應裡，這樣機敏檔案的守衛面完全沒變。
 *
 * 代價是 **srcdoc 沒有 base URL**：引相對路徑資產（`./style.css`、`img/x.png`）
 * 的檔案會破圖。實測專案 repo 的 1084 個 HTML 裡有 466 個是這種；真正「自己一個
 * 檔就完整」的有 249 個，那才是這個預覽要服務的對象（簡報、圖表、對話匯出）。
 */

export function isHtmlPath(filePath: string): boolean {
  return /\.html?$/i.test(filePath.split("/").pop() ?? "");
}

/**
 * 預覽用的 CSP。
 *
 * sandbox（沒有 `allow-same-origin`）擋得住它**讀** km，擋不住它**送**請求 ——
 * km 的 API 沒有檢查 `Origin`，所以 `connect-src` 與 `form-action` 要自己關掉。
 *
 * 其餘一律放行 `https:` 與 `data:`：那 249 個自成一頁的檔大量用 Google Fonts
 * 與 inline style，鎖太緊會讓預覽整個走樣，而那是預覽唯一的用途。
 * `'self'` 在這裡沒有意義 —— sandbox 之後是 opaque origin，`'self'` 等於什麼都不是。
 */
export function previewCsp(allowScripts: boolean): string {
  const parts = [
    "default-src 'none'",
    "img-src data: blob: https:",
    "style-src 'unsafe-inline' data: https:",
    "font-src data: https:",
    "media-src data: blob: https:",
    "frame-src https:",
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ];
  // `unsafe-eval` 是給那種「JS 生投影片」的簡報用的；不開 script 時整條不出現
  if (allowScripts) parts.push("script-src 'unsafe-inline' 'unsafe-eval' data: https:");
  return parts.join("; ");
}

/**
 * 把 CSP 的 `<meta>` 插進文件最前面。
 *
 * ⚠️ **一定要插在 `<head>` 的第一個子節點之前**：`http-equiv` 的 CSP 只對它
 * **之後**的內容生效，插在既有的 `<link>`／`<script>` 後面等於沒插。
 * 沒有 `<head>` 的片段就插在整份的最前面（瀏覽器會自己補 head）。
 */
export function withPreviewCsp(html: string, allowScripts: boolean): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${previewCsp(allowScripts)}">`;
  const m = /<head[^>]*>/i.exec(html);
  if (!m) return meta + html;
  const at = m.index + m[0].length;
  return html.slice(0, at) + meta + html.slice(at);
}

/** iframe 的 sandbox 值。**永遠不給 `allow-same-origin`** —— 給了就等於沒沙箱 */
export function previewSandbox(allowScripts: boolean): string {
  const tokens = ["allow-popups", "allow-popups-to-escape-sandbox"];
  if (allowScripts) tokens.unshift("allow-scripts");
  return tokens.join(" ");
}
