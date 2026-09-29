"use client";

import { useEffect, useState } from "react";
import Icon, { type IconName } from "@/components/Icon";
import Tooltip from "@/components/Tooltip";
import type { AdaptiveMask, VectorSvg } from "@/lib/vectorDrawableRules";

/**
 * Android drawable（`<vector>` 與 `<adaptive-icon>`）的預覽（唯讀）。
 *
 * SVG 是 `lib/vectorDrawableRules.ts` **自己組出來的**（只含白名單元素），
 * 不是把 repo 裡的原文轉手丟進 DOM —— 所以 `dangerouslySetInnerHTML` 在這裡是安全的。
 *
 * 底色要能換：icon 常是純白或純黑，畫在單一底色上會有一半看不見
 * （Android Studio 的預覽也給了同一顆按鈕）。
 */

type Bg = "checker" | "dark" | "light";

/** 底色的圖示與說明。**只給圖示就一定要有 tooltip**（見 web/AGENTS.md） */
const BG_META: Record<Bg, { icon: IconName; label: string }> = {
  checker: { icon: "checker", label: "透明底（棋盤格）" },
  dark: { icon: "moon", label: "深色底" },
  light: { icon: "sun", label: "淺色底" },
};
const MASK_LABEL: Record<AdaptiveMask, string> = {
  squircle: "圓角",
  circle: "圓形",
  square: "方形",
  full: "不裁切",
};

/** 每按一下放大／縮小的倍數，以及倍率上下限 */
const ZOOM_STEP = 1.5;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 32;

/** 棋盤格用 conic-gradient 畫，不需要圖檔 */
const CHECKER = "repeating-conic-gradient(#8a8a8a 0% 25%, #b5b5b5 0% 50%) 0 0 / 16px 16px";

export default function DrawablePreview({
  vector,
  mask,
  onMask,
}: {
  vector: VectorSvg;
  /** adaptive icon 才給 —— 一般的 `<vector>` 沒有遮罩可言 */
  mask?: AdaptiveMask;
  onMask?: (m: AdaptiveMask) => void;
}) {
  const [bg, setBg] = useState<Bg>("checker");
  /** 1 ＝ 縮放至符合面板；其餘是它的倍率 */
  const [zoom, setZoom] = useState(1);

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

  const { widthDp, heightDp, viewportWidth, viewportHeight, unresolved } = vector;

  const btn = (active: boolean) =>
    `rounded-md border px-1.5 py-0.5 ${
      active ? "border-accent/50 bg-surface-selected text-accent" : "border-line hover:text-fg"
    }`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-1.5 text-[11px] text-fg-muted">
        <span className="font-mono">
          {widthDp ?? "?"}×{heightDp ?? "?"} dp
        </span>
        <span className="text-fg-subtle">
          viewport {viewportWidth}×{viewportHeight}
        </span>

        {mask && onMask && (
          <div className="flex items-center gap-1">
            {(Object.keys(MASK_LABEL) as AdaptiveMask[]).map((m) => (
              <Tooltip
                key={m}
                label={
                  m === "full"
                    ? "畫出完整的 108dp（含會被啟動器切掉的部分）"
                    : `用${MASK_LABEL[m]}遮罩裁切（各家啟動器形狀不同）`
                }
              >
                <button onClick={() => onMask(m)} className={btn(mask === m)}>
                  {MASK_LABEL[m]}
                </button>
              </Tooltip>
            ))}
          </div>
        )}

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
          <Tooltip label={zoom === 1 ? "目前是縮放至符合面板" : "回到符合面板"}>
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
                className={`${btn(bg === b)} flex items-center py-1`}
              >
                <Icon name={BG_META[b].icon} size={13} />
              </button>
            </Tooltip>
          ))}
        </div>
      </div>

      <div
        className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4"
        style={
          bg === "checker"
            ? { background: CHECKER }
            : { background: bg === "dark" ? "#1b1b1b" : "#ffffff" }
        }
      >
        <div
          // 100% ＝ 剛好符合面板（SVG 自己帶 preserveAspectRatio，撐滿也不會變形）；
          // 放大時讓容器自己捲，不要把圖壓回來
          style={{
            width: `${100 * zoom}%`,
            height: `${100 * zoom}%`,
            flex: "0 0 auto",
            minWidth: 0,
          }}
          dangerouslySetInnerHTML={{ __html: vector.svg }}
        />
      </div>

      {unresolved.length > 0 && (
        <p className="flex shrink-0 items-start gap-1.5 border-t border-line px-3 py-1.5 text-[11px] text-warn">
          <Icon name="alert" size={11} className="mt-0.5 shrink-0" />
          <span>
            這幾個參考解析不到，沒有畫出來（或畫成灰色）：
            <span className="font-mono">{unresolved.join("、")}</span>
          </span>
        </p>
      )}
    </div>
  );
}
