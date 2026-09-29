"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon, { type IconName } from "@/components/Icon";
import KmMark from "@/components/KmMark";
import Tooltip from "@/components/Tooltip";
import { NAV, isActiveNav } from "@/lib/navRules";
import { onPinChanged } from "@/lib/pinEvents";

interface Pinned {
  dir: string;
  name: string;
}


/**
 * 掛在同一個 domain、但**不是 km 工作台**的站（各自 root layout 與設計，
 * 見 `app/(av)/layout.tsx`）。一律開新分頁，而且那邊不會有連回來的路。
 */
const EXTERNAL_SITES: { href: string; label: string; icon: IconName }[] = [
  { href: "/av-streaming", label: "AV Streaming 筆記", icon: "cpu" },
];

/**
 * 側邊欄。寬螢幕是固定的一欄；窄螢幕由 `AppShell` 當抽屜用（浮在內容上），
 * 點任何一個連結就收起來 —— 不然點完還擋著你要看的東西。
 */
export default function Sidebar({
  onNavigate,
  collapsed = false,
  onToggleCollapsed,
}: {
  onNavigate?: () => void;
  /**
   * 只留圖示的窄版。**只在寬螢幕生效**（所有相關的 class 都掛 `md:`）——
   * 窄螢幕的側邊欄是浮出來的抽屜，收起來的方式是整個滑掉，不是變窄。
   */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
} = {}) {
  const [pinned, setPinned] = useState<Pinned[]>([]);
  const pathname = usePathname();

  /**
   * pin 住的 repo 直接放到側邊欄（Jay 2026-09-23，取代原本的 Teams 頻道清單）。
   *
   * 只打 `/api/git/pin`（一個 JSON 檔）而不是整份 repo 清單 —— 側邊欄每頁都會
   * 掛，不該為了幾個名字去觸發 2.6 秒的掃描。
   *
   * **worktree 不列**（Jay 2026-09-23）：側邊欄是「常去的幾個地方」，
   * 分支層級的東西屬於工作台裡面的那顆下拉。哪些是 worktree 由 server 判斷
   * （看 `.git` 是檔案還是目錄），不是從名字猜 —— 猜錯會讓真的 repo 消失。
   */
  const loadPinned = useCallback(() => {
    fetch("/api/git/pin")
      .then((r) => r.json())
      .then((d: { pinned?: string[]; worktrees?: string[] }) => {
        const skip = new Set(d.worktrees ?? []);
        setPinned(
          (d.pinned ?? [])
            .filter((dir) => !skip.has(dir))
            .map((dir) => ({ dir, name: dir.split("/").pop() ?? dir }))
        );
      })
      .catch(() => undefined);
  }, []);

  // 換頁時重抓（pin 可能在別頁被改過），另外聽「pin 變了」——
  // 在工作台按 pin 不會換頁，只靠 pathname 的話側邊欄不會動（Jay 2026-09-23）
  useEffect(() => loadPinned(), [pathname, loadPinned]);
  useEffect(() => onPinChanged(loadPinned), [loadPinned]);

  const itemClass = (active: boolean) =>
    `flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-white/10 transition-colors ${
      active ? "bg-white/20 font-medium" : "text-white/80"
    } ${collapsed ? "md:justify-center md:px-0" : ""}`;

  /** 收合時要藏起來的文字。`md:` 是關鍵 —— 抽屜（窄螢幕）永遠要看得到字 */
  const labelClass = collapsed ? "md:hidden" : "";

  /** 收合時只剩圖示，一定要有 tooltip（見 web/AGENTS.md） */
  const withTip = (label: string, node: React.ReactNode) =>
    collapsed ? (
      // `w-full`：泡泡要從整條側邊欄的右緣開，不是從圖示那 16px 的右緣
      <Tooltip side="right" label={label} className="w-full">
        {node}
      </Tooltip>
    ) : (
      node
    );

  /*
   * **固定深底**：這一欄不跟主題翻（`bg-[#2d2d2d]`）。上面的顏色一律寫死白色，
   * **不要換成 token** —— token 在深色主題會翻成近黑色，字就不見了。
   * 2026-09-22 做深色模式時機械替換誤傷過一次。
   */
  return (
    <aside
      className={`w-64 shrink-0 bg-[#2d2d2d] text-white flex flex-col h-full overflow-hidden transition-[width] duration-150 ${
        collapsed ? "md:w-16" : ""
      }`}
    >
      {/*
        展開時：logo ＋ 標題 ＋ 右邊那顆收合鈕。
        收合時：只剩一個 64px 的方塊，**滑過去才淡入展開鈕**（Jay 2026-09-24）——
        常駐一顆箭頭在那條窄欄裡太吵，而 logo 本身就是最好的落點。
      */}
      {collapsed ? (
        <div className="border-b border-white/10">
          {/* 窄螢幕（抽屜）不收合，照樣給完整的標題列 */}
          <Link
            href="/"
            onClick={onNavigate}
            className="flex items-center gap-2.5 px-4 py-4 transition-colors hover:bg-white/10 md:hidden"
          >
            <KmMark size={22} />
            <h1 className="truncate text-base font-semibold">KM 工作台</h1>
          </Link>

          <div className="group relative hidden h-14 w-16 md:block">
            <Link
              href="/"
              onClick={onNavigate}
              aria-label="回首頁"
              className="absolute inset-0 flex items-center justify-center transition-opacity group-hover:opacity-0"
            >
              <KmMark size={22} />
            </Link>
            <Tooltip side="right" label="展開側邊欄" className="absolute inset-0">
              <button
                onClick={onToggleCollapsed}
                aria-label="展開側邊欄"
                aria-expanded={false}
                className="flex h-full w-full items-center justify-center text-white/60 opacity-0 transition-opacity hover:bg-white/10 hover:text-white group-hover:opacity-100 focus-visible:opacity-100"
              >
                <Icon name="chevronRight" size={16} />
              </button>
            </Tooltip>
          </div>
        </div>
      ) : (
        <div className="flex items-center border-b border-white/10">
          <Link
            href="/"
            onClick={onNavigate}
            className="flex min-w-0 flex-1 items-center gap-2.5 px-4 py-4 transition-colors hover:bg-white/10"
          >
            <KmMark size={22} />
            <h1 className="truncate text-base font-semibold">KM 工作台</h1>
          </Link>
          {onToggleCollapsed && (
            <Tooltip side="right" label="收合側邊欄（只留圖示）">
              <button
                onClick={onToggleCollapsed}
                aria-label="收合側邊欄"
                aria-expanded
                className="hidden shrink-0 px-3 py-4 text-white/40 hover:text-white md:block"
              >
                <Icon name="chevronLeft" size={16} />
              </button>
            </Tooltip>
          )}
        </div>
      )}

      <nav className="flex-1 overflow-y-auto py-2">
        {NAV.map((t) => (
          <div key={t.href}>
            {withTip(
              t.label,
              <Link
                href={t.href}
                onClick={onNavigate}
                className={`${itemClass(isActiveNav(t, pathname))} w-full`}
              >
                <Icon name={t.icon} size={16} className="text-white/60" />
                <span className={`truncate flex-1 ${labelClass}`}>{t.label}</span>
              </Link>
            )}
          </div>
        ))}

        {/* 收合時分組標題換成一條線 —— 16px 寬放不下字，硬塞會被截成「另」 */}
        {collapsed ? (
          <div className="mx-3 my-3 hidden border-t border-white/10 md:block" />
        ) : null}
        <div className={`px-4 pt-5 pb-1.5 text-[11px] uppercase tracking-wide text-white/35 ${labelClass}`}>
          另一套站
        </div>
        {EXTERNAL_SITES.map((s) => (
          <div key={s.href}>
            {withTip(
              s.label,
              <a
                href={s.href}
                target="_blank"
                rel="noreferrer"
                className={`${itemClass(false)} group w-full`}
              >
                <Icon name={s.icon} size={16} className="text-white/60" />
                <span className={`truncate flex-1 ${labelClass}`}>{s.label}</span>
                <Icon
                  name="external"
                  size={12}
                  className={`text-white/30 group-hover:text-white/60 ${labelClass}`}
                />
              </a>
            )}
          </div>
        ))}

        {pinned.length > 0 && (
          <>
            {collapsed ? (
              <div className="mx-3 my-3 hidden border-t border-white/10 md:block" />
            ) : null}
            <div className={`px-4 pt-5 pb-1.5 text-[11px] uppercase tracking-wide text-white/35 ${labelClass}`}>
              已 pin
            </div>
            {pinned.map((p) => (
              <div key={p.dir}>
                {withTip(
                  p.name,
                  <Link
                    // 不指定視圖 —— `/repo` 會導到你上次看的那個（lib/repoViewPref.ts）
                    href={`/repo?dir=${encodeURIComponent(p.dir)}`}
                    onClick={onNavigate}
                    className={`${itemClass(false)} w-full`}
                  >
                    <Icon name="repos" size={14} className="text-white/40" />
                    <span className={`truncate flex-1 font-mono text-[13px] ${labelClass}`}>
                      {p.name}
                    </span>
                  </Link>
                )}
              </div>
            ))}
          </>
        )}
      </nav>
    </aside>
  );
}
