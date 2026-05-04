"use client";

import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Chat {
  id: number;
  topic: string | null;
  message_count: number;
}

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const { chatId } = useParams<{ chatId: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const [chat, setChat] = useState<Chat | null>(null);

  const isSummary = pathname.endsWith("/summary");

  useEffect(() => {
    fetch(`/api/chats`).then((r) => r.json()).then((chats: Chat[]) => {
      setChat(chats.find((c) => c.id === parseInt(chatId)) ?? null);
    });
  }, [chatId]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-3 pb-0 border-b border-gray-200 shrink-0">
        <div className="flex items-end justify-between">
          <div className="mb-2">
            <h2 className="font-semibold text-gray-900">{chat?.topic || "..."}</h2>
            <p className="text-xs text-gray-400">{chat?.message_count ?? 0} 則訊息</p>
          </div>
          {/* Tabs */}
          <div className="flex gap-1">
            <button
              onClick={() => router.push(`/chat/${chatId}`)}
              className={`px-4 py-2 text-sm rounded-t-lg transition-colors ${
                !isSummary
                  ? "bg-white border border-b-white border-gray-200 font-medium text-gray-900 -mb-px"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              💬 對話
            </button>
            <button
              onClick={() => router.push(`/chat/${chatId}/summary`)}
              className={`px-4 py-2 text-sm rounded-t-lg transition-colors ${
                isSummary
                  ? "bg-white border border-b-white border-gray-200 font-medium text-gray-900 -mb-px"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              📋 摘要
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
    </div>
  );
}
