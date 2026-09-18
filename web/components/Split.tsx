"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * 可拖曳的欄寬。「未提交的改動」與「Repo 檢視」共用 —— 兩邊各寫一份一定會漂移
 * （夾限、存檔時機、雙擊還原這些細節都踩過坑）。
 */

const WIDE_QUERY = "(min-width: 1024px)";

/**
 * 是不是雙欄版面（lg 以上）才套自訂寬度。窄螢幕的欄位是整頁寬，硬套會變成細長條。
 *
 * 用 `useSyncExternalStore` 而不是 effect ＋ setState：後者第一幀一定是 false，
 * 會先用預設寬度畫一次再跳成使用者的寬度。
 */
export function useWideLayout(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(WIDE_QUERY);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false // SSR：先當窄螢幕，掛載後立刻校正
  );
}

export interface DragWidth {
  width: number;
  /** 掛在分隔線上 */
  handleProps: {
    onPointerDown: (e: React.PointerEvent) => void;
    onDoubleClick: () => void;
  };
}

/**
 * 拖曳改寬度。
 *
 * `measure(clientX)` 由呼叫端決定「滑鼠在這個 x 時，這一欄該多寬」——
 * 左欄是 `clientX - 左緣`，右欄是 `右緣 - clientX`，所以不寫死在這裡。
 *
 * **存檔時重算一次寬度，不要讀 state**：拖曳過程沒有等 React 重繪的保證，
 * 讀 state／ref 會存到上一個值（踩過）。
 */
export function useDragWidth(opts: {
  storageKey: string;
  defaultWidth: number;
  min: number;
  max: number;
  measure: (clientX: number) => number;
}): DragWidth {
  const { storageKey, defaultWidth, min, max } = opts;
  const [width, setWidth] = useState(defaultWidth);
  const dragging = useRef(false);
  // measure 由呼叫端每次 render 重建，用 ref 拿最新的，監聽才不用重掛。
  // 指派要放在 effect 裡（render 期間寫 ref 會被 lint 擋，也不保證安全）
  const measureRef = useRef(opts.measure);
  useEffect(() => {
    measureRef.current = opts.measure;
  });

  const clamp = useCallback((w: number) => Math.min(max, Math.max(min, Math.round(w))), [min, max]);

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(storageKey));
      if (Number.isFinite(saved) && saved > 0) setWidth(clamp(saved));
    } catch {
      /* 讀不到就用預設 */
    }
  }, [storageKey, clamp]);

  useEffect(() => {
    const save = (w: number) => {
      try {
        localStorage.setItem(storageKey, String(w));
      } catch {
        /* 存不了就算了 */
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      e.preventDefault();
      setWidth(clamp(measureRef.current(e.clientX)));
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.removeProperty("user-select");
      save(clamp(measureRef.current(e.clientX)));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [storageKey, clamp]);

  return {
    width,
    handleProps: {
      onPointerDown: (e) => {
        e.preventDefault();
        dragging.current = true;
        document.body.style.userSelect = "none";
      },
      onDoubleClick: () => {
        setWidth(defaultWidth);
        try {
          localStorage.setItem(storageKey, String(defaultWidth));
        } catch {
          /* 存不了就算了 */
        }
      },
    },
  };
}

/** 兩欄之間的那條線。窄螢幕是上下排版，沒有它 */
export function DragHandle({ handleProps }: { handleProps: DragWidth["handleProps"] }) {
  return (
    <div
      {...handleProps}
      title="拖曳改寬度（雙擊回預設）"
      className="hidden w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-sky-300 active:bg-sky-400 lg:block"
    />
  );
}
