"use client";

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from "react";
import Icon from "@/components/Icon";

/**
 * 自製的確認對話框。
 *
 * **這個 repo 的 UI 不用瀏覽器內建的 `confirm()` / `alert()`**（Jay 2026-09-11）：
 * 樣式不受控、擋住整個分頁、而且沒辦法讓 Enter 直接確認。
 *
 * 用法跟 `confirm()` 一樣是等一個布林，所以取代既有呼叫時不必改控制流：
 *
 * ```tsx
 * const confirm = useConfirm();
 * if (!(await confirm({ title: "刪掉這筆？", danger: true }))) return;
 * ```
 *
 * 鍵盤：**Enter 確認、Esc 取消**。開啟時焦點落在確認鈕上，所以直接按 Enter
 * 就送出；Tab 只在對話框內循環，不會跑到後面的頁面上。
 */

export interface ConfirmOptions {
  title: string;
  /** 補充說明；要強調的後果寫在這裡（例：無法復原） */
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 破壞性操作 —— 確認鈕轉紅 */
  danger?: boolean;
}

type Resolver = (ok: boolean) => void;

const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

export function useConfirm(): (o: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm 要放在 <ConfirmProvider> 裡（已掛在 app/layout.tsx）");
  }
  return ctx;
}

export default function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<Resolver | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /** 關掉之後把焦點還給原本那顆按鈕，不然鍵盤操作會掉回頁面開頭 */
  const returnFocusRef = useRef<Element | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    returnFocusRef.current = document.activeElement;
    setOptions(o);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const close = useCallback((ok: boolean) => {
    resolverRef.current?.(ok);
    resolverRef.current = null;
    setOptions(null);
    const back = returnFocusRef.current;
    if (back instanceof HTMLElement) back.focus();
  }, []);

  useEffect(() => {
    if (!options) return;
    confirmBtnRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
        return;
      }
      if (e.key === "Enter") {
        // 焦點在取消鈕上時，Enter 應該是「取消」——那是使用者自己移過去的
        if (document.activeElement?.getAttribute("data-confirm-cancel") === "true") return;
        e.preventDefault();
        close(true);
        return;
      }
      if (e.key === "Tab") {
        // 焦點鎖在對話框內
        const focusables = panelRef.current?.querySelectorAll<HTMLElement>("button");
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [options, close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-6"
          onClick={() => close(false)}
          role="presentation"
        >
          <div
            ref={panelRef}
            role="alertdialog"
            aria-modal="true"
            aria-label={options.title}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl bg-surface p-5 shadow-xl"
          >
            <div className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  options.danger ? "bg-danger-bg text-danger" : "bg-surface-sunken text-fg-muted"
                }`}
              >
                <Icon name={options.danger ? "alert" : "search"} size={16} />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-fg">{options.title}</h2>
                {options.message && (
                  <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
                    {options.message}
                  </p>
                )}
              </div>
            </div>

            {/* 鍵盤仍然是 Enter 確認、Esc 取消，只是不在畫面上標示 */}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                data-confirm-cancel="true"
                onClick={() => close(false)}
                className="rounded-lg border border-line px-3 py-2 text-sm text-fg hover:bg-surface-raised"
              >
                {options.cancelLabel ?? "取消"}
              </button>
              <button
                ref={confirmBtnRef}
                onClick={() => close(true)}
                className={`rounded-lg px-3.5 py-2 text-sm font-medium text-on-solid ${
                  options.danger ? "bg-danger hover:bg-danger/85" : "bg-control hover:bg-control/85"
                }`}
              >
                {options.confirmLabel ?? "確定"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
