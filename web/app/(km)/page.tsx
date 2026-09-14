import Link from "next/link";
import { listChats } from "@/lib/db";
import { readSnapshot } from "@/lib/myPrs";
import { classifyError, SOURCE_LABELS, unhealthySources } from "@/lib/health";
import { readDisks } from "@/lib/disk";
import { formatGB, isLow, levelOf, WARN_BELOW_PERCENT } from "@/lib/diskRules";
import { orcaPresence } from "@/lib/orca";
import Icon, { type IconName } from "@/components/Icon";
import BuildDirsSection from "@/components/BuildDirsSection";
import QuickNote from "@/components/QuickNote";
import HomeOpenPrs from "@/components/HomeOpenPrs";

export const dynamic = "force-dynamic";

const TOOLS: { href: string; icon: IconName; title: string; desc: string }[] = [
  {
    href: "/tickets",
    icon: "clipboard",
    title: "單追蹤",
    desc: "指派給我或我開的 VB 單；點一下就能開對應的 Claude session",
  },
  {
    href: "/my-prs",
    icon: "gitPr",
    title: "我的 PR",
    desc: "自己開的單現在什麼狀態；有人 review 或 approve 就通知",
  },
  {
    href: "/vb-bugs",
    icon: "alert",
    title: "VB Bug 總覽",
    desc: "Jira 上未完成的 bug，依產品 × 狀態 × 優先度看一張表",
  },
  {
    href: "/changes",
    icon: "code",
    title: "未提交的改動",
    desc: "跨所有 repo 與 worktree 的未提交改動；直接看 diff，不用開 VS Code",
  },
  {
    href: "/docs",
    icon: "clipboard",
    title: "文件",
    desc: "docs/ 底下的 HTML 文件集；可 pin、點了用瀏覽器開",
  },
  {
    href: "/sessions",
    icon: "layers",
    title: "Claude Sessions",
    desc: "檢視本機 session、pin 住重要的、批次刪掉不要的",
  },
];

/** 不常用、平常只在背景跑的東西 —— 放頁面最底下，但每一項都點得進去 */
/**
 * `external: true` 的項目是**另一套系統**（目前只有 av-streaming）——
 * 它掛在同一個 domain 底下，但有自己的 root layout 與設計，
 * 所以一律開新分頁，不要用 client-side 導覽把人帶離 km 工作台。
 */
