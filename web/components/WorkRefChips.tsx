"use client";

import Icon from "@/components/Icon";
import Tooltip from "@/components/Tooltip";
import { canonicalRepo, ticketUrl, type WorkRef } from "@/lib/workItemRules";

/**
 * 把 session 標題解析出來的關聯（ticket／PR）顯示成可點的小標籤。
 *
 * **猜出來的 key 要看得出是猜的**（後面加問號、tooltip 講明白）——
 * 裸數字補 project 有猜錯的實績（`9904` 其實是 VSFT 不是 VB），
 * 不標的話點下去會開到不存在或不相干的單。
 */
export default function WorkRefChips({
  refs,
  org = "Viewsonic-EDU",
  showPr = true,
}: {
  refs: WorkRef;
  org?: string;
  /** 關聯索引已經有真正的 PR 資料時設 false —— 不要畫兩顆同號的 PR 標籤 */
  showPr?: boolean;
}) {
  if (!refs.ticketKey && (refs.prNumber === null || !showPr)) return null;
  const repo = canonicalRepo(refs.repo);

  return (
    <span className="flex shrink-0 items-center gap-1">
      {refs.ticketKey && (
        <Tooltip
          side="left"
          label={
            refs.ticketGuessed
              ? `標題只寫了數字，推定是 ${refs.ticketKey}（可能猜錯）`
              : `到 Jira 看 ${refs.ticketKey}`
          }
        >
          <a
            href={ticketUrl(refs.ticketKey)}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={`rounded-full border px-1.5 py-0.5 font-mono text-[11px] leading-none ${
              refs.ticketGuessed
                ? "border-line bg-surface-raised text-fg-muted"
                : "border-accent/50 bg-surface-selected text-accent"
            }`}
          >
            {refs.ticketKey}
            {refs.ticketGuessed && "?"}
          </a>
        </Tooltip>
      )}
      {showPr && refs.prNumber !== null && repo && (
        <Tooltip side="left" label={`到 GitHub 看 ${repo}#${refs.prNumber}`}>
          <a
            href={`https://github.com/${org}/${repo}/pull/${refs.prNumber}`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-raised px-1.5 py-0.5 text-[11px] leading-none text-fg-muted"
          >
            <Icon name="gitPr" size={10} />
            {refs.prNumber}
          </a>
        </Tooltip>
      )}
    </span>
  );
}
