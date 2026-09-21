"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icon";
import Tooltip from "@/components/Tooltip";
import {
  KIND_CLS, KIND_LABEL, KIND_TITLE, STAGE_CLS, STAGE_LABEL, STAGE_TITLE, stageState,
  type ChangedFile, type TreeNode,
} from "@/lib/changesRules";

/**
 * 改動清單的共用列與樹。「未提交的改動」與「這條線的改動」兩頁共用 ——
 * 兩邊各一份的話一定會漂移（縮排、狀態字母、不截斷的規則都是同一套慣例）。
 *
 * **路徑一律不截斷**（Jay 2026-09-14）：`whitespace-nowrap`，寬度交給外層的水平捲動。
 * 「…」會把最有辨識度的中間段吃掉，而這裡的路徑常常只差中間那一段。
 */

export type ViewMode = "list" | "tree";

/** 兩頁共用同一個偏好 —— 這是「檔案清單怎麼看」的設定，不是某一頁的 */
const VIEW_KEY = "km.changes.view";

export function useFileView(): [ViewMode, (v: ViewMode) => void] {
  const [view, setView] = useState<ViewMode>("list");

  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "tree" || v === "list") setView(v);
    } catch {
      /* 讀不到就用預設 */
    }
  }, []);

  const switchView = useCallback((v: ViewMode) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* 存不了就算了 */
    }
  }, []);

  return [view, switchView];
}

/**
 * 平鋪／樹狀的切換鈕。**一顆按鈕直接切**，圖示顯示的是「現在是哪種」
 * （Jay 2026-09-14：兩顆分頁按鈕佔掉的寬度跟它帶來的資訊不成比例）。
 */
export function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <Tooltip
      side="left"
      label={
        view === "tree"
          ? "改成平鋪：一個檔案一行，看得到完整路徑"
          : "改成樹狀：照目錄分層，只有一條路的目錄會併成一行"
      }
    >
      <button
        onClick={() => onChange(view === "tree" ? "list" : "tree")}
        aria-label={view === "tree" ? "改成平鋪檢視" : "改成樹狀檢視"}
        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
      >
        <Icon name={view === "tree" ? "tree" : "list"} size={15} />
      </button>
    </Tooltip>
  );
}

/**
 * 「已進索引」的標記。**未 staged 不標** —— 那是常態，標了整片都是字。
 * commit 裡的檔案兩軸都是 false（`none`），一樣不標。
 *
 * `onlyPartial`：已經分成 Staged／Changes 兩區塊時用。那時「staged」三個字
 * 是區塊標題講過的廢話，但**部分 staged 還是要標** —— 它同時出現在兩區，
 * 不標的話會看起來像重複列了一次。
 */
export function StageBadge({ file, onlyPartial }: { file: ChangedFile; onlyPartial?: boolean }) {
  const st = stageState(file);
  if (!STAGE_LABEL[st]) return null;
  if (onlyPartial && st !== "partial") return null;
  return (
    <Tooltip label={STAGE_TITLE[st]}>
      <span className={`shrink-0 text-[10px] ${STAGE_CLS[st]}`}>{STAGE_LABEL[st]}</span>
    </Tooltip>
  );
}

export interface RowExtras {
  /** 狀態字母後面（例如「這條線」的 C／W 標記） */
  leading?: React.ReactNode;
  /** 檔名後面（例如「模式」「staged」） */
  trailing?: React.ReactNode;
}

export function FileRow<T extends ChangedFile>({
  file,
  label,
  depth = 0,
  selected,
  onOpen,
  leading,
  trailing,
}: {
  file: T;
  /** 平鋪顯示完整路徑，樹狀只顯示檔名 */
  label: "path" | "name";
  depth?: number;
  selected: boolean;
  onOpen: () => void;
} & RowExtras) {
  const dir = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/") + 1) : "";
  return (
    <button
      onClick={onOpen}
      style={{ paddingLeft: 16 + depth * 14 }}
      className={`flex w-full items-center gap-2 whitespace-nowrap py-1 pr-4 text-left text-xs hover:bg-gray-50 ${
        selected ? "bg-sky-50" : ""
      }`}
    >
      <span
        className={`w-3 shrink-0 text-center font-mono text-[11px] font-semibold ${KIND_CLS[file.kind]}`}
        title={KIND_TITLE[file.kind]}
      >
        {KIND_LABEL[file.kind]}
      </span>
      {leading}
      <span className="font-mono">
        {/* 目錄淡、檔名深 —— 一串同目錄的檔案裡，眼睛要抓的是右邊那一段。
            **不要用 dir="rtl" 截斷**：它會把開頭的標點吃掉，`.claude/…` 會變成 `claude/…` */}
        {label === "path" && dir && <span className="text-gray-400">{dir}</span>}
        <span className="text-gray-700">{file.path.split("/").pop()}</span>
      </span>
      {trailing}
    </button>
  );
}

/** 樹狀檢視的一層。目錄可以收合，收合狀態的 key 由 `keyPrefix` 分開（同一頁有多個樹） */
export function TreeRows<T extends ChangedFile>({
  nodes,
  depth = 0,
  keyPrefix,
  collapsed,
  onToggle,
  selectedPath,
  onOpen,
  extras,
}: {
  nodes: TreeNode<T>[];
  depth?: number;
  keyPrefix: string;
  collapsed: Set<string>;
  onToggle: (key: string) => void;
  selectedPath: string | null;
  onOpen: (f: T) => void;
  /** 每一列要多畫什麼（C／W 標記之類） */
  extras?: (f: T) => RowExtras;
}) {
  return (
    <>
      {nodes.map((n) => {
        if (n.file) {
          const f = n.file;
          return (
            <FileRow
              key={n.path}
              file={f}
              label="name"
              depth={depth}
              selected={selectedPath === n.path}
              onOpen={() => onOpen(f)}
              {...extras?.(f)}
            />
          );
        }
        const key = `${keyPrefix}:${n.path}`;
        const open = !collapsed.has(key);
        return (
          <div key={n.path}>
            <button
              onClick={() => onToggle(key)}
              style={{ paddingLeft: 16 + depth * 14 }}
              className="flex w-full items-center gap-1.5 whitespace-nowrap py-1 pr-4 text-left text-xs hover:bg-gray-50"
            >
              <Icon
                name={open ? "chevronDown" : "chevronRight"}
                size={12}
                className="shrink-0 text-gray-400"
              />
              <span className="font-mono text-gray-500">{n.name}</span>
            </button>
            {open && (
              <TreeRows
                nodes={n.children}
                depth={depth + 1}
                keyPrefix={keyPrefix}
                collapsed={collapsed}
                onToggle={onToggle}
                selectedPath={selectedPath}
                onOpen={onOpen}
                extras={extras}
              />
            )}
          </div>
        );
      })}
    </>
  );
}
