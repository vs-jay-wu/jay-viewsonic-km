"use client";

import { fileIconOf, folderIconOf } from "@/lib/fileIconRules";
import { ICON_SVG, ICON_VIEWBOX } from "@/lib/fileIconsData";

/**
 * 檔案／資料夾的圖示（Material Icon Theme）。
 *
 * **彩色，而且不吃 `currentColor`** —— 這一套好認就是因為顏色（ts 藍、dart 水藍、
 * 圖片綠…）。所以它不是 `components/Icon.tsx` 那種線條圖示，別混用：
 * 那支是介面用的單色圖示，這支是「這是什麼檔」的識別。
 *
 * 認不得的檔案會拿到預設的白色文件圖示，不會變成空白。
 */
export default function FileIcon({
  path,
  folder = false,
  open = false,
  size = 14,
  className = "",
}: {
  path: string;
  folder?: boolean;
  /** 資料夾展開中。只有「沒有專屬圖示」的資料夾看得出差別 */
  open?: boolean;
  size?: number;
  className?: string;
}) {
  const name = folder ? folderIconOf(path, open) : fileIconOf(path);
  const inner = ICON_SVG[name];
  if (!inner) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox={ICON_VIEWBOX[name] ?? "0 0 32 32"}
      className={`shrink-0 ${className}`}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}
