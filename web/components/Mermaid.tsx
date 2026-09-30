"use client";

import { useEffect, useId, useState } from "react";

/**
 * markdown 裡的 ```mermaid 區塊。
 *
 * **動態 import**：mermaid 打包起來一百多萬位元組，而絕大多數 markdown 沒有圖 ——
 * 放進主 bundle 等於每個人都付這個錢。只有真的遇到 mermaid 區塊才載。
 *
 * **畫不出來不能炸掉整份預覽**：語法錯誤時 mermaid 會丟例外，這裡接住、
 * 把錯誤訊息與原始碼一起顯示 —— 那正是你要拿去修的東西。
 */
export default function Mermaid({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /**
   * 每個圖要有自己的 id：mermaid 用它當 SVG 內部各節點 id 的前綴。
   * 用 `useId` 而不是 `Math.random()` —— render 期間不該呼叫不純的函式
   * （React Compiler 會擋）。`useId` 的值長得像 `:r1:`，冒號在選擇器裡要跳脫，
   * 所以只留下英數。
   */
  const domId = `km-mermaid-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        const root = document.documentElement;
        // 主題三態：`data-theme` 有值就照它，`system` 那一態沒有屬性，問 CSS
        const dark =
          root.dataset.theme === "dark" ||
          (!root.dataset.theme && window.matchMedia("(prefers-color-scheme: dark)").matches);
        mermaid.initialize({
          startOnLoad: false,
          // `strict` 會把圖裡的 HTML 標籤與 click 處理器擋掉 —— 這些檔案來自
          // 各個 repo，不是我們寫的，預覽不該讓它們有任何執行能力
          securityLevel: "strict",
          theme: dark ? "dark" : "default",
          flowchart: { curve: "basis", padding: 12, useMaxWidth: true },
        });
        const out = await mermaid.render(domId, code);
        if (alive) {
          setSvg(out.svg);
          setErr(null);
        }
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [code, domId]);

  if (err) {
    return (
      <div className="rounded-lg border border-warn bg-warn-bg p-3">
        <p className="mb-2 text-xs text-warn">這張 mermaid 圖畫不出來：{err}</p>
        <pre className="overflow-auto text-xs">{code}</pre>
      </div>
    );
  }
  if (!svg) return <p className="text-xs text-fg-subtle">畫圖中…</p>;
  return (
    // mermaid 產出的 SVG（`securityLevel: "strict"` 之下不含 script 與事件處理器）
    <div className="km-mermaid overflow-auto" dangerouslySetInnerHTML={{ __html: svg }} />
  );
}
