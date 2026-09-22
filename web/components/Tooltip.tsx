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
 * overflow 影響。
 *
 * **畫出來之後量一次、超出畫面就自己翻面／夾回來**（Jay 2026-09-17 回報右上角的
 * fetch 還是往上開、跑到畫面外）：`side` 只是偏好，不是保證。靠呼叫端每個地方
 * 記得傳 `side="bottom"` 是行不通的 —— 漏一個就又跑出去，而且要等有人看到才知道。
 */

type Side = "top" | "bottom" | "left";

const GAP = 8;
/** 離視窗邊緣至少留這麼多 */
const EDGE = 8;

export default function Tooltip({
  label,
  children,
  side = "top",
}: {
  label: string;
  children: React.ReactNode;
  /** 偏好的方向。放不下時會自己翻面，所以這只是偏好 */
  side?: Side;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const anchorRect = useRef<DOMRect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [effSide, setEffSide] = useState<Side>(side);
  /** 還沒量到真實寬度前先貼在左緣 —— 見下面的 useEffect */
  const [placed, setPlaced] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const topFor = (s: Side, r: DOMRect) =>
    s === "bottom" ? r.bottom + GAP : s === "left" ? r.top + r.height / 2 : r.top - GAP;

  const show = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    anchorRect.current = r;
    setEffSide(side);
    setPlaced(false);
    // `left: 0` 是為了量到「不受限」的寬度（見下面）
    setPos({ top: topFor(side, r), left: side === "left" ? r.left - GAP : 0 });
  }, [side]);

  const hide = useCallback(() => {
    setPos(null);
    setPlaced(false);
  }, []);

  /**
   * 畫出來之後量一次，決定最終位置。
   *
   * **水平不能用 `left: 中心點` ＋ `translateX(-50%)`**：fixed 元素的版面寬度是
   * 「視窗寬 − left」，貼著右緣時只剩幾十 px，文字會被擠成一直條
   * （Jay 2026-09-17 回報右上角的 fetch）。所以先放在 `left: 0` 量真實寬度，
   * 再自己把左緣算出來夾進畫面裡，`transform` 只留垂直那一軸。
   *
   * 垂直則是量完之後超出上／下緣就翻面 —— `side` 只是偏好，靠呼叫端每個地方
   * 記得傳對是行不通的。
   */
  useEffect(() => {
    const bubble = bubbleRef.current;
    const anchor = anchorRect.current;
    if (!pos || !bubble || !anchor) return;
    const b = bubble.getBoundingClientRect();

    if (effSide === "top" && b.top < EDGE && anchor.bottom + b.height + GAP < window.innerHeight) {
      setEffSide("bottom");
      setPos({ top: topFor("bottom", anchor), left: pos.left });
      return;
    }
    if (effSide === "bottom" && b.bottom > window.innerHeight - EDGE && anchor.top - b.height - GAP > 0) {
      setEffSide("top");
      setPos({ top: topFor("top", anchor), left: pos.left });
      return;
    }
    if (placed || effSide === "left") return;

    const w = b.width;
    const left = Math.min(
      Math.max(anchor.left + anchor.width / 2 - w / 2, EDGE),
      Math.max(EDGE, window.innerWidth - w - EDGE)
    );
    setPlaced(true);
    setPos({ top: pos.top, left });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos?.top, pos?.left, effSide, placed]);

  // 捲動或改變視窗大小時直接收起來 —— 跟著跑會抖，而且沒必要
  useEffect(() => {
    if (!pos) return;
    const onScroll = () => hide();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [pos, hide]);

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
              ref={bubbleRef}
              role="tooltip"
              style={{
                top: pos.top,
                left: pos.left,
                // 水平已經自己算好了，transform 只留垂直（`left` 那一側例外）
                transform:
                  effSide === "bottom"
                    ? "none"
                    : effSide === "left"
                      ? "translate(-100%, -50%)"
                      : "translate(0, -100%)",
                maxWidth: "min(22rem, calc(100vw - 16px))",
                // 量寬度那一幀先別讓人看到它在左上角
                visibility: placed || effSide === "left" ? "visible" : "hidden",
              }}
              className="pointer-events-none fixed z-[200] whitespace-pre-wrap rounded-md bg-control px-2 py-1 text-xs text-on-solid shadow-lg"
            >
              {label}
            </span>,
            document.body
          )
        : null}
    </span>
  );
}
