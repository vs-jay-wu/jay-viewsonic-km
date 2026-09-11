"use client";

/**
 * 滑過就立刻出現的說明泡泡。
 *
 * 不用原生的 `title=""`：它要停留快一秒才出現，而且不能換行、樣式不受控。
 * icon-only 的按鈕**一定要包這個** —— 只有圖示的話，隔幾個月回來會看不出
 * 它到底會做什麼（Jay 2026-09-11）。
 */
export default function Tooltip({
  label,
  children,
  side = "top",
}: {
  label: string;
  children: React.ReactNode;
  /**
   * 泡泡往哪邊開。**貼著視窗邊緣的元素要自己選邊**，不然會被切掉：
   * 靠右的用 `left`、貼在畫面上緣的用 `bottom`（踩過：面板標題列的按鈕用
   * 預設的 top，泡泡整個跑到畫面外，Jay 2026-09-11）。
   */
  side?: "top" | "bottom" | "left";
}) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 hidden whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white shadow-lg group-hover/tip:block group-focus-within/tip:block ${
          side === "left"
            ? "right-full top-1/2 mr-2 -translate-y-1/2"
            : side === "bottom"
              ? "top-full left-1/2 mt-1.5 -translate-x-1/2"
              : "bottom-full left-1/2 mb-1.5 -translate-x-1/2"
        }`}
      >
        {label}
      </span>
    </span>
  );
}
