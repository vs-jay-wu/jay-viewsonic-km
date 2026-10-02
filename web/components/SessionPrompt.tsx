"use client";

import { useState } from "react";
import Icon from "@/components/Icon";

/**
 * 對**正在跑的** session 送一段 prompt。
 *
 * 用途：AI 佔著那台的螢幕鍵盤時，你在另一台上還是講得了話
 * （`docs/ideas/km-multi-machine.md` §1 的第一個情境）。
 *
 * ⚠️ 只對 **km 自己開過的分頁**有效。沒開過（或分頁被關了）會回「要先開」而不是
 * 硬找一個終端機送進去 —— 送錯地方的後果是那段文字被當成 shell 指令執行
 * （見 `lib/orca.ts` 的 `sendToSession`）。
 *
 * 送出後**不等回覆**：回覆會寫進 transcript，而那就是這個面板在顯示的東西。
 */
export default function SessionPrompt({
  sessionId,
  machineId,
  machineName,
}: {
  sessionId: string;
  machineId?: string;
  machineName?: string;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setNote(null);
    const res = await fetch(`/api/sessions/${sessionId}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: body, machineId }),
    }).catch(() => null);
    const out = (await res?.json().catch(() => null)) as
      | { status?: string; error?: string; sentTo?: string }
      | null;
    setBusy(false);

    if (res?.ok && out?.status === "sent") {
      setText("");
      setNote({ kind: "ok", text: out.sentTo ? `已送到「${out.sentTo}」` : "已送出" });
      return;
    }
    const why =
      out?.status === "not-open"
        ? "這個 session 沒有開著的分頁 —— 先按「在 Orca 開啟」"
        : out?.status === "orca-down"
          ? "Orca 沒有在跑"
          : (out?.error ?? "送不出去");
    setNote({ kind: "bad", text: why });
  };

  return (
    <div className="shrink-0 border-t border-line bg-surface px-4 py-3">
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter 送出、Shift+Enter 換行 —— 跟 Claude 自己的輸入框一致
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          placeholder={
            machineName ? `送一段話到「${machineName}」上的這個 session…` : "送一段話到這個 session…"
          }
          className="min-h-0 flex-1 resize-none rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none"
        />
        <button
          onClick={() => void send()}
          disabled={busy || !text.trim()}
          className="flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-xs text-fg hover:bg-surface-raised disabled:opacity-50"
        >
          {busy ? <Icon name="spinner" size={13} className="animate-spin" /> : <Icon name="chevronRight" size={13} />}
          送出
        </button>
      </div>
      {note && (
        <p className={`mt-1.5 text-[11px] ${note.kind === "ok" ? "text-fg-muted" : "text-warn"}`}>
          {note.text}
        </p>
      )}
      <p className="mt-1 text-[11px] text-fg-subtle">
        Enter 送出 · Shift+Enter 換行 · 回覆會出現在上面的對話紀錄裡
      </p>
    </div>
  );
}
