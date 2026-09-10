import Link from "next/link";
import { listChats } from "@/lib/db";

export const dynamic = "force-dynamic";

const TOOLS = [
  {
    href: "/memory",
    icon: "🧹",
    title: "記憶體狀況",
    desc: "看目前記憶體／swap，並執行 memclean 清掉殭屍開發行程",
  },
  {
    href: "/pr-inbox",
    icon: "🔁",
    title: "PR 巡邏",
    desc: "定期偵測待處理的 PR，必要時才叫 Claude 跑 /handle-pr-inbox",
  },
  {
    href: "/sessions",
    icon: "🗂️",
    title: "Claude Sessions",
    desc: "檢視本機 session、pin 住重要的、批次刪掉不要的",
  },
];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-TW", {
    year: "numeric", month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function Home() {
  const chats = listChats() as (ReturnType<typeof listChats>[number] & {
    last_synced_at?: string | null;
  })[];
  const totalMessages = chats.reduce((n, c) => n + c.message_count, 0);
  const lastSynced = chats
    .map((c) => c.last_synced_at)
    .filter((s): s is string => !!s)
    .sort()
    .pop();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-10">
        <h1 className="text-2xl font-semibold text-gray-900">KM 工作台</h1>
        <p className="mt-1.5 text-sm text-gray-500">
          本機知識庫的操作面板：Teams 歸檔瀏覽，加上幾個常用的維運工具。
        </p>

        {/* 工具 */}
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {TOOLS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="group rounded-xl border border-gray-200 p-4 hover:border-gray-400 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl leading-none">{t.icon}</span>
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 group-hover:underline">
                    {t.title}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500">{t.desc}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Teams Archive */}
        <div className="mt-10">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Teams Archive</h2>
            <span className="text-xs text-gray-400">
              {chats.length} 個聊天室 · {totalMessages} 則訊息 · 最後同步 {fmtDate(lastSynced)}
            </span>
          </div>

          {chats.length === 0 ? (
            <p className="mt-3 text-sm text-gray-400">
              尚無聊天室資料 —— 先跑 <code className="text-xs">/teams-scrape</code>。
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200">
              {chats.map((chat) => (
                <li key={chat.id}>
                  <Link
                    href={`/chat/${chat.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-gray-300">#</span>
                    <span className="flex-1 truncate text-sm text-gray-800">
                      {chat.topic || "(無標題)"}
                    </span>
                    <span className="text-xs text-gray-400 shrink-0">
                      {chat.message_count} 則
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
