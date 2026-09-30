"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import Tooltip from "@/components/Tooltip";
import { previewSandbox } from "@/lib/htmlPreviewRules";
import { codeRawUrl } from "@/lib/codeRawRules";

/**
 * HTML 的預覽：**`/code-view/…` 這條唯讀路由 ＋ sandbox iframe**。
 *
 * 走路由（而不是 `srcdoc`）是為了**相對資產**：`./style.css`、`img/x.png` 要能
 * 解析到隔壁的檔案。專案 repo 的 1084 個 HTML 裡有 466 個是這種。
 *
 * script 預設**關**（590 個檔含 `<script>`）；開了也仍在沙箱內，而且那條路由的
 * CSP 會關掉 `connect-src` 與 `form-action` —— km 的 API 沒有檢查 `Origin`，
 * 不關的話頁面裡的 script 可以用 km 的身分去打它。
 *
 * 模板（`{{ }}`）與片段（沒有 `<html>`）本來就畫不對，那要走建置或伺服器渲染。
 */
export default function HtmlPreview({ dir, path }: { dir: string; path: string }) {
  const [allowScripts, setAllowScripts] = useState(false);
  const src = codeRawUrl(dir, path, { scripts: allowScripts });

  const btn = (active: boolean) =>
    `flex items-center gap-1 rounded-md border px-1.5 py-0.5 ${
      active ? "border-accent/50 bg-surface-selected text-accent" : "border-line hover:text-fg"
    }`;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-1.5 text-[11px] text-fg-muted">
        <span>沙箱預覽</span>
        <span className="text-fg-subtle">模板與片段畫不出正確的樣子</span>
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
              className={btn(allowScripts)}
            >
              <Icon name="play" size={11} />
              script
            </button>
          </Tooltip>
          <Tooltip label="用新分頁開（同一條唯讀路由，CSP 一樣擋著）">
            <a href={src} target="_blank" rel="noreferrer" className={btn(false)}>
              <Icon name="external" size={11} />
              新分頁
            </a>
          </Tooltip>
        </div>
      </div>

      {/*
        `sandbox` **永遠不給 `allow-same-origin`** —— 給了就等於沒沙箱：
        裡面的 script 就能讀 km 的 localStorage、也能以 km 的身分打 km 的 API。
        `key` 帶著網址：換檔案或改 script 開關都要重建 iframe。
      */}
      <iframe
        key={src}
        title="HTML 預覽"
        src={src}
        sandbox={previewSandbox(allowScripts)}
        className="min-h-0 w-full flex-1 border-0 bg-white"
      />
    </div>
  );
}
