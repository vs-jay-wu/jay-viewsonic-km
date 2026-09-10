"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useParams } from "next/navigation";

interface Chat {
  id: number;
  topic: string | null;
  message_count: number;
}

const TOOLS = [
  { href: "/", label: "首頁", icon: "🏠" },
  { href: "/memory", label: "記憶體", icon: "🧹" },
  { href: "/pr-inbox", label: "PR 巡邏", icon: "🔁" },
  { href: "/sessions", label: "Claude Sessions", icon: "🗂️" },
];

export default function Sidebar() {
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

  return (
    <aside className="w-64 shrink-0 bg-[#2d2d2d] text-white flex flex-col h-full">
      <div className="px-4 py-4 border-b border-white/10">
        <h1 className="text-base font-semibold">KM 工作台</h1>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {TOOLS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={itemClass(
              t.href === "/" ? pathname === "/" : pathname.startsWith(t.href)
            )}
          >
            <span className="text-base">{t.icon}</span>
            <span className="truncate flex-1">{t.label}</span>
          </Link>
        ))}

        <div className="px-4 pt-5 pb-1.5 text-[11px] uppercase tracking-wide text-white/35">
          Teams Archive
        </div>
        {chats.map((chat) => (
          <Link
            key={chat.id}
            href={`/chat/${chat.id}`}
            className={itemClass(activeChatId === chat.id)}
          >
            <span className="text-lg">#</span>
            <span className="truncate flex-1">{chat.topic || "(無標題)"}</span>
            <span className="text-xs text-white/40 shrink-0">{chat.message_count}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
