"use client";

import Icon from "@/components/Icon";
import Tooltip from "@/components/Tooltip";
import { parsePrTicketKey, ticketUrl } from "@/lib/workItemRules";
import { useTicketSession } from "@/lib/useTicketSession";

/**
 * 首頁的「我開著的 PR」。
 *
 * 是 client 元件（首頁本身是 server 元件）—— 因為要用 useTicketSession：
 * 有對應的 session 就 resume，沒有就問過名稱再開一個。PR 清單本身仍由 server
 * 從快照讀好傳進來，這裡不打 GitHub。
 */

export interface HomePr {
  repo: string;
  number: number;
  title: string;
  url: string;
  updatedAt: string;
  headRefName?: string;
  reviewDecision: string | null;
  approvedBy: string[];
  changesRequestedBy: string[];
}

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `${Math.max(min, 1)} 分前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小時前`;
  return `${Math.floor(h / 24)} 天前`;
}

function decision(pr: HomePr): { text: string; cls: string } {
  const who = (n: string[]) => (n.length ? ` · ${n.join("、")}` : "");
  if (pr.reviewDecision === "APPROVED") {
    return { text: `approved${who(pr.approvedBy)}`, cls: "border-ok/40 bg-ok-bg text-ok" };
  }
  if (pr.reviewDecision === "CHANGES_REQUESTED") {
    return { text: `要求修改${who(pr.changesRequestedBy)}`, cls: "border-warn/40 bg-warn-bg text-warn" };
  }
  return { text: "等 review", cls: "border-line bg-surface-raised text-fg-muted" };
}

export default function HomeOpenPrs({ prs }: { prs: HomePr[] }) {
  const { itemForPr, openSessionForPr, busy, notice, error } = useTicketSession();

  return (
    <>
      {/* 開 session 的結果固定佔一行，不讓下面的區塊跳動 */}
      <div className="mt-1 h-4 text-xs">
        {notice && <span className="text-accent">{notice}</span>}
        {error && <span className="text-danger">{error}</span>}
      </div>

      <ul className="mt-1 divide-y divide-line rounded-xl border border-line">
        {prs.map((pr) => {
          const d = decision(pr);
          const ticketKey = parsePrTicketKey(pr);
          const sessionCount = itemForPr(pr)?.sessions.length ?? 0;
          return (
            <li key={pr.url} className="flex items-center gap-3 px-4 py-3">
              <a
                href={pr.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-sm text-fg hover:underline"
              >
                <span className="font-mono text-xs text-fg-muted">
                  {pr.repo.split("/").pop()}#{pr.number}
                </span>{" "}
                {pr.title}
              </a>
              {ticketKey && (
                <a
                  href={ticketUrl(ticketKey)}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded-full border border-accent/50 bg-surface-selected px-2 py-0.5 font-mono text-[11px] leading-none text-accent hover:bg-accent-bg"
                >
                  {ticketKey}
                </a>
              )}
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${d.cls}`}>
                {d.text}
              </span>
              <span className="shrink-0 text-xs text-fg-subtle">{relTime(pr.updatedAt)}</span>
              <Tooltip
                side="left"
                label={
                  sessionCount > 0
                    ? `在 Orca 開這張 PR 的 session（已有 ${sessionCount} 個，開最近的那個）`
                    : "在 Orca 開一個新的 session 來做這張 PR（名稱可改）"
                }
              >
                <button
                  onClick={() => openSessionForPr(pr)}
                  disabled={busy}
                  className={`shrink-0 disabled:opacity-40 ${
                    sessionCount > 0
                      ? "text-accent hover:text-accent"
                      : "text-fg-disabled hover:text-accent"
                  }`}
                >
                  <Icon name={sessionCount > 0 ? "external" : "play"} size={15} />
                </button>
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </>
  );
}
