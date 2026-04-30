"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface Chat {
  id: number;
  topic: string | null;
  message_count: number;
}

export default function Sidebar() {
  const [chats, setChats] = useState<Chat[]>([]);
  const params = useParams();
  const activeChatId = params?.chatId ? Number(params.chatId) : null;

  useEffect(() => {
    fetch("/api/chats").then((r) => r.json()).then(setChats);
  }, []);

  return (
    <aside className="w-64 shrink-0 bg-[#2d2d2d] text-white flex flex-col h-full">
      <div className="px-4 py-4 border-b border-white/10">
        <h1 className="text-base font-semibold">Teams Archive</h1>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {chats.map((chat) => (
          <Link
            key={chat.id}
            href={`/chat/${chat.id}`}
            className={`flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-white/10 transition-colors ${
              activeChatId === chat.id ? "bg-white/20 font-medium" : "text-white/80"
            }`}
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
