/**
 * `/repo/code` 的 HTML 預覽判準（純規則，有測試）。
 *
 * 預覽走 **`/code-view/…` 這條唯讀路由 ＋ sandbox iframe**：
 * 路徑式的網址讓 HTML 裡的相對資產（`./style.css`、`img/x.png`）解析得到隔壁的
 * 檔案，CSP 則放在**回應標頭**（`lib/codeRawRules.ts` 的 `rawCsp`）——
 * 那樣連「把網址貼到新分頁」那種同源情境也管得到，iframe 的 sandbox 只管 iframe。
 *
 * 仍然畫不對的兩類（畫面上要講，不要讓人以為檔案壞了）：模板（266 個含
 * `{{ }}` / `{% %}` / `ng-`）與片段（410 個沒有 `<html>`）——
 * 那要走建置或伺服器渲染，不是這裡能補的。
 */

export function isHtmlPath(filePath: string): boolean {
  return /\.html?$/i.test(filePath.split("/").pop() ?? "");
}

/** iframe 的 sandbox 值。**永遠不給 `allow-same-origin`** —— 給了就等於沒沙箱 */
export function previewSandbox(allowScripts: boolean): string {
  const tokens = ["allow-popups", "allow-popups-to-escape-sandbox"];
  if (allowScripts) tokens.unshift("allow-scripts");
  return tokens.join(" ");
}
