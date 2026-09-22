"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Tooltip from "@/components/Tooltip";
import { formatBytes, type ImageCompareMode } from "@/lib/changesRules";
import type { DiffTheme } from "@/lib/uiSettingsRules";

/* eslint-disable @next/next/no-img-element --
   next/image 在這裡幫不上忙：來源是本機 API 串出來的位元組（不是靜態資源也不是
   允許的網域），而且我們**需要**原尺寸（naturalWidth/Height）來算共用的縮放比，
   被優化過的圖就拿不到了。 */

/**
 * 圖片的改動：照 GitHub 的三種比法 —— 2-up（並排）、滑桿、洋蔥皮（Jay 2026-09-14）。
 *
 * unified diff 對圖片沒有意義（只會顯示「Binary files differ」），但「換了一張圖」
 * 恰恰是最需要看的那種改動。
 *
 * **兩張圖一律靠左上對齊、共用同一個縮放比**，不各自塞滿容器 —— 尺寸變了的時候，
 * 各自縮放會讓兩張看起來一樣大，於是「圖變大了」這件事就消失了。
 *
 * 內容不經過 JSON：`<img>` 直接打 `/api/changes/blob`（base64 會胖三分之一）。
 *
 * **換檔案時靠呼叫端給 `key` 重建**，不要用 effect 去清尺寸／滑桿位置 —— 清的那一
 * 瞬間會先用上一張的尺寸畫一次。
 */

interface Dim {
  w: number;
  h: number;
}

const CHECKER = {
  backgroundImage:
    "linear-gradient(45deg, rgba(128,128,128,.18) 25%, transparent 25%, transparent 75%, rgba(128,128,128,.18) 75%)," +
    "linear-gradient(45deg, rgba(128,128,128,.18) 25%, transparent 25%, transparent 75%, rgba(128,128,128,.18) 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 8px 8px",
} as const;

