"use client";

import { useEffect, useRef, useState } from "react";
import Icon, { type IconName } from "@/components/Icon";
import Tooltip from "@/components/Tooltip";

/**
 * 圖片／SVG 的檢視格。
 *
 * 來源是 `/code-view/…`（唯讀路由）—— **不走 `<img src=data:…>`**：
 * base64 會胖三分之一，而且大圖要整份塞進 JSON 才畫得出來。
 *
 * SVG 用 `<img>` 載入（不是 inline）：`<img>` 裡的 SVG **不會執行 script**，
 * 也讀不到外層的 DOM，所以不必為了預覽再開一條沙箱。
 *
 * 底色與縮放的控制跟 `DrawablePreview` 是同一套語彙（棋盤格／深／淺、−／%／＋）——
 * 兩個地方看的是同一種東西，不要各發明一套。
 */

type Bg = "checker" | "dark" | "light";

const BG_META: Record<Bg, { icon: IconName; label: string }> = {
  checker: { icon: "checker", label: "透明底（棋盤格）" },
  dark: { icon: "moon", label: "深色底" },
  light: { icon: "sun", label: "淺色底" },
};

const CHECKER = "repeating-conic-gradient(#8a8a8a 0% 25%, #b5b5b5 0% 50%) 0 0 / 16px 16px";
const ZOOM_STEP = 1.5;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 32;

export default function ImagePreview({ src, alt }: { src: string; alt: string }) {
  const [bg, setBg] = useState<Bg>("checker");
  const [zoom, setZoom] = useState(1);
  const [dim, setDim] = useState<{ w: number; h: number } | null>(null);
  const paneRef = useRef<HTMLDivElement>(null);

  /**
   * 觸控板的雙指縮放要縮**這張圖**，不是整個網頁（Jay 2026-09-30）。
   *
   * 瀏覽器把觸控板的 pinch 報成**帶 `ctrlKey` 的 wheel 事件** —— 這是唯一
   * 接得到它的方式（沒有 pinch 事件）。
   *
   * ⚠️ **一定要自己 `addEventListener` 並指定 `passive: false`**：
   * React 的 `onWheel` 是 passive 的，裡面呼叫 `preventDefault()` 不會生效
   * （而且 console 只會印一行警告），頁面照樣被縮放。
   */
  useEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return; // 一般捲動不要攔
      e.preventDefault();
      // deltaY 往上是負的＝放大；用指數才會是「等比例」而不是等差
      setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z * Math.exp(-e.deltaY / 180))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("km.drawable.bg");
    if (saved === "checker" || saved === "dark" || saved === "light") setBg(saved);
  }, []);
  const pick = (b: Bg) => {
    setBg(b);
    try {
      localStorage.setItem("km.drawable.bg", b);
    } catch {
      // 無痕視窗之類，記不住就算了
    }
  };

  const btn = (active: boolean) =>
    `flex items-center rounded-md border px-1.5 py-1 ${
      active ? "border-accent/50 bg-surface-selected text-accent" : "border-line hover:text-fg"
    }`;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-1.5 text-[11px] text-fg-muted">
        {/* SVG 沒有像素尺寸時 naturalWidth 會是 viewBox 推出來的值，寫清楚是「內建尺寸」 */}
        <span className="font-mono">{dim ? `${dim.w}×${dim.h}` : "…"}</span>
        <div className="ml-auto flex items-center gap-1">
          <Tooltip label="縮小">
            <button
              aria-label="縮小"
              onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z / ZOOM_STEP))}
              className={btn(false)}
            >
              −
            </button>
          </Tooltip>
          <Tooltip label={zoom === 1 ? "目前是原始大小" : "回到原始大小"}>
            <button onClick={() => setZoom(1)} className={`${btn(zoom !== 1)} min-w-12 font-mono`}>
              {Math.round(zoom * 100)}%
            </button>
          </Tooltip>
          <Tooltip label="放大">
            <button
              aria-label="放大"
              onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z * ZOOM_STEP))}
              className={btn(false)}
            >
              ＋
            </button>
          </Tooltip>
          {(Object.keys(BG_META) as Bg[]).map((b) => (
            <Tooltip key={b} label={BG_META[b].label}>
              <button
                onClick={() => pick(b)}
                aria-label={BG_META[b].label}
                aria-pressed={bg === b}
                className={btn(bg === b)}
              >
                <Icon name={BG_META[b].icon} size={13} />
              </button>
            </Tooltip>
          ))}
        </div>
      </div>

      {/*
        `overscroll-contain`：捲到底之後再捲，不要把事件交給外層 ——
        macOS 的觸控板左右滑到底會變成瀏覽器的上一頁（Jay 2026-09-30）。
      */}
      <div
        ref={paneRef}
        className="flex min-h-0 flex-1 items-center justify-center overflow-auto overscroll-contain p-4"
        style={
          bg === "checker"
            ? { background: CHECKER }
            : { background: bg === "dark" ? "#1b1b1b" : "#ffffff" }
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element --
            來源是本機唯讀路由串出來的位元組；next/image 幫不上忙，而且我們要原尺寸 */}
        <img
          src={src}
          alt={alt}
          onLoad={(e) =>
            setDim({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
          }
          style={
            dim
              ? { width: dim.w * zoom, height: dim.h * zoom, maxWidth: "none", flex: "0 0 auto" }
              : undefined
          }
        />
      </div>
    </div>
  );
}
