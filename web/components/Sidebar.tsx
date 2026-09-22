"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import Icon, { type IconName } from "@/components/Icon";
import { NAV } from "@/lib/navRules";

interface Chat {
  id: number;
  topic: string | null;
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
  const [chats, setChats] = useState<Chat[]>([]);
  const params = useParams();
  const pathname = usePathname();
  const activeChatId = params?.chatId ? Number(params.chatId) : null;

  useEffect(() => {
    fetch("/api/chats").then((r) => r.json()).then(setChats);
  }, []);

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
            className={itemClass(
              t.href === "/" ? pathname === "/" : pathname.startsWith(t.href)
            )}
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

        <div className="px-4 pt-5 pb-1.5 text-[11px] uppercase tracking-wide text-white/35">
          Teams Archive
        </div>
        {chats.map((chat) => (
          <Link
            key={chat.id}
            href={`/chat/${chat.id}`}
            onClick={onNavigate}
            className={itemClass(activeChatId === chat.id)}
          >
            <Icon name="hash" size={14} className="text-white/40" />
            <span className="truncate flex-1">{chat.topic || "(無標題)"}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
