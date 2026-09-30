"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import hljs from "@/lib/highlight";
import Mermaid from "@/components/Mermaid";
import {
  MD_EXTRA_TAGS, dedupe, isMermaidFence, slugify, type Heading,
} from "@/lib/markdownTocRules";

/**
 * markdown 的預覽 ＋ 目錄。目錄**只在預覽出現**（Jay 2026-09-24）。
 *
 * 錨點與目錄都是**畫好之後從 DOM 反讀**的，不另外再解析一次 markdown：
 *
 * - 兩邊各解析一次的話，只要有一種寫法兩邊解讀不同（setext 標題、內嵌 HTML、
 *   圍欄裡的 `#`），目錄點下去就跳不過去，而且不會有錯誤訊息。
 * - 也擋掉「在 render 裡用計數器發 id」那種做法 —— React 的嚴格模式會把同一次
 *   render 跑兩遍，計數器跟著加兩次，id 全部多一個 `-1` 尾巴（實際踩過）。
 */
/**
 * 允許的標籤／屬性。`defaultSchema` 已經擋掉 `<script>`、`on*` 與
 * `javascript:` 這類東西，這裡只是把 GitHub 常用的折疊區塊補進去。
 */
const SCHEMA = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), ...MD_EXTRA_TAGS],
  attributes: {
    ...defaultSchema.attributes,
    details: [...(defaultSchema.attributes?.details ?? []), "open"],
    // 上色後的 token 掛的是 `hljs-*` 這組 class
    span: [...(defaultSchema.attributes?.span ?? []), ["className", /^hljs-/]],
    code: [...(defaultSchema.attributes?.code ?? []), ["className", /^language-/, "hljs"]],
  },
};

export default function MarkdownPreview({ text }: { text: string }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [toc, setToc] = useState<Heading[]>([]);

  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    const seen = new Map<string, number>();
    const out: Heading[] = [];
    for (const el of root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")) {
      const t = (el.textContent ?? "").trim();
      if (!t) continue;
      const slug = dedupe(slugify(t), seen);
      el.id = slug;
      out.push({ level: Number(el.tagName[1]), text: t, slug });
    }
    setToc(out);
  }, [text]);

  /** 最淺的那一層當基準，縮排才不會整份都往右擠（很多檔案沒有 h1） */
  const minLevel = toc.length ? Math.min(...toc.map((h) => h.level)) : 1;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      {/* `min-w-0` 不能省：flex 項目預設 `min-width:auto`，內文有寬表格時會把自己
          撐到超過容器，目錄那一欄就被擠出畫面外（而且不會有捲軸） */}
      <div ref={bodyRef} className="min-h-0 min-w-0 flex-1 overflow-auto px-6 py-5">
        <div className="md-body mx-auto max-w-3xl">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            /*
             * `rehype-raw` 讓 md 裡的原生 HTML（`<br>`、`<details>`…）真的變成節點；
             * **順序不能反** —— sanitize 要跑在 raw 之後，才輪得到它過濾那些節點。
             */
            rehypePlugins={[rehypeRaw, [rehypeSanitize, SCHEMA]]}
            components={{
              /*
               * ```mermaid 的區塊改畫成圖。
               *
               * 攔 `pre` 而不是 `code`：只換 `code` 的話外面那層 `<pre>` 還在，
               * 圖會被套上程式碼區塊的底色與內距。
               */
              pre(props) {
                const child = Array.isArray(props.children) ? props.children[0] : props.children;
                const inner = (child as { props?: { className?: unknown; children?: unknown } })?.props;
                if (isMermaidFence(inner?.className)) {
                  return <Mermaid code={String(inner?.children ?? "").replace(/\n$/, "")} />;
                }
                return <pre>{props.children}</pre>;
              },
              /*
               * ```<語言> 的區塊照語言上色。用的是 app 共用的那個 hljs 實例
               * （`lib/highlight.ts`），所以 `.bat`／`nginx` 那些也認得。
               *
               * **`getLanguage` 的守衛不能省**：沒註冊的語言 hljs 會在丟例外
               * **之前**先印一行 console.error，try/catch 擋不住那行 log。
               */
              code(props) {
                const cls = typeof props.className === "string" ? props.className : "";
                const m = /language-([\w-]+)/.exec(cls);
                const src = String(props.children ?? "");
                if (!m || !hljs.getLanguage(m[1])) return <code className={cls}>{props.children}</code>;
                try {
                  const html = hljs.highlight(src.replace(/\n$/, ""), {
                    language: m[1],
                    ignoreIllegals: true,
                  }).value;
                  return (
                    <code
                      className={`${cls} hljs`}
                      dangerouslySetInnerHTML={{ __html: html }}
                    />
                  );
                } catch {
                  return <code className={cls}>{props.children}</code>;
                }
              },
            }}
          >
            {text}
          </ReactMarkdown>
        </div>
      </div>

      {/* 只有一個標題的文件不值得佔一欄 */}
      {toc.length > 1 && (
        <nav className="hidden w-60 shrink-0 overflow-auto border-l border-line px-3 py-4 lg:block">
          <p className="mb-2 text-[11px] font-medium text-fg-subtle">目錄</p>
          {toc.map((h) => (
            <button
              key={h.slug}
              onClick={() =>
                bodyRef.current
                  ?.querySelector(`#${CSS.escape(h.slug)}`)
                  ?.scrollIntoView({ block: "start", behavior: "smooth" })
              }
              style={{ paddingLeft: (h.level - minLevel) * 12 }}
              className="block w-full truncate py-0.5 text-left text-xs text-fg-muted hover:text-fg"
              title={h.text}
            >
              {h.text}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
