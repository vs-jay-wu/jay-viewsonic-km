"use client";

import { useState } from "react";
import Icon from "@/components/Icon";

/**
 * 音檔／影片的檢視格。來源是 `/code-view/…`（唯讀路由）——
 * 交給瀏覽器自己抓，不經過 JSON（base64 會胖三分之一，而且大檔會塞爆回應）。
 *
 * **放不出來要講清楚**：repo 裡有一堆「假的」音檔（測試 fixture，例如
 * `r1-u1.wav` 只有 14 個位元組、內容是純文字）。瀏覽器解不開時什麼都不顯示，
 * 看起來會像 km 壞掉 —— 所以接住 `error` 並寫出原因。
 */
export default function MediaPreview({
  src,
  kind,
  sizeBytes,
}: {
  src: string;
  kind: "audio" | "video";
  sizeBytes: number;
}) {
  const [err, setErr] = useState(false);
  const [dur, setDur] = useState<number | null>(null);

  const onLoaded = (e: React.SyntheticEvent<HTMLMediaElement>) => {
    const d = e.currentTarget.duration;
    setDur(Number.isFinite(d) ? d : null);
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-1.5 text-[11px] text-fg-muted">
        <span className="font-mono">{(sizeBytes / 1024).toFixed(1)} KB</span>
        {dur !== null && (
          <span className="font-mono">
            {Math.floor(dur / 60)}:{String(Math.floor(dur % 60)).padStart(2, "0")}
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-surface-sunken p-6">
        {err ? (
          <p className="flex items-center gap-2 text-sm text-warn">
            <Icon name="alert" size={14} />
            瀏覽器放不出這個檔（格式不支援，或它根本不是真的{kind === "audio" ? "音檔" : "影片"}）
          </p>
        ) : kind === "audio" ? (
          <audio
            src={src}
            controls
            className="w-full max-w-lg"
            onLoadedMetadata={onLoaded}
            onError={() => setErr(true)}
          />
        ) : (
          <video
            src={src}
            controls
            className="max-h-full max-w-full"
            onLoadedMetadata={onLoaded}
            onError={() => setErr(true)}
          />
        )}
      </div>
    </div>
  );
}
