"use client";

import DOMPurify from "dompurify";
import { useEffect, useRef } from "react";

// 輕量 HTML 清洗（client-side）
function sanitize(html: string): string {
  if (typeof window === "undefined") return html;
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "b", "i", "u", "s", "em", "strong", "br", "a", "ul", "ol", "li", "blockquote", "pre", "code", "span", "div", "at"],
    ALLOWED_ATTR: ["href", "target", "rel"],
    FORCE_BODY: true,
  });
}

export default function MessageContent({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = sanitize(html);
    }
  }, [html]);

  return (
    <div
      ref={ref}
      className="prose prose-sm max-w-none text-fg
        [&_blockquote]:border-l-4 [&_blockquote]:border-line-strong [&_blockquote]:pl-3 [&_blockquote]:text-fg-muted [&_blockquote]:my-1
        [&_p]:my-0.5 [&_a]:text-accent [&_at]:text-accent [&_at]:font-medium
        [&_pre]:bg-surface-sunken [&_pre]:rounded [&_pre]:p-2 [&_code]:bg-surface-sunken [&_code]:rounded [&_code]:px-1"
    />
  );
}
