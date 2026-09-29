// 統一的 icon 元件：inline SVG（Lucide 風格線條），不用 emoji、不拉外部字型。
// 尺寸用 size prop（px），顏色跟著 currentColor。

import type { SVGProps } from "react";

export type IconName =
  | "home" | "cpu" | "settings" | "sun" | "moon" | "monitor" | "link" | "refresh"
  | "flask" | "chart" | "book" | "help" | "archive" | "handoff"
  | "slides" | "font" | "package" | "window" | "pen" | "quiz" | "license" | "layers" | "hash" | "message" | "clipboard"
  | "trash" | "pin" | "pinOff" | "play" | "code" | "check" | "x" | "alert"
  | "clock" | "spinner" | "chevronRight" | "chevronDown" | "external" | "coins"
  | "search" | "lock" | "gitPr" | "bell" | "repos" | "hardDrive"
  | "toTop" | "toBottom" | "menu" | "list" | "tree" | "target"
  | "bug" | "task" | "story" | "spike" | "ops" | "worktree" | "eye" | "columns" | "checker";

const PATHS: Record<IconName, React.ReactNode> = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>,
  cpu: <><rect x="6" y="6" width="12" height="12" rx="1.5" /><path d="M10 2v3M14 2v3M10 19v3M14 19v3M2 10h3M2 14h3M19 10h3M19 14h3" /></>,
  /* 齒輪。**不要用「圓心 ＋ 八條放射線」那種畫法** —— 16px 下它讀起來是太陽
     不是齒輪（2026-09-22 試過，一眼就認錯）。要真的畫出齒的輪廓。 */
  settings: <><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" /><circle cx="12" cy="12" r="3" /></>,
  // ─── 文件用的示意圖示 ──────────────────────────────────────────────
  // 全部單色、吃 currentColor，跟其餘圖示同一套（不要放品牌彩色縮圖：
  // 深色主題下不會跟著變色，也不會跟 hover／selected 的狀態走）。
  flask: <><path d="M9 3h6" /><path d="M10 3v6L4.5 18A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-3L14 9V3" /><path d="M7.5 15h9" /></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  book: <><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v16H6.5A2.5 2.5 0 0 0 4 20.5Z" /><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v4H6.5A2.5 2.5 0 0 1 4 20.5Z" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.2-.9.8-.9 1.4v.4" /><path d="M12 17h.01" /></>,
  archive: <><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" /><path d="M10 12h4" /></>,
  handoff: <><path d="M3 12h13" /><path d="m12 7 5 5-5 5" /><path d="M20 4v16" /></>,
  // 主題示意（`km-doc-icon` 用）
  slides: <><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M12 16v4M9 20h6" /><path d="M7 8h7M7 11h5" /></>,
  font: <><path d="M5 20 11 4h2l6 16" /><path d="M8 14h8" /></>,
  package: <><path d="m12 2 9 5v10l-9 5-9-5V7Z" /><path d="m3 7 9 5 9-5" /><path d="M12 12v10" /></>,
  window: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /><path d="M6.5 6.5h.01M9 6.5h.01" /></>,
  pen: <><path d="M12 19 19.5 11.5a2.8 2.8 0 0 0-4-4L8 15l-1 5Z" /><path d="M4 21h7" /></>,
  quiz: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h5M8 12h8M8 16h6" /></>,
  license: <><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z" /><path d="M14 2v5h5" /><circle cx="12" cy="14" r="2.5" /><path d="m10.5 16.2-.5 3 2-1 2 1-.5-3" /></>,

  // 預覽／並排（drawable 的三態切換用）
  eye: <><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  columns: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 4v16" /></>,
  // 透明底的棋盤格：外框 ＋ 對角兩格填滿（吃 currentColor，所以兩個主題都看得出來）
  checker: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 12h18M12 3v18" /><path d="M3 3h9v9H3z" fill="currentColor" stroke="none" /><path d="M12 12h9v9h-9z" fill="currentColor" stroke="none" /></>,

  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></>,
  // 螢幕＝「跟隨作業系統」。用顯示器而不是滑桿，因為這一格講的是「跟著誰」
  monitor: <><rect x="2.5" y="4" width="19" height="12" rx="2" /><path d="M9 20h6M12 16v4" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.1" /><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.1" /></>,
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
  // 平鋪：每一列一樣長，最左邊是項目符號
  list: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></>,
  // 樹狀：左邊一根主幹，往右長出分支
  tree: <><path d="M21 6h-9M21 12h-6M21 18h-6" /><path d="M4 4v11a3 3 0 0 0 3 3h2" /><path d="M4 9h5" /></>,
  alert: <><path d="M12 3 2 20h20L12 3Z" /><path d="M12 9v5M12 17.5v.5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  spinner: <><path d="M12 3a9 9 0 1 0 9 9" /></>,
  chevronRight: <><path d="m9 5 7 7-7 7" /></>,
  chevronDown: <><path d="m5 9 7 7 7-7" /></>,
  external: <><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v6H4V6h6" /></>,
  coins: <><ellipse cx="12" cy="6.5" rx="8" ry="3.5" /><path d="M4 6.5v5c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5v-5" /><path d="M4 11.5v5c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5v-5" /></>,
  search: <><circle cx="11" cy="11" r="6" /><path d="m16 16 5 5" /></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  gitPr: <><circle cx="6.5" cy="5.5" r="2.5" /><circle cx="6.5" cy="18.5" r="2.5" /><path d="M6.5 8v8" /><circle cx="17.5" cy="18.5" r="2.5" /><path d="M17.5 16V9.5a3 3 0 0 0-3-3h-3.5" /><path d="m13 4 -2 2.5 2 2.5" /></>,
  bell: <><path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" /><path d="M10.5 20a2 2 0 0 0 3 0" /></>,
  repos: <><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H18v14H6.5A1.5 1.5 0 0 0 5 18.5v-14Z" /><path d="M5 18.5A1.5 1.5 0 0 0 6.5 20H18v-3" /><path d="M9 7h5" /></>,
  // Jira 的議題類型：漏洞（實心圓）／任務（打勾方塊）／故事（書籤）／Spike（閃電）
  bug: <><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" /></>,
  task: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
  story: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M9 8h6v8l-3-2.2L9 16V8Z" /></>,
  spike: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m13 7-4 6h3l-1 4 4-6h-3l1-4Z" /></>,
  ops: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 15V9M12 15v-3M16 15v-5" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  toTop: <><path d="M4 4h16" /><path d="M12 20V8" /><path d="m6 14 6-6 6 6" /></>,
  // 跳到目前位置（VS Code 那顆同心圓）
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2.5" /></>,
  toBottom: <><path d="M4 20h16" /><path d="M12 4v12" /><path d="m6 10 6 6 6-6" /></>,
  hardDrive: <><rect x="3" y="13" width="18" height="7" rx="2" /><path d="m5.5 13 2.2-7h8.6l2.2 7" /><path d="M7 16.5h.01M10.5 16.5h.01" /></>,
  // 分支從主線岔出去 —— worktree 的標記（Jay 2026-09-21 指定的那張）
  worktree: <><circle cx="6" cy="18.5" r="2.6" /><circle cx="18" cy="5.5" r="2.6" /><path d="M6 15.9V4" /><path d="M18 8.1a10 10 0 0 1-9.4 10" /></>,
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
