"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * 滑過就立刻出現的說明泡泡。
 *
 * 不用原生的 `title=""`：它要停留快一秒才出現，而且不能換行、樣式不受控。
 * icon-only 的按鈕**一定要包這個** —— 只有圖示的話，隔幾個月回來會看不出
 * 它到底會做什麼（Jay 2026-09-11）。
 *
 * **泡泡用 portal + `position: fixed` 畫在 `<body>` 上**（Jay 2026-09-14 回報
 * 被遮擋後改的）：原本是 `absolute`，只要祖先有 `overflow: auto`（例如「未提交的
 * 改動」那個可捲動的清單）就會被裁掉半截。fixed + portal 不受任何祖先的
 * overflow 影響，而且會自動避開視窗邊緣。
 */

type Side = "top" | "bottom" | "left";

const GAP = 8;

export default function Tooltip({
  label,
  children,
  side = "top",
}: {
  label: string;
  children: React.ReactNode;
  /** 預設往上開；貼著視窗上緣的用 `bottom`，靠右邊的用 `left` */
  side?: Side;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const show = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // 先用估的寬度定位，畫出來之後再用真實寬度校正（見下面的 useEffect）
    const top = side === "bottom" ? r.bottom + GAP : side === "left" ? r.top + r.height / 2 : r.top - GAP;
    const left = side === "left" ? r.left - GAP : r.left + r.width / 2;
    setPos({ top, left });
  }, [side]);

  const hide = useCallback(() => setPos(null), []);

  // 捲動或改變視窗大小時直接收起來 —— 跟著跑會抖，而且沒必要
  useEffect(() => {
    if (!pos) return;
    const onScroll = () => setPos(null);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [pos]);

  const transform =
    side === "bottom"
      ? "translate(-50%, 0)"
      : side === "left"
        ? "translate(-100%, -50%)"
        : "translate(-50%, -100%)";

  return (
    <span
      ref={anchorRef}
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {mounted && pos
        ? createPortal(
            <span
              role="tooltip"
              style={{
                top: pos.top,
                left: pos.left,
                transform,
                // 視窗邊緣：讓泡泡自己收窄而不是被切掉
                maxWidth: "min(22rem, calc(100vw - 16px))",
              }}
              className="pointer-events-none fixed z-[200] whitespace-pre-wrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white shadow-lg"
            >
              {label}
            </span>,
            document.body
          )
        : null}
    </span>
  );
}
