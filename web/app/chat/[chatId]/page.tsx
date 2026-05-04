"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import Avatar from "@/components/Avatar";
import MessageContent from "@/components/MessageContent";

interface Message {
  id: number;
  teams_msg_id: string;
  display_name: string | null;
  content: string | null;
  content_type: string | null;
  composed_at: string | null;
  is_deleted: number;
  reactions: { emoji: string; display_name: string | null }[];
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("zh-TW", {
    month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function isSystemMessage(type: string | null): boolean {
  return !!type && !type.startsWith("RichText") && !type.startsWith("Text");
}

function ChatPageInner() {
  const { chatId } = useParams<{ chatId: string }>();
  const searchParams = useSearchParams();
  const highlightMsgId = searchParams.get("msg");

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async (before?: string) => {
    const url = `/api/chats/${chatId}/messages?limit=60${before ? `&before=${encodeURIComponent(before)}` : ""}`;
    const res = await fetch(url);
    return res.json() as Promise<Message[]>;
  }, [chatId]);

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    setHasMore(true);
    fetchMessages().then((msgs) => {
      setMessages(msgs);
      setHasMore(msgs.length >= 60);
      setLoading(false);
      // scroll to highlighted msg or bottom
      setTimeout(() => {
        if (highlightMsgId) {
          highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        } else {
          bottomRef.current?.scrollIntoView();
        }
      }, 100);
    });
  }, [chatId, fetchMessages, highlightMsgId]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    const oldest = messages[0]?.composed_at ?? undefined;
    const older = await fetchMessages(oldest ?? undefined);
    setHasMore(older.length >= 60);
    setMessages((prev) => [...older, ...prev]);
    setLoadingMore(false);
  }, [loadingMore, hasMore, messages, fetchMessages]);

  useEffect(() => {
    const el = topRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) loadMore();
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  const filtered = search
    ? messages.filter((m) =>
        m.content?.toLowerCase().includes(search.toLowerCase()) ||
        m.display_name?.toLowerCase().includes(search.toLowerCase())
      )
    : messages;

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-4 py-2 border-b border-gray-200 bg-white shrink-0">
        <input
          type="text"
          placeholder="搜尋訊息..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400"
        />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-0.5">
        <div ref={topRef} className="h-4 flex items-center justify-center">
          {loadingMore && <span className="text-xs text-gray-400">載入更多...</span>}
          {!hasMore && messages.length > 0 && (
            <span className="text-xs text-gray-300">— 已到最早訊息 —</span>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center h-40 text-gray-400">載入中...</div>
        )}

        {filtered.map((msg, i) => {
          const prev = filtered[i - 1];
          const isSameSender =
            prev?.display_name === msg.display_name &&
            Math.abs(
              new Date(msg.composed_at ?? "").getTime() -
              new Date(prev?.composed_at ?? "").getTime()
            ) < 5 * 60 * 1000;

          const name = msg.display_name || "Unknown";
          const isSystem = isSystemMessage(msg.content_type);
          const isHighlighted = msg.teams_msg_id === highlightMsgId;

          if (isSystem) {
            return (
              <div key={msg.id} className="flex justify-center py-1">
                <span className="text-xs text-gray-400 bg-gray-100 px-3 py-0.5 rounded-full">
                  系統訊息
                </span>
              </div>
            );
          }

          return (
            <div
              key={msg.id}
              id={`msg-${msg.teams_msg_id}`}
              ref={isHighlighted ? highlightRef : undefined}
              className={`flex gap-2.5 rounded-lg px-2 transition-colors ${
                isSameSender ? "mt-0.5" : "mt-3"
              } ${isHighlighted ? "bg-amber-50 ring-2 ring-amber-300" : ""}`}
            >
              {/* Avatar */}
              <div className="w-9 shrink-0">
                {!isSameSender && <Avatar name={name} />}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 py-0.5">
                {!isSameSender && (
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-gray-900">{name}</span>
                    <span className="text-xs text-gray-400">{formatTime(msg.composed_at)}</span>
                  </div>
                )}

                {msg.is_deleted ? (
                  <p className="text-sm text-gray-400 italic">此訊息已刪除</p>
                ) : (
                  <MessageContent html={msg.content ?? ""} />
                )}

                {msg.reactions.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {Object.entries(
                      msg.reactions.reduce<Record<string, number>>((acc, r) => {
                        acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
                        return acc;
                      }, {})
                    ).map(([emoji, count]) => (
                      <span key={emoji} className="inline-flex items-center gap-0.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-full px-2 py-0.5 cursor-default">
                        {emoji} {count > 1 && <span className="text-gray-600">{count}</span>}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full text-gray-400">載入中...</div>}>
      <ChatPageInner />
    </Suspense>
  );
}
