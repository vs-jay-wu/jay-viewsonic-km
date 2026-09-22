"use client";

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from "react";

/**
 * 自製的單行輸入對話框（`prompt()` 的替代品）。
 *
 * 跟 `Confirm.tsx` 同一套規則：**不用瀏覽器內建的 `prompt()`**，
 * Enter 送出、Esc 取消，畫面上不標示快捷鍵（Jay 2026-09-11）。
 *
 * ```tsx
 * const ask = usePrompt();
 * const title = await ask({ title: "新 session 的名稱", defaultValue: "[km/mvbf] VB-1 …" });
 * if (title === null) return;   // 取消
 * ```
 */

export interface PromptOptions {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  /** 送出前的檢查：回字串＝錯誤訊息，回 null＝通過 */
  validate?: (value: string) => string | null;
}

type Resolver = (value: string | null) => void;

const PromptContext = createContext<((o: PromptOptions) => Promise<string | null>) | null>(null);

export function usePrompt(): (o: PromptOptions) => Promise<string | null> {
  const ctx = useContext(PromptContext);
  if (!ctx) throw new Error("usePrompt 要放在 <PromptProvider> 裡（已掛在 app/layout.tsx）");
  return ctx;
}

export default function PromptProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<PromptOptions | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const resolverRef = useRef<Resolver | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<Element | null>(null);

  const ask = useCallback((o: PromptOptions) => {
    returnFocusRef.current = document.activeElement;
    setOptions(o);
    setValue(o.defaultValue ?? "");
    setError(null);
    return new Promise<string | null>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const close = useCallback((result: string | null) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setOptions(null);
    const back = returnFocusRef.current;
    if (back instanceof HTMLElement) back.focus();
  }, []);

  const submit = useCallback(() => {
    if (!options) return;
    const v = value.trim();
    const err = options.validate?.(v) ?? (v ? null : "不能是空的");
    if (err) {
      setError(err);
      return;
    }
    close(v);
  }, [options, value, close]);

  useEffect(() => {
    if (!options) return;
    // 預設值通常是要修改的，所以整段選起來，直接打字就能換掉
    inputRef.current?.focus();
    inputRef.current?.select();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [options, close]);

  return (
    <PromptContext.Provider value={ask}>
      {children}
      {/* 點背景**不關閉**：這裡面有打到一半的字，手滑一下就沒了（Jay 2026-09-11）。
          要離開請按取消或 Esc。 */}
      {options && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-6"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={options.title}
            className="w-full max-w-lg rounded-xl bg-surface p-5 shadow-2xl"
          >
            <h2 className="text-sm font-semibold text-fg">{options.title}</h2>
            {options.message && (
              <p className="mt-1 text-xs leading-relaxed text-fg-muted">{options.message}</p>
            )}
            <input
              ref={inputRef}
              value={value}
              placeholder={options.placeholder}
              onChange={(e) => { setValue(e.target.value); setError(null); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              className="mt-3 w-full rounded-lg border border-line-strong px-3 py-2 font-mono text-sm outline-none focus:border-line-strong"
            />
            <div className="mt-1 h-4 text-xs text-danger">{error}</div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => close(null)}
                className="rounded-lg px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-sunken"
              >
                取消
              </button>
              <button
                onClick={submit}
                className="rounded-lg bg-control px-3 py-1.5 text-sm text-on-solid hover:bg-control/85"
              >
                {options.confirmLabel ?? "確定"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PromptContext.Provider>
  );
}
