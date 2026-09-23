"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon, { type IconName } from "@/components/Icon";
import { NAV, isActiveNav } from "@/lib/navRules";

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
export default function Sidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
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
  useEffect(() => {
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
  }, [pathname]);

  const itemClass = (active: boolean) =>
    `flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-white/10 transition-colors ${
      active ? "bg-white/20 font-medium" : "text-white/80"
    }`;

  /*
   * **固定深底**：這一欄不跟主題翻（`bg-[#2d2d2d]`）。上面的顏色一律寫死白色，
   * **不要換成 token** —— token 在深色主題會翻成近黑色，字就不見了。
   * 2026-09-22 做深色模式時機械替換誤傷過一次。
   */
  return (
    <aside className="w-64 shrink-0 bg-[#2d2d2d] text-white flex flex-col h-full overflow-hidden">
      <div className="border-b border-white/10">
        <Link
          href="/"
          onClick={onNavigate}
          className="block px-4 py-4 hover:bg-white/10 transition-colors"
        >
          <h1 className="text-base font-semibold">KM 工作台</h1>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {NAV.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            onClick={onNavigate}
            className={itemClass(isActiveNav(t, pathname))}
          >
            <Icon name={t.icon} size={16} className="text-white/60" />
            <span className="truncate flex-1">{t.label}</span>
          </Link>
        ))}

        <div className="px-4 pt-5 pb-1.5 text-[11px] uppercase tracking-wide text-white/35">
          另一套站
        </div>
        {EXTERNAL_SITES.map((s) => (
          <a
            key={s.href}
            href={s.href}
            target="_blank"
            rel="noreferrer"
            className={`${itemClass(false)} group`}
          >
            <Icon name={s.icon} size={16} className="text-white/60" />
            <span className="truncate flex-1">{s.label}</span>
            <Icon name="external" size={12} className="text-white/30 group-hover:text-white/60" />
          </a>
        ))}

        {pinned.length > 0 && (
          <>
            <div className="px-4 pt-5 pb-1.5 text-[11px] uppercase tracking-wide text-white/35">
              已 pin
            </div>
            {pinned.map((p) => (
              <Link
                key={p.dir}
                // 不指定視圖 —— `/repo` 會導到你上次看的那個（lib/repoViewPref.ts）
                href={`/repo?dir=${encodeURIComponent(p.dir)}`}
                onClick={onNavigate}
                className={itemClass(false)}
              >
                <Icon name="repos" size={14} className="text-white/40" />
                <span className="truncate flex-1 font-mono text-[13px]">{p.name}</span>
              </Link>
            ))}
          </>
        )}
      </nav>
    </aside>
  );
}
