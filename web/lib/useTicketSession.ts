"use client";

import { useCallback, useEffect, useState } from "react";
import { usePrompt } from "@/components/Prompt";
import { canonicalRepo, defaultSessionTitleForTicket } from "@/lib/workItemRules";
import type { WorkIndex, WorkItem } from "@/lib/workIndexRules";

/**
 * 「這張單有沒有對應的 Claude session，沒有就開一個」這件事，
 * 在「指派給我的單」與「VB Bug 總覽」都要做，所以抽成一個 hook —— 兩份會漂移。
 *
 * 開新 session 一定會先問名稱（預設值照 `[km/<別名>] 單號 描述` 的慣例），
 * 因為**關聯完全靠標題**：名稱亂寫的話下次就找不回來。
 */
export function useTicketSession() {
  const [workIndex, setWorkIndex] = useState<WorkIndex | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ask = usePrompt();

  const loadIndex = useCallback(async (force = false) => {
    const res = await fetch(`/api/work-index${force ? "?force=1" : ""}`);
    if (res.ok) setWorkIndex((await res.json()) as WorkIndex);
  }, []);

  useEffect(() => { void loadIndex(); }, [loadIndex]);

  const itemOf = useCallback(
    (key: string): WorkItem | undefined => workIndex?.items.find((i) => i.key === key),
    [workIndex]
  );

  const openSessionFor = useCallback(
    async (ticket: { key: string; summary: string }) => {
      setBusy(true);
      setNotice(null);
      setError(null);
      try {
        const item = workIndex?.items.find((i) => i.key === ticket.key);
        const existing = item?.sessions[0];
        if (existing) {
          const res = await fetch(`/api/sessions/${existing.id}/open`, { method: "POST" });
          const out = await res.json();
          setNotice(
            out.status === "opened" || out.status === "reused"
              ? `已在 Orca 開啟：${existing.title}`
              : out.status === "external"
                ? `已經有人在別的地方 resume 這個 session（pid ${out.pid}）`
                : out.error ?? `Orca 回報：${out.status}`
          );
          return;
        }

        const title = await ask({
          title: "新 session 的名稱",
          message: "照 [repo/sub-repo] 單號 描述 的慣例；沒寫 sub-repo 的話之後只會連到這張單。",
          defaultValue: defaultSessionTitleForTicket({
            key: ticket.key,
            summary: ticket.summary,
            repo: item?.prs[0] ? canonicalRepo(item.prs[0].repo) : null,
          }),
          confirmLabel: "建立並開啟",
        });
        if (title === null) return;

        const res = await fetch("/api/work/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, open: true }),
        });
        const out = await res.json();
        if (!res.ok) {
          setError(out.error ?? "建立 session 失敗");
          return;
        }
        setNotice(`已建立並開啟 session：${title}`);
        void loadIndex(true);
      } finally {
        setBusy(false);
      }
    },
    [ask, workIndex, loadIndex]
  );

  return { workIndex, itemOf, openSessionFor, busy, notice, error, setError, loadIndex };
}
