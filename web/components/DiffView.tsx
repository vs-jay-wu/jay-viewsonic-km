"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import hljs from "highlight.js/lib/common";
import Icon from "@/components/Icon";
import Tooltip from "@/components/Tooltip";
import {
  EXPAND_STEP, contextGaps, expandStep, languageOf, splitGap,
  type ContextGap, type DiffLine,
} from "@/lib/changesRules";
import type { DiffTheme } from "@/lib/uiSettingsRules";

/**
 * unified diff 的顯示：行號、+/- 底色、語法上色。
 *
 * **逐行上色**（不是整檔上色再切）：diff 本來就只有片段，沒有完整檔案可以餵給
 * highlighter。代價是跨行的結構（多行字串、區塊註解）偶爾會上錯色——
 * 這是所有 diff viewer 的共同取捨，換到的是「不必把整個檔案讀進來」。
 *
 * 認不得的副檔名**不上色**，不要硬猜語言（猜錯的上色比沒有上色更難讀）。
 *
 * **展開更多上下文**（GitHub 那條 `⋯`）：hunk 之間沒顯示的行可以按鈕補出來，
 * 也可以一次「顯示整個檔案」——改動夾在原本的位置上，不是另外開一頁。
 * 缺口的計算在 `changesRules.ts`（有測試），這裡只負責抓資料與畫。
 */

const ROW_LIGHT: Record<string, string> = {
  add: "bg-emerald-50",
  del: "bg-red-50",
  hunk: "bg-gray-100 text-gray-500 select-none",
  context: "",
  meta: "hidden",
};