export default function ImageDiffView({
  worktree,
  file,
  oldPath,
  oldRev = "HEAD",
  newRev = null,
  oldBytes,
  newBytes,
  theme = "dark",
  source,
}: {
  worktree: string;
  file: string;
  /** 改名時 HEAD 裡的路徑跟現在不同 */
  oldPath: string;
  /** 舊側要取哪個版本。看整條線時是 merge-base、看單一 commit 時是 `<sha>^` */
  oldRev?: string;
  /** 新側要取哪個版本；null／不給＝工作區現在的檔案 */
  newRev?: string | null;
  oldBytes: number | null;
  newBytes: number | null;
  theme?: DiffTheme;
  /** SVG 這種文字格式還有原始碼可以看，傳進來就多一個分頁 */
  source?: React.ReactNode;
}) {
  const hasOld = oldBytes !== null;
  const hasNew = newBytes !== null;
  const both = hasOld && hasNew;

  const [mode, setMode] = useState<ImageCompareMode | "source">("two-up");
  const [swipe, setSwipe] = useState(50);
  const [opacity, setOpacity] = useState(50);
  const [dimOld, setDimOld] = useState<Dim | null>(null);
  const [dimNew, setDimNew] = useState<Dim | null>(null);
  const [avail, setAvail] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  // 只有一張的時候沒有「比」可言，直接顯示那一張
  const effMode: ImageCompareMode | "source" = both || mode === "source" ? mode : "two-up";

  // URL 帶上位元組數：檔案換了之後網址跟著換，瀏覽器不會拿舊的那張來用
  const urlOld = useMemo(
    () =>
      `/api/changes/blob?${new URLSearchParams({
        worktree, file: oldPath, side: "old", rev: oldRev, v: String(oldBytes ?? 0),
      })}`,
    [worktree, oldPath, oldRev, oldBytes]
  );
  const urlNew = useMemo(
    () =>
      `/api/changes/blob?${new URLSearchParams({
        worktree, file, side: "new", rev: newRev ?? "", v: String(newBytes ?? 0),
      })}`,
    [worktree, file, newRev, newBytes]
  );

  // deps 要帶 effMode：疊圖的容器只在滑桿／洋蔥皮模式存在，掛在 2-up 時 ref 是 null，
  // 只跑一次的話就永遠量不到寬度，縮放比會停在 1（大圖直接撐破版面）
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAvail(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [effMode]);

  // 疊圖的畫布 = 兩張的外接矩形，縮放比共用（見檔頭）
  const boxW = Math.max(dimOld?.w ?? 0, dimNew?.w ?? 0);
  const boxH = Math.max(dimOld?.h ?? 0, dimNew?.h ?? 0);
  const scale = boxW && avail ? Math.min(1, avail / boxW) : 1;

  const onDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons === 0 && e.type === "pointermove") return;
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width) return;
    setSwipe(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
  }, []);

  const dark = theme === "dark";
  const surface = dark ? "bg-[#0d1117]" : "bg-surface";
  const label = dark ? "text-fg-subtle" : "text-fg-muted";

  const stacked = (children: React.ReactNode) => (
    <div className="px-4 py-4">
      <div ref={boxRef} className="w-full">
        <div
          className="relative mx-auto overflow-hidden rounded"
          style={{ width: boxW * scale || "100%", height: boxH * scale || undefined, ...CHECKER }}
        >
          {children}
        </div>
      </div>
    </div>
  );

  const imgStyle = (d: Dim | null): React.CSSProperties => ({
    position: "absolute",
    left: 0,
    top: 0,
    width: d ? d.w * scale : undefined,
    height: d ? d.h * scale : undefined,
  });

  return (
    <div className={surface}>
      <div
        className={`flex flex-wrap items-center gap-2 border-b px-4 py-2 ${
          dark ? "border-line" : "border-line"
        }`}
      >
        {both ? (
          (
            [
              ["two-up", "2-up", "並排看兩張"],
              ["swipe", "滑桿", "拉分隔線，左邊舊、右邊新"],
              ["onion", "洋蔥皮", "把新的那張疊上去，調透明度"],
            ] as const
          ).map(([m, text, tip]) => (
            <Tooltip key={m} label={tip}>
              <button
                onClick={() => setMode(m)}
                className={`rounded-md border px-2.5 py-1 text-xs ${
                  effMode === m
                    ? dark
                      ? "border-line-strong bg-control/80 text-on-solid"
                      : "border-control bg-control text-on-solid"
                    : dark
                      ? "border-line-strong text-fg-disabled hover:bg-control/85"
                      : "border-line-strong text-fg-muted hover:bg-surface-raised"
                }`}
              >
                {text}
              </button>
            </Tooltip>
          ))
        ) : (
          <span className={`text-xs ${label}`}>
            {hasNew ? "新增的圖片（HEAD 裡沒有舊版）" : "已刪除的圖片（只剩 HEAD 裡那張）"}
          </span>
        )}

        {source && (
          <button
            onClick={() => setMode(effMode === "source" ? "two-up" : "source")}
            className={`rounded-md border px-2.5 py-1 text-xs ${
              effMode === "source"
                ? dark
                  ? "border-line-strong bg-control/80 text-on-solid"
                  : "border-control bg-control text-on-solid"
                : dark
                  ? "border-line-strong text-fg-disabled hover:bg-control/85"
                  : "border-line-strong text-fg-muted hover:bg-surface-raised"
            }`}
          >
            原始碼
          </button>
        )}

        <span className={`ml-auto font-mono text-[11px] ${label}`}>
          {hasOld && <Meta dim={dimOld} bytes={oldBytes} />}
          {both && <span className="mx-1.5">→</span>}
          {hasNew && <Meta dim={dimNew} bytes={newBytes} />}
        </span>
      </div>

      {effMode === "source" && source}

      {effMode === "two-up" && (
        <div className="flex flex-wrap gap-4 px-4 py-4">
          {hasOld && (
            <Side
              title={`舊（${revLabel(oldRev)}）`}
              tone="del"
              dark={dark}
              src={urlOld}
              onDim={setDimOld}
              dim={dimOld}
            />
          )}
          {hasNew && (
            <Side
              title={`新（${newRev ? revLabel(newRev) : "工作區"}）`}
              tone="add"
              dark={dark}
              src={urlNew}
              onDim={setDimNew}
              dim={dimNew}
            />
          )}
        </div>
      )}

      {effMode === "swipe" &&
        stacked(
          <div
            className="absolute inset-0 cursor-ew-resize touch-none"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              onDrag(e);
            }}
            onPointerMove={onDrag}
          >
            {/*
              **兩張都要裁**：只裁上面那張的話，新圖比較小的區域會露出底下的舊圖，
              看起來像「新版那裡也有東西」。各自裁成左半／右半，沒有內容的地方就
              讓格子底透出來 —— 分隔線左邊一定是舊的，右邊一定是新的。

              clip 掛在**跟畫布一樣大**的外層，不是掛在圖片上：`%` 相對的是元素自己的
              邊界，掛在尺寸不同的兩張圖上會各切各的，分隔線就對不起來。
            */}
            <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - swipe}% 0 0)` }}>
              <img
                src={urlOld}
                alt="舊版"
                draggable={false}
                style={imgStyle(dimOld)}
                onLoad={(e) => setDimOld({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              />
            </div>
            <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${swipe}%)` }}>
              <img
                src={urlNew}
                alt="新版"
                draggable={false}
                style={imgStyle(dimNew)}
                onLoad={(e) => setDimNew({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              />
            </div>
            <div
              className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-accent"
              style={{ left: `${swipe}%` }}
            >
              <span className="absolute top-1/2 left-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent shadow" />
            </div>
          </div>
        )}

      {effMode === "onion" &&
        stacked(
          <>
            <img
              src={urlOld}
              alt="舊版"
              draggable={false}
              style={imgStyle(dimOld)}
              onLoad={(e) => setDimOld({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            />
            <img
              src={urlNew}
              alt="新版"
              draggable={false}
              style={{ ...imgStyle(dimNew), opacity: opacity / 100 }}
              onLoad={(e) => setDimNew({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            />
          </>
        )}

      {(effMode === "onion" || effMode === "swipe") && both && (
        <div className="flex items-center gap-3 px-4 pb-4">
          <span className={`w-16 shrink-0 text-right text-[11px] ${label}`}>
            {effMode === "onion" ? "舊" : "← 舊"}
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={effMode === "onion" ? opacity : swipe}
            onChange={(e) =>
              effMode === "onion" ? setOpacity(Number(e.target.value)) : setSwipe(Number(e.target.value))
            }
            className="flex-1 accent-sky-500"
            aria-label={effMode === "onion" ? "新版的透明度" : "分隔線位置"}
          />
          <span className={`w-16 shrink-0 text-[11px] ${label}`}>
            {effMode === "onion" ? "新" : "新 →"}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * revision 給人看的樣子。sha 只留前 8 碼（`abc12345^` 也要處理），
 * 分支名原樣顯示 —— **標籤一定要跟實際比較的版本一致**，
 * 整體檢視的舊側是 merge-base 不是 HEAD，寫死「HEAD」會騙人。
 */
function revLabel(rev: string): string {
  const m = /^([0-9a-f]{7,40})(\^*)$/.exec(rev);
  return m ? m[1].slice(0, 8) + m[2] : rev;
}

function Meta({ dim, bytes }: { dim: Dim | null; bytes: number | null }) {
  return (
    <span>
      {dim ? `${dim.w}×${dim.h}` : "…"}
      {bytes !== null && ` · ${formatBytes(bytes)}`}
    </span>
  );
}

function Side({
  title,
  tone,
  dark,
  src,
  dim,
  onDim,
}: {
  title: string;
  tone: "add" | "del";
  dark: boolean;
  src: string;
  dim: Dim | null;
  onDim: (d: Dim) => void;
}) {
  return (
    <figure className="min-w-0 flex-1">
      <figcaption
        className={`mb-1.5 text-[11px] ${
          tone === "add" ? "text-ok" : "text-danger"
        }`}
      >
        {title}
        {dim && <span className={`ml-2 font-mono ${dark ? "text-fg-muted" : "text-fg-subtle"}`}>{dim.w}×{dim.h}</span>}
      </figcaption>
      <div
        className={`overflow-hidden rounded border ${
          tone === "add"
            ? dark ? "border-emerald-900" : "border-ok/40"
            : dark ? "border-red-900" : "border-danger/40"
        }`}
        style={CHECKER}
      >
        {/* 2-up 是「各自看清楚」，所以這裡才允許縮到容器寬；尺寸差異靠上面的數字 */}
        <img
          src={src}
          alt={title}
          className="mx-auto block h-auto max-w-full"
          onLoad={(e) => onDim({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        />
      </div>
    </figure>
  );
}
