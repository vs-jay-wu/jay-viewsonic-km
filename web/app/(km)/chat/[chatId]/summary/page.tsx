"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import Icon from "@/components/Icon";

interface KeyMessage {
  teams_msg_id: string;
  label: string;
}

interface Summary {
  id: number;
  title: string;
  period_start: string | null;
  period_end: string | null;
  summary_text: string | null;
  key_messages: KeyMessage[];
  generated_at: string;
}

export default function SummaryPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const router = useRouter();
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/chats/${chatId}/summaries`)
      .then((r) => r.json())
      .then((data) => {
        setSummaries(data);
        setLoading(false);
      });
  }, [chatId]);

  const handleDelete = async (id: number) => {
    await fetch(`/api/summaries/${id}`, { method: "DELETE" });
    setSummaries((prev) => prev.filter((s) => s.id !== id));
  };

  if (loading) {
    return <div className="flex items-center justify-center h-40 text-fg-subtle">載入中...</div>;
  }

  if (summaries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-fg-subtle">
        <Icon name="clipboard" size={40} className="text-fg-disabled" />
        <p className="text-sm">尚無摘要</p>
        <p className="text-xs text-fg-disabled">請透過 Claude 生成此聊天室的摘要</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-6 max-w-3xl mx-auto w-full">
      {summaries.map((s) => (
        <div key={s.id} className="bg-surface border border-line rounded-xl shadow-sm overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b border-line flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-fg">{s.title}</h3>
              {(s.period_start || s.period_end) && (
                <p className="text-xs text-fg-subtle mt-0.5">
                  {s.period_start?.slice(0, 10)} ～ {s.period_end?.slice(0, 10)}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-fg-disabled">{s.generated_at.slice(0, 16)}</span>
              <button
                onClick={() => handleDelete(s.id)}
                className="text-xs text-danger hover:text-danger transition-colors"
              >
                刪除
              </button>
            </div>
          </div>

          {/* Summary text */}
          {s.summary_text && (
            <div className="px-5 py-4 prose prose-sm max-w-none text-fg
              [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1
              [&_ul]:my-1 [&_li]:my-0.5 [&_strong]:text-fg">
              <ReactMarkdown>{s.summary_text}</ReactMarkdown>
            </div>
          )}

          {/* Key messages */}
          {s.key_messages.length > 0 && (
            <div className="px-5 py-3 bg-warn-bg border-t border-warn/40">
              <p className="text-xs font-semibold text-warn mb-2">🔑 關鍵訊息</p>
              <ul className="space-y-1.5">
                {s.key_messages.map((km) => (
                  <li key={km.teams_msg_id} className="flex items-start gap-2">
                    <span className="text-xs text-fg-muted flex-1">{km.label}</span>
                    <button
                      onClick={() =>
                        router.push(`/chat/${chatId}?msg=${km.teams_msg_id}`)
                      }
                      className="text-xs text-accent hover:text-accent shrink-0 underline underline-offset-2"
                    >
                      查看
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
