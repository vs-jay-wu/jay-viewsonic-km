// 統一的 icon 元件：inline SVG（Lucide 風格線條），不用 emoji、不拉外部字型。
// 尺寸用 size prop（px），顏色跟著 currentColor。

import type { SVGProps } from "react";

export type IconName =
  | "home" | "cpu" | "refresh" | "layers" | "hash" | "message" | "clipboard"
  | "trash" | "pin" | "pinOff" | "play" | "code" | "check" | "x" | "alert"
  | "clock" | "spinner" | "chevronRight" | "chevronDown" | "external" | "coins"
  | "search" | "lock";

const PATHS: Record<IconName, React.ReactNode> = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>,
  cpu: <><rect x="6" y="6" width="12" height="12" rx="1.5" /><path d="M10 2v3M14 2v3M10 19v3M14 19v3M2 10h3M2 14h3M19 10h3M19 14h3" /></>,
  refresh: <><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></>,
  layers: <><path d="M12 3 3 7.5l9 4.5 9-4.5L12 3Z" /><path d="m3 12 9 4.5 9-4.5" /><path d="m3 16.5 9 4.5 9-4.5" /></>,
  hash: <><path d="M5 9h14M5 15h14M10 3 8 21M16 3l-2 18" /></>,
  message: <><path d="M21 12a8 8 0 0 1-8 8H8l-5 3 1.5-4.5A8 8 0 1 1 21 12Z" /></>,
  clipboard: <><rect x="7" y="4" width="10" height="4" rx="1" /><path d="M17 6h2v15H5V6h2" /><path d="M9 12h6M9 16h4" /></>,
  trash: <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 14h10l1-14" /><path d="M10 11v6M14 11v6" /></>,
  pin: <><path d="M12 17v5" /><path d="M9 3h6l-1 6 3 4H7l3-4-1-6Z" /></>,
  pinOff: <><path d="M12 17v5" /><path d="M9 3h6l-1 6 3 4H7l3-4-1-6Z" /><path d="M3 3l18 18" /></>,
  play: <><path d="M7 4l13 8-13 8V4Z" /></>,
  code: <><path d="m9 8-5 4 5 4M15 8l5 4-5 4" /></>,
  check: <><path d="m4 13 5 5L20 6" /></>,
  x: <><path d="M5 5l14 14M19 5 5 19" /></>,
  alert: <><path d="M12 3 2 20h20L12 3Z" /><path d="M12 9v5M12 17.5v.5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  spinner: <><path d="M12 3a9 9 0 1 0 9 9" /></>,
  chevronRight: <><path d="m9 5 7 7-7 7" /></>,
  chevronDown: <><path d="m5 9 7 7 7-7" /></>,
  external: <><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v6H4V6h6" /></>,
  coins: <><ellipse cx="12" cy="6.5" rx="8" ry="3.5" /><path d="M4 6.5v5c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5v-5" /><path d="M4 11.5v5c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5v-5" /></>,
  search: <><circle cx="11" cy="11" r="6" /><path d="m16 16 5 5" /></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
};

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
}

export default function Icon({ name, size = 16, className = "", ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
