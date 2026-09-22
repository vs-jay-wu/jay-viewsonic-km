"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isStale, relativeWording, type Note } from "@/lib/noteRules";

/**
 * 首頁的快速筆記：**一格、隨打隨存、沒有送出鍵**。
 *
 * 記的是「今天幾點下班」這種明天就沒用的事，所以設計重點只有三個：
 * 1. 零摩擦 —— 進首頁就能打字，不用點任何東西。
 * 2. 不掉字 —— 沒有送出鍵，「最後幾個字沒存到」是唯一真正的失敗模式，
 *    所以停止打字、失焦、分頁被切走各存一次（最後那次要用 keepalive）。
 * 3. 看得出過期 —— 不是今天寫的就把時間轉成天藍＋小圓點。**不用琥珀或紅色**，
 *    那兩個在這個 app 裡分別是警告與「要你處理」，這只是資訊。
 */

const SAVE_DEBOUNCE_MS = 600;

export default function QuickNote() {
  const [text, setText] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [connected, setConnected] = useState(false);
  /** 讓「5 分鐘前」會自己走動 */
  const [, setTick] = useState(0);

  const boxRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 這個分頁的識別碼：推播時 server 會跳過它自己。
   *  用 lazy initializer 而不是在 render 裡塞 ref —— 後者會在 render 期間
   *  讀寫 ref 並呼叫不純的函式（lint 會擋，而且 StrictMode 下行為不保證）。 */
  const [clientId] = useState(() => Math.random().toString(36).slice(2));
  /** 正在打字時不要被別的分頁蓋掉；停手後自己的存檔會贏（以最後寫入為準） */
  const typingRef = useRef(false);
  const latestRef = useRef("");

  const save = useCallback((value: string, opts: { keepalive?: boolean } = {}) => {
    const body = JSON.stringify({ text: value, clientId: clientId });
    void fetch("/api/note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: opts.keepalive,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((note: Note | null) => {
        if (note) setUpdatedAt(note.updatedAt);
      })
      .catch(() => undefined);
  }, [clientId]);

  // ─── 一開始的內容與 SSE ───────────────────────────────────────────────────
  useEffect(() => {
    const es = new EventSource(`/api/note/stream?clientId=${clientId}`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.addEventListener("note", (e) => {
      setConnected(true);
      const note = JSON.parse((e as MessageEvent).data) as Note;
      // 正在打字就不要蓋掉；只更新時間
      if (typingRef.current && note.text !== latestRef.current) {
        setUpdatedAt(note.updatedAt);
        return;
      }
      latestRef.current = note.text;
      setText(note.text);
      setUpdatedAt(note.updatedAt);
    });
    return () => es.close();
  }, [clientId]);

  // 相對時間每分鐘重算一次
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  // 分頁被切走／關掉時補存一次 —— 只靠 debounce 的話，打完字直接切分頁會掉字
  useEffect(() => {
    const flush = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        save(latestRef.current, { keepalive: true });
      }
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
    };
  }, [save]);

  const onChange = (value: string) => {
    setText(value);
    latestRef.current = value;
    typingRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      typingRef.current = false;
      save(value);
    }, SAVE_DEBOUNCE_MS);
  };

  const onBlur = () => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
    typingRef.current = false;
    save(latestRef.current);
  };

  function onChangeImmediate(value: string) {
    setText(value);
    latestRef.current = value;
    typingRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    save(value);
  }

  // 內容多的時候自己長高（但不要無限長）
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [text]);

  const when = updatedAt ? new Date(updatedAt) : null;
  const now = new Date();
  const stale = !!when && isStale(when, now);

  return (
    <div className="mt-6 rounded-xl border border-line bg-surface px-4 py-3 focus-within:border-line-strong">
      <textarea
        ref={boxRef}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        rows={1}
        placeholder="隨手記點什麼…（自動儲存）"
        className="w-full resize-none bg-transparent text-sm leading-relaxed text-fg outline-none placeholder:text-fg-subtle"
      />

      {/* 這一行固定佔高度，不然打第一個字時整塊會抖一下 */}
      <div className="flex h-5 items-center gap-2 text-[11px]">
        {when && text ? (
          <span className={`inline-flex items-center gap-1.5 ${stale ? "text-accent" : "text-fg-subtle"}`}>
            {stale && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
            {relativeWording(when, now)}更新
          </span>
        ) : (
          <span className="text-fg-disabled">尚未記錄</span>
        )}

        {!connected && <span className="text-fg-subtle">· 未連線</span>}

      </div>
    </div>
  );
}