const ROW_DARK: Record<string, string> = {
  add: "bg-emerald-950/60",
  del: "bg-red-950/60",
  hunk: "bg-gray-800 text-gray-400 select-none",
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

/** 補進來的上下文：key 是行號，值是那一行的內容 */
type Filled = Map<number, string>;

type Row =
  | { kind: "diff"; line: DiffLine; index: number }
  | { kind: "filled"; no: number; text: string }
  | { kind: "gap"; gap: ContextGap };

export default function DiffView({
  lines,
  file,
  truncated,
  theme = "dark",
  loadLines,
}: {
  lines: DiffLine[];
  file: string;
  truncated?: boolean;
  /** 配色在設定頁改（`/settings`），預設深色 */
  theme?: DiffTheme;
  /**
   * 抓檔案的第 from..to 行（新檔那一側）。**不給就不顯示展開按鈕** ——
   * 有些情境（例如未追蹤的新檔）本來就沒有「更多上下文」可言。
   */
  loadLines?: (from: number, to: number | null) => Promise<{ lines: string[]; total: number } | null>;
}) {
  const dark = theme === "dark";
  const [filled, setFilled] = useState<Filled>(new Map());
  const [total, setTotal] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // 換檔案就把補進來的東西清掉，否則會拿上一個檔案的內容來填
  useEffect(() => {
    setFilled(new Map());
    setTotal(null);
  }, [file, lines]);

  const gaps = useMemo(() => (loadLines ? contextGaps(lines) : []), [lines, loadLines]);

  const fetchRange = useCallback(
    async (from: number, to: number | null) => {
      if (!loadLines) return;
      setBusy(true);
      try {
        const got = await loadLines(from, to);
        if (!got) return;
        setTotal(got.total);
        setFilled((prev) => {
          const next = new Map(prev);
          got.lines.forEach((text, i) => next.set(from + i, text));
          return next;
        });
      } finally {
        setBusy(false);
      }
    },
    [loadLines]
  );

  /** 一次把整份檔案補進來 —— 改動仍夾在原本的位置上 */
  const showWholeFile = useCallback(() => void fetchRange(1, null), [fetchRange]);
  const KIND_ROW = dark ? ROW_DARK : ROW_LIGHT;
  const lang = languageOf(file);

  /**
   * 實際要畫的列＝原本的 diff ＋ 補進來的上下文 ＋ 還沒補完的缺口那一條。
   *
   * 補進來的行插在它該在的位置（缺口的 atIndex 之前），所以**改動仍然夾在
   * 原本的上下文裡**，不是另外開一份完整檔案。
   */
  const rows = useMemo<Row[]>(() => {
    const byIndex = new Map<number, ContextGap>();
    for (const g of gaps) byIndex.set(g.atIndex, g);

    const out: Row[] = [];
    const emitGap = (g: ContextGap) => {
      // 拆成「補到的行」與「還沒補的缺口」—— 補到的可能在缺口的任何位置
      // （往上展開補的是末端），所以要走完整段，見 splitGap 的註解
      for (const piece of splitGap(g, (n) => filled.has(n), total)) {
        if (piece.kind === "line") {
          out.push({ kind: "filled", no: piece.no, text: filled.get(piece.no) ?? "" });
        } else {
          out.push({ kind: "gap", gap: { atIndex: g.atIndex, from: piece.from, to: piece.to } });
        }
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const g = byIndex.get(i);
      if (g) emitGap(g);
      if (lines[i].kind !== "meta") out.push({ kind: "diff", line: lines[i], index: i });
    }
    const tail = byIndex.get(lines.length);
    if (tail) emitGap(tail);
    return out;
  }, [lines, gaps, filled, total]);

  const highlight = useCallback(
    (text: string) => {
      if (!lang || !text) return null;
      try {
        return hljs.highlight(text, { language: lang, ignoreIllegals: true }).value;
      } catch {
        return null; // 不認得的語言就不上色
      }
    },
    [lang]
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
    <div className={`overflow-x-auto ${dark ? "bg-[#0d1117]" : "bg-white"}`}>
      {loadLines && gaps.length > 0 && (
        <div
          className={`sticky top-0 z-10 flex items-center gap-2 border-b px-3 py-1.5 text-[11px] ${
            dark ? "border-gray-800 bg-[#0d1117] text-gray-400" : "border-gray-200 bg-white text-gray-500"
          }`}
        >
          <button
            onClick={showWholeFile}
            disabled={busy}
            className={`rounded border px-2 py-0.5 disabled:opacity-40 ${
              dark ? "border-gray-700 hover:bg-gray-800" : "border-gray-300 hover:bg-gray-50"
            }`}
          >
            {busy ? "載入中…" : "顯示整個檔案"}
          </button>
          {filled.size > 0 && (
            <button
              onClick={() => {
                setFilled(new Map());
                setTotal(null);
              }}
              className="underline hover:text-gray-700"
            >
              只看改動
            </button>
          )}
          <span className="ml-auto">改動的位置不會變，只是把前後的內容補回來</span>
        </div>
      )}
      <table className="w-full border-collapse font-mono text-[12px] leading-[1.55]">
        <tbody>
          {rows.map((row, k) => {
            if (row.kind === "gap") {
              const g = row.gap;
              const size = g.to === null ? null : g.to - g.from + 1;
              const big = size === null || size > EXPAND_STEP;
              return (
                <tr key={`g${k}`} className={dark ? "bg-gray-800/60" : "bg-gray-100"}>
                  <td colSpan={3} className="select-none px-1 py-0.5 text-center">
                    <span className="flex items-center justify-center gap-0.5">
                      {big && g.to !== null && (
                        <Tooltip label={`往上補 ${EXPAND_STEP} 行`}>
                          <button
                            onClick={() => void fetchRange(...rangeOf(expandStep(g, "up")))}
                            disabled={busy}
                            aria-label="往上展開"
                            className={dark ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-900"}
                          >
                            <Icon name="toTop" size={11} />
                          </button>
                        </Tooltip>
                      )}
                      <Tooltip
                        label={
                          size === null
                            ? `再補 ${EXPAND_STEP} 行（到檔尾）`
                            : big
                              ? `這裡藏了 ${size} 行，全部展開`
                              : `補回這 ${size} 行`
                        }
                      >
                        <button
                          onClick={() => void fetchRange(...rangeOf(expandStep(g, big ? "down" : "all")))}
                          disabled={busy}
                          aria-label="展開更多"
                          className={dark ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-900"}
                        >
                          {big ? <Icon name="toBottom" size={11} /> : <span className="px-1">⋯</span>}
                        </button>
                      </Tooltip>
                    </span>
                  </td>
                  <td
                    className={`select-none px-2 text-[11px] ${dark ? "text-gray-500" : "text-gray-400"}`}
                  >
                    {size === null ? `第 ${g.from} 行之後` : `藏了 ${size} 行（${g.from}–${g.to}）`}
                  </td>
                </tr>
              );
            }

            if (row.kind === "filled") {
              const html = highlight(row.text);
              return (
                <tr key={`f${k}`} className={dark ? "bg-gray-900/40" : "bg-gray-50/60"}>
                  <td className={`w-10 select-none px-2 text-right align-top ${dark ? "text-gray-700" : "text-gray-300"}`} />
                  <td className={`w-10 select-none px-2 text-right align-top ${dark ? "text-gray-600" : "text-gray-300"}`}>
                    {row.no}
                  </td>
                  <td className="w-4 select-none pl-1 text-center align-top" />
                  <td className={`whitespace-pre-wrap break-all px-2 align-top ${dark ? "text-gray-400" : "text-gray-500"}`}>
                    {html ? <span dangerouslySetInnerHTML={{ __html: html }} /> : row.text || " "}
                  </td>
                </tr>
              );
            }

            const l = row.line;
            const html = highlight(l.kind === "hunk" ? "" : l.text);
            return (
              <tr key={`d${row.index}`} className={KIND_ROW[l.kind]}>
                <td className={`w-10 select-none px-2 text-right align-top ${dark ? "text-gray-600" : "text-gray-300"}`}>
                  {l.oldNo ?? ""}
                </td>
                <td className={`w-10 select-none px-2 text-right align-top ${dark ? "text-gray-600" : "text-gray-300"}`}>
                  {l.newNo ?? ""}
                </td>
                <td
                  className={`w-4 select-none pl-1 text-center align-top ${
                    l.kind === "add"
                      ? "text-emerald-500"
                      : l.kind === "del"
                        ? "text-red-400"
                        : dark ? "text-gray-600" : "text-gray-300"
                  }`}
                >
                  {KIND_SIGN[l.kind]}
                </td>
                <td className={`whitespace-pre-wrap break-all px-2 align-top ${dark ? "text-gray-200" : "text-gray-800"}`}>
                  {html ? <span dangerouslySetInnerHTML={{ __html: html }} /> : l.text || " "}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {truncated && (
        <p className={`border-t px-4 py-2 text-xs text-gray-400 ${dark ? "border-gray-800" : "border-gray-200"}`}>
          這個 diff 太大，只顯示前面一段。
        </p>
      )}
    </div>
  );
}

/** `expandStep` 回的是物件，`fetchRange` 吃的是兩個參數 */
function rangeOf(r: { from: number; to: number | null }): [number, number | null] {
  return [r.from, r.to];
}
