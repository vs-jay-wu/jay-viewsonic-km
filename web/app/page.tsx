import Link from "next/link";
import { listChats } from "@/lib/db";
import { readSnapshot } from "@/lib/myPrs";
import Icon, { type IconName } from "@/components/Icon";

export const dynamic = "force-dynamic";

const TOOLS: { href: string; icon: IconName; title: string; desc: string }[] = [
  {
    href: "/memory",
    icon: "cpu",
    title: "記憶體狀況",
    desc: "看目前記憶體／swap，並執行 memclean 清掉殭屍開發行程",
  },
  {
    href: "/my-prs",
    icon: "gitPr",
    title: "我的 PR",
    desc: "自己開的單現在什麼狀態；有人 review 或 approve 就通知",
  },
  {
    href: "/pr-inbox",
    icon: "refresh",
    title: "PR 巡邏",
    desc: "定期偵測待處理的 PR，必要時才叫 Claude 跑 /handle-pr-inbox",
  },
  {
    href: "/sessions",
    icon: "layers",
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

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `${Math.max(min, 1)} 分前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小時前`;
  return `${Math.floor(h / 24)} 天前`;
}

function decisionText(pr: {
  reviewDecision: string | null;
  approvedBy: string[];
  changesRequestedBy: string[];
}): { text: string; cls: string } {
  const who = (n: string[]) => (n.length ? ` · ${n.join("、")}` : "");
  if (pr.reviewDecision === "APPROVED") {
    return { text: `approved${who(pr.approvedBy)}`, cls: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  }
  if (pr.reviewDecision === "CHANGES_REQUESTED") {
    return { text: `要求修改${who(pr.changesRequestedBy)}`, cls: "border-amber-200 bg-amber-50 text-amber-700" };
  }
  return { text: "等 review", cls: "border-gray-200 bg-gray-50 text-gray-500" };
}

export default async function Home() {
  // 只讀 server 定時抓好的快照，開首頁不會打 GitHub
  const myPrs = await readSnapshot().catch(() => null);
  const openPrs = (myPrs?.prs ?? []).filter((p) => p.state === "OPEN");

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
                <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-600 group-hover:bg-gray-900 group-hover:text-white transition-colors">
                  <Icon name={t.icon} size={18} />
                </span>
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

        {/* 我的 PR：只在真的有開著的單時才佔版面 */}
        {openPrs.length > 0 && (
          <div className="mt-10">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-gray-900">
                我開著的 PR <span className="font-normal text-gray-400">{openPrs.length}</span>
              </h2>
              <Link href="/my-prs" className="text-xs text-gray-400 hover:text-gray-700 hover:underline">
                全部（含近期 merged）→
              </Link>
            </div>
            <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200">
              {openPrs.map((pr) => {
                const d = decisionText(pr);
                return (
                  <li key={pr.url} className="flex items-center gap-3 px-4 py-3">
                    <a
                      href={pr.url}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate text-sm text-gray-800 hover:underline"
                    >
                      <span className="font-mono text-xs text-gray-500">
                        {pr.repo.split("/").pop()}#{pr.number}
                      </span>{" "}
                      {pr.title}
                    </a>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${d.cls}`}>
                      {d.text}
                    </span>
                    <span className="shrink-0 text-xs text-gray-400">
                      {relTime(pr.updatedAt)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

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
                    <Icon name="hash" size={14} className="text-gray-300" />
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
