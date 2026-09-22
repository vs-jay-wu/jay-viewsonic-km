"use client";

import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Icon from "@/components/Icon";

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
      <div className="px-4 pt-3 pb-0 border-b border-line shrink-0">
        <div className="flex items-end justify-between">
          <div className="mb-2">
            <h2 className="font-semibold text-fg">{chat?.topic || "..."}</h2>
            <p className="text-xs text-fg-subtle">{chat?.message_count ?? 0} 則訊息</p>
          </div>
          {/* Tabs */}
          <div className="flex gap-1">
            <button
              onClick={() => router.push(`/chat/${chatId}`)}
              className={`px-4 py-2 text-sm rounded-t-lg transition-colors ${
                !isSummary
                  ? "bg-surface border border-b-white border-line font-medium text-fg -mb-px"
                  : "text-fg-subtle hover:text-fg-muted"
              }`}
            >
              <span className="inline-flex items-center gap-1.5"><Icon name="message" size={14} /> 對話</span>
            </button>
            <button
              onClick={() => router.push(`/chat/${chatId}/summary`)}
              className={`px-4 py-2 text-sm rounded-t-lg transition-colors ${
                isSummary
                  ? "bg-surface border border-b-white border-line font-medium text-fg -mb-px"
                  : "text-fg-subtle hover:text-fg-muted"
              }`}
            >
              <span className="inline-flex items-center gap-1.5"><Icon name="clipboard" size={14} /> 摘要</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
    </div>
  );
}
