import { getChat } from "@/lib/db";

export default async function ChatLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ chatId: string }>;
}) {
  const { chatId } = await params;
  const chat = getChat(parseInt(chatId, 10));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 shrink-0">
        <h2 className="font-semibold text-gray-900">{chat?.topic || "(無標題)"}</h2>
        <p className="text-xs text-gray-400">{chat?.message_count ?? 0} 則訊息</p>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {children}
      </div>
    </div>
  );
}
