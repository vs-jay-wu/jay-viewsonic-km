"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";

/**
 * 角落的浮動通知。
 *
 * **不要把「已是最新」這種回報畫在版面裡**（Jay 2026-09-17）：它一出現一消失就把
 * 下面的東西推上推下，而使用者正在讀的是那些東西。浮動的不佔版面，過一下自己收掉。
 *
 * ```tsx
 * const toast = useToast();
 * toast({ ok: true, text: "已是最新" });
 * ```
 *
 * 幾個刻意的行為：
 * - **失敗的停久一點**（12 秒 vs 4 秒）—— 成功只要看到就好，失敗要讀完訊息。
 * - **滑鼠移上去就暫停倒數**：git 的輸出常常有好幾行（fetch 的 prune 清單、
 *   push 被拒的原因），4 秒讀不完。
 * - **一個動作一則通知**，不做「同樣訊息就合併」：連按兩次 fetch 只看到一則，
 *   會以為第二次沒送出去（Jay 2026-09-17 回報）。最多同時留 4 則，超過就擠掉最舊的。
 * - **進出場都用 class ＋ transition 做，不用 `@keyframes`。** 試過兩種寫法都失敗：
 *   寫在 globals.css 頂層的 keyframes 被 Tailwind v4 整支清掉；改放進 `@theme` 之後
 *   keyframes 出得來，但 `animate-*` 的 utility 始終沒被產生。**兩種都沒有任何警告**，
 *   畫面上就是「瞬間出現」（Jay 2026-09-17 回報）。class 切換不經過 Tailwind 的
 *   keyframes 機制，`getAnimations()` 查得到、也驗得了。
 */

export interface ToastOptions {
  /** 成功／失敗，決定配色與停留時間 */
  ok: boolean;
  /** 一行標題 */
  text: string;
  /** 補充內容（例如 git 的原始輸出），可以多行 */
  detail?: string;
  /** 自訂停留毫秒數；給 0 就不自動消失 */
  durationMs?: number;
}

interface Toast extends ToastOptions {
  id: number;
  /** 正在播離場動畫 —— 這段期間還在 DOM 上，但不再計時 */
  leaving?: boolean;
}

const OK_MS = 4_000;
const FAIL_MS = 12_000;
/** 離場動畫的長度，要跟下面的 `duration-200` 一致 */
const LEAVE_MS = 200;
/** 最多同時留幾則 */
const MAX = 4;

const ToastContext = createContext<((o: ToastOptions) => void) | null>(null);

export function useToast(): (o: ToastOptions) => void {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast 要放在 <ToastProvider> 裡（已掛在 app/(km)/layout.tsx）");
  return ctx;
}

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const show = useCallback((o: ToastOptions) => {
    // **不合併相同訊息**：一個動作一則，不然連按兩次會以為第二次沒送出去
    setToasts((cur) => [...cur, { ...o, id: nextId.current++ }].slice(-MAX));
  }, []);

  /** 先標記 leaving 讓離場動畫跑，再真的移除 */
  const dismiss = useCallback((id: number) => {
    setToasts((cur) => cur.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), LEAVE_MS);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {/* 右下角。`pointer-events-none` 讓沒有通知的時候不擋住下面的東西 */}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[min(26rem,calc(100vw-2.5rem))] flex-col gap-2.5">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false);
  /** 掛上去的第一幀是「收起來」的樣子，下一幀才翻成正常 —— 這樣 transition 才會跑 */
  const [entered, setEntered] = useState(false);
  const ms = toast.durationMs ?? (toast.ok ? OK_MS : FAIL_MS);

  useEffect(() => {
    // 要等瀏覽器畫過第一幀，同一幀內改 class 不會有過渡
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (paused || ms <= 0 || toast.leaving) return;
    const id = setTimeout(onDismiss, ms);
    return () => clearTimeout(id);
    // paused 變動時重新計時：滑開之後重新給完整的時間，不要接續倒數
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, ms, toast.leaving]);

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={`pointer-events-auto rounded-xl border px-4 py-3 shadow-lg transition-all duration-200 ease-out ${
        toast.leaving || !entered
          ? "translate-y-3 scale-95 opacity-0"
          : "translate-y-0 scale-100 opacity-100"
      } ${toast.ok ? "border-ok/40 bg-ok-bg" : "border-danger/40 bg-danger-bg"}`}
    >
      <div className="flex items-start gap-2.5">
        <Icon
          name={toast.ok ? "check" : "alert"}
          size={15}
          className={`mt-px shrink-0 ${toast.ok ? "text-ok" : "text-danger"}`}
        />
        <div className="min-w-0 flex-1">
          <p className={`text-[13px] font-medium leading-5 ${toast.ok ? "text-ok" : "text-danger"}`}>
            {toast.text}
          </p>
          {toast.detail && (
            <pre
              className={`mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed ${
                toast.ok ? "text-ok" : "text-danger"
              }`}
            >
              {toast.detail}
            </pre>
          )}
        </div>
        <button
          onClick={onDismiss}
          aria-label="關閉通知"
          className={`shrink-0 ${toast.ok ? "text-ok hover:text-ok" : "text-danger hover:text-danger"}`}
        >
          <Icon name="x" size={13} />
        </button>
      </div>
    </div>
  );
}
