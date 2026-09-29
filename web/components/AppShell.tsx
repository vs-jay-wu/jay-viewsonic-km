"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import Sidebar from "@/components/Sidebar";

/**
 * km 工作台的外框。
 *
 * **寬螢幕**：側邊欄固定佔一欄，跟以前一樣。
 * **窄螢幕（< md）**：側邊欄變成浮在內容上的抽屜，預設收起來，
 * 由上方那條細 bar 的按鈕開關；點遮罩、按 Esc、或點任何一個連結都會收起來。
 *
 * 抽屜用 `translate-x` 滑入而不是條件式 render —— 這樣有動畫，
 * 而且側邊欄的狀態（例如它自己抓的聊天室清單）不會每次開關都重來。
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  /**
   * 寬螢幕的「只留圖示」。跟窄螢幕那個抽屜是**兩件事**：抽屜是整欄滑掉，
   * 這個是留著一條 64px 的圖示列（Jay 2026-09-24）。
   */
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem("km.sidebar.collapsed") === "1");
  }, []);

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem("km.sidebar.collapsed", c ? "0" : "1");
      } catch {
        // 記不住就算了，這次還是會收起來
      }
      return !c;
    });

  // Esc 收起抽屜。只在開著的時候掛，免得跟頁面自己的 Esc（例如對話紀錄面板）搶
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="flex h-full flex-col bg-surface-raised md:flex-row">
      {/* 窄螢幕才有的頂列。用 sticky 佔位而不是浮在內容上，
          這樣頁面標題不會被按鈕蓋住 */}
      <header className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-4 py-2.5 md:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="開啟選單"
          className="text-fg-muted hover:text-fg"
        >
          <Icon name="menu" size={20} />
        </button>
        <span className="text-sm font-semibold text-fg">KM 工作台</span>
      </header>

      {/* 遮罩：只在窄螢幕、而且抽屜開著時出現 */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
          role="presentation"
        />
      )}

      <div
        className={`fixed inset-y-0 left-0 z-40 transition-transform duration-200 md:static md:z-auto md:translate-x-0 ${
          open ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
      >
        <Sidebar
          onNavigate={() => setOpen(false)}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
        />
      </div>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface">
        {children}
      </main>
    </div>
  );
}