const OTHERS: {
  href: string; icon: IconName; title: string; desc: string; external?: boolean;
}[] = [
  {
    href: "/repo-sync",
    icon: "refresh",
    title: "Repo 同步",
    desc: "每晚自動把 org 的 repo pull 一次；有掛外接就連 offloaded 的一起",
  },
  {
    href: "/memory",
    icon: "cpu",
    title: "記憶體狀況",
    desc: "看目前記憶體／swap，並執行 memclean 清掉殭屍開發行程",
  },
  {
    href: "/pr-inbox",
    icon: "refresh",
    title: "PR 巡邏",
    desc: "定期偵測待處理的 PR，必要時才叫 Claude 跑 /handle-pr-inbox",
  },
  {
    href: "/repos",
    icon: "repos",
    title: "Repos 總覽",
    desc: "org 底下每個 repo 是做什麼的、別名、技術與依賴；也在這裡搬進搬出外接硬碟",
  },
  {
    href: "/repos/history",
    icon: "hardDrive",
    title: "搬遷紀錄",
    desc: "本機 ↔ 外接硬碟的每一次搬移：搬了多少、花多久、有沒有失敗",
  },
  {
    href: "/av-streaming",
    icon: "layers",
    title: "AV Streaming 筆記",
    desc: "AirSync / Cast in-out / Recorder 的影音格式、串流與儲存（另一套站，開新分頁）",
    external: true,
  },
];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-TW", {
    year: "numeric", month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default async function Home() {
  // 只讀 server 定時抓好的快照，開首頁不會打 GitHub
  const myPrs = await readSnapshot().catch(() => null);
  // 連續失敗到門檻的資料來源。偶爾失敗不列 —— 那種警告看久了就會被忽略
  const unhealthy = await unhealthySources().catch(() => []);
  // 硬碟剩不到 10% 就要講（Jay 2026-09-14）。沒事的時候完全不佔版面
  const lowDisks = (await readDisks().catch(() => [])).filter(isLow);
  // 裝了就永久記住，不再偵測；沒裝才每次重測（見 lib/orca.ts）
  const orca = await orcaPresence().catch(() => null);
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
      <div className="max-w-4xl mx-auto px-4 py-6 sm:px-8 sm:py-10">
        <h1 className="text-2xl font-semibold text-gray-900">KM 工作台</h1>
        <p className="mt-1.5 text-sm text-gray-500">
          本機知識庫的操作面板：Teams 歸檔瀏覽，加上幾個常用的維運工具。
        </p>

        {orca && !orca.installed && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4">
            <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-red-800">
              <Icon name="alert" size={16} />
              找不到 Orca
              <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-normal text-white">
                需要你處理
              </span>
            </div>
            <div className="mt-1.5 text-xs text-red-700">
              <code>{orca.appPath}</code> 不存在，session 頁的「在 Orca 開啟」用不了。
              裝好之後首頁會自己恢復（偵測到有裝就不再重測）。
            </div>
          </div>
        )}

        {/* 硬碟快滿。10% 以下是警告（琥珀），5% 以下是要馬上處理（紅） */}
        {lowDisks.map((d) => {
          const critical = levelOf(d) === "critical";
          return (
            <div
              key={d.mount}
              className={`mt-6 rounded-xl border px-5 py-4 ${
                critical ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"
              }`}
            >
              <div
                className={`flex flex-wrap items-center gap-2 text-sm font-medium ${
                  critical ? "text-red-800" : "text-amber-800"
                }`}
              >
                <Icon name="alert" size={16} />
                {d.label}硬碟快滿了
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-normal ${
                    critical ? "bg-red-600 text-white" : "bg-amber-200 text-amber-900"
                  }`}
                >
                  剩 {d.freePercent.toFixed(1)}%
                </span>
                <span className="font-normal">
                  {formatGB(d.freeBytes)} / {formatGB(d.totalBytes)} 可用
                </span>
              </div>
              <div className={`mt-1.5 text-xs ${critical ? "text-red-700" : "text-amber-700"}`}>
                低於 {WARN_BELOW_PERCENT}% 就會出現這則提醒。
                <Link href="/changes" className="ml-1 underline">
                  看未提交的改動
                </Link>
                ，或用下面的「佔空間的 build 產物」清一輪（<code>{d.mount}</code>）。
              </div>
            </div>
          );
        })}

        {/* 抓取一直失敗的來源。判準統一在 lib/healthRules.ts，各頁不另寫一套 */}
        {unhealthy.length > 0 && (
          <div className="mt-6 space-y-2">
            {unhealthy.map((h) => {
              const meta = SOURCE_LABELS[h.source];
              const needsYou = classifyError(h.lastError) === "auth";
              return (
                <div
                  key={h.source}
                  className={`rounded-xl border px-5 py-4 ${
                    needsYou
                      ? "border-red-200 bg-red-50"
                      : "border-amber-200 bg-amber-50"
                  }`}
                >
                  <div
                    className={`flex flex-wrap items-center gap-2 text-sm font-medium ${
                      needsYou ? "text-red-800" : "text-amber-800"
                    }`}
                  >
                    <Icon name="alert" size={16} />
                    <Link href={meta?.href ?? "/"} className="underline">
                      {meta?.label ?? h.source}
                    </Link>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-normal ${
                        needsYou
                          ? "bg-red-600 text-white"
                          : "bg-amber-200 text-amber-900"
                      }`}
                    >
                      {needsYou ? "需要你處理" : "持續失敗"}
                    </span>
                    <span className="font-normal">
                      連續失敗 {h.consecutiveFailures} 次
                      {h.lastSuccessAt
                        ? `，上次成功 ${fmtDate(h.lastSuccessAt)}`
                        : "，還沒成功過"}
                    </span>
                  </div>
                  {(meta?.hint || h.lastError) && (
                    <div
                      className={`mt-1.5 text-xs ${
                        needsYou ? "text-red-700" : "text-amber-700"
                      }`}
                    >
                      {meta?.hint}
                      {h.lastError && (
                        <div className="mt-1 truncate font-mono" title={h.lastError}>
                          {h.lastError}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 快速筆記：健康度警告之下、工具卡之上。
            警告一定要在最上面（那是要你處理的事），但筆記要一進來就看得到。 */}
        <QuickNote />

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
                  <div className="font-medium text-gray-900">
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
            {/* 清單本身是 client 元件：要能開／接續對應的 Claude session */}
            <HomeOpenPrs prs={openPrs} />
          </div>
        )}

        {/* build 產物：非同步載入，慢一點出來沒關係（掃描要 du 幾十 GB） */}
        <BuildDirsSection />

        {/*
          不常用的東西放下面，平常不該佔注意力（Jay 2026-09-11）。
          真的壞掉時會自己往上跑 —— 上面那組健康度警告會列出來。
        */}
        <div className="mt-10">
          <h2 className="text-sm font-semibold text-gray-900">其他服務</h2>
          <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200">
            {OTHERS.map((o) => {
              const inner = (
                <>
                  {/* gray-300 在白底上幾乎看不到（Jay 2026-09-11 回報），
                      拉到 gray-500：跟旁邊的標題文字同一個明度級別 */}
                  <Icon name={o.icon} size={15} className="text-gray-500 group-hover:text-gray-900" />
                  <span className="text-sm text-gray-800">{o.title}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-gray-400">{o.desc}</span>
                  <Icon
                    name={o.external ? "external" : "chevronRight"}
                    size={14}
                    className="text-gray-400 group-hover:text-gray-700"
                  />
                </>
              );
              const cls = "group flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors";
              return (
                <li key={o.href}>
                  {o.external ? (
                    // 另一套系統：用原生 <a> + target，不要用 next/link ——
                    // 那邊是不同的 root layout，client-side 導覽本來就會整頁重載，
                    // 而且我們要的是「留在 km 這個分頁、另開一個」
                    <a href={o.href} target="_blank" rel="noreferrer" className={cls}>
                      {inner}
                    </a>
                  ) : (
                    <Link href={o.href} className={cls}>{inner}</Link>
                  )}
                </li>
              );
            })}
          </ul>
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
