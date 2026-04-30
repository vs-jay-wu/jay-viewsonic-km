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
      className="prose prose-sm max-w-none text-gray-800
        [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:text-gray-500 [&_blockquote]:my-1
        [&_p]:my-0.5 [&_a]:text-blue-600 [&_at]:text-blue-600 [&_at]:font-medium
        [&_pre]:bg-gray-100 [&_pre]:rounded [&_pre]:p-2 [&_code]:bg-gray-100 [&_code]:rounded [&_code]:px-1"
    />
  );
}
