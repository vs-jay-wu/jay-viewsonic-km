"use client";

import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import Tooltip from "@/components/Tooltip";
import { previewSandbox, withPreviewCsp } from "@/lib/htmlPreviewRules";

/**
 * HTML 的預覽。**`<iframe srcdoc>` ＋ sandbox**，不經過任何新的 server 路徑 ——
 * 內容已經在 `/api/code/file` 的回應裡（見 `lib/htmlPreviewRules.ts` 的檔頭）。
 *
 * 兩個已知限制，畫面上要講出來，不要讓人以為是檔案壞了：
 *
 * 1. **srcdoc 沒有 base URL** → 引相對路徑資產（`./style.css`、`img/x.png`）的
 *    檔案會破圖。專案 repo 的 1084 個 HTML 裡有 466 個是這種。
 * 2. **模板與片段本來就畫不對**：266 個含 `{{ }}` / `{% %}` / `ng-` 之類，
 *    410 個沒有 `<html>`。那要走建置或伺服器渲染，不是這裡能補的。
 *
 * script 預設**關**：590 個檔含 `<script>`，其中有些是「JS 生投影片」那種、
 * 關著會是空白，所以給一顆開關 —— 但預設關才是對的起點。
 */
export default function HtmlPreview({ html }: { html: string }) {
  const [allowScripts, setAllowScripts] = useState(false);
  const doc = useMemo(() => withPreviewCsp(html, allowScripts), [html, allowScripts]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-1.5 text-[11px] text-fg-muted">
        <span>沙箱預覽</span>
        <span className="text-fg-subtle">相對路徑的圖與 css 不會載入</span>
        <div className="ml-auto flex items-center gap-1">
          <Tooltip
            label={
              allowScripts
                ? "關掉頁面裡的 script"
                : "讓頁面裡的 script 執行（仍在沙箱內：讀不到 km，也不能送請求）"
            }
          >
            <button
              onClick={() => setAllowScripts((v) => !v)}
              aria-pressed={allowScripts}
              className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 ${
                allowScripts
                  ? "border-accent/50 bg-surface-selected text-accent"
                  : "border-line hover:text-fg"
              }`}
            >
              <Icon name="play" size={11} />
              script
            </button>
          </Tooltip>
        </div>
      </div>

      {/*
        `sandbox` **永遠不給 `allow-same-origin`** —— 給了就等於沒沙箱：
        裡面的 script 就能讀 km 的 localStorage、也能以 km 的身分打 km 的 API。
        `key` 帶著 script 開關：改開關要重建 iframe，不然舊的 sandbox 還在。
      */}
      <iframe
        key={allowScripts ? "scripts" : "static"}
        title="HTML 預覽"
        srcDoc={doc}
        sandbox={previewSandbox(allowScripts)}
        className="min-h-0 w-full flex-1 border-0 bg-white"
      />
    </div>
  );
}
