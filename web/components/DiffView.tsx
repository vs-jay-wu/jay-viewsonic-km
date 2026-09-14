"use client";

import { useMemo } from "react";
import hljs from "highlight.js/lib/common";
import { languageOf, type DiffLine } from "@/lib/changesRules";

/**
 * unified diff 的顯示：行號、+/- 底色、語法上色。
 *
 * **逐行上色**（不是整檔上色再切）：diff 本來就只有片段，沒有完整檔案可以餵給
 * highlighter。代價是跨行的結構（多行字串、區塊註解）偶爾會上錯色——
 * 這是所有 diff viewer 的共同取捨，換到的是「不必把整個檔案讀進來」。
 *
 * 認不得的副檔名**不上色**，不要硬猜語言（猜錯的上色比沒有上色更難讀）。
 */

const KIND_ROW: Record<string, string> = {
  add: "bg-emerald-50",
  del: "bg-red-50",
  hunk: "bg-gray-100 text-gray-500 select-none",
  context: "",
  meta: "hidden",
};

const KIND_SIGN: Record<string, string> = {
  add: "+",
  del: "−",
  context: " ",
  hunk: "",
  meta: "",
};

export default function DiffView({
  lines,
  file,
  truncated,
}: {
  lines: DiffLine[];
  file: string;
  truncated?: boolean;
}) {
  const lang = languageOf(file);

  const rendered = useMemo(
    () =>
      lines.map((l) => {
        if (l.kind === "hunk" || l.kind === "meta" || !lang || !l.text) return null;
        try {
          return hljs.highlight(l.text, { language: lang, ignoreIllegals: true }).value;
        } catch {
          return null; // 不認得的語言就不上色
        }
      }),
    [lines, lang]
  );

  // 只有 meta 的情況是真的會發生：例如整批 chmod（`old mode 100644` →
  // `new mode 100755`）或純改名。這時畫出來是一張空表格，要改成講清楚發生什麼事。
  const visible = lines.filter((l) => l.kind !== "meta");
  if (!visible.length) {
    const notes = lines
      .map((l) => l.text)
      .filter((t) => /^(old mode|new mode|rename |similarity index|new file|deleted file)/.test(t));
    return (
      <div className="px-4 py-6 text-sm text-gray-500">
        <p>沒有內容差異。</p>
        {notes.length > 0 && (
          <ul className="mt-2 font-mono text-xs text-gray-400">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse font-mono text-[12px] leading-[1.55]">
        <tbody>
          {lines.map((l, i) => {
            if (l.kind === "meta") return null;
            const html = rendered[i];
            return (
              <tr key={i} className={KIND_ROW[l.kind]}>
                <td className="w-10 select-none px-2 text-right align-top text-gray-300">
                  {l.oldNo ?? ""}
                </td>
                <td className="w-10 select-none px-2 text-right align-top text-gray-300">
                  {l.newNo ?? ""}
                </td>
                <td
                  className={`w-4 select-none pl-1 text-center align-top ${
                    l.kind === "add" ? "text-emerald-600" : l.kind === "del" ? "text-red-500" : "text-gray-300"
                  }`}
                >
                  {KIND_SIGN[l.kind]}
                </td>
                <td className="whitespace-pre-wrap break-all px-2 align-top text-gray-800">
                  {html ? <span dangerouslySetInnerHTML={{ __html: html }} /> : l.text || " "}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {truncated && (
        <p className="border-t border-gray-200 px-4 py-2 text-xs text-gray-400">
          這個 diff 太大，只顯示前面一段。
        </p>
      )}
    </div>
  );
}
