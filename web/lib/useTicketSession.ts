"use client";

import { useCallback, useEffect, useState } from "react";
import { usePrompt } from "@/components/Prompt";
import {
  canonicalRepo, defaultSessionTitleForPr, defaultSessionTitleForTicket,
  parsePrTicketKey, workKeyOf,
} from "@/lib/workItemRules";
import type { WorkIndex, WorkItem } from "@/lib/workIndexRules";

/** 開 session 時需要知道的 PR 欄位（各頁的 PR 型別都是它的超集） */
export interface PrLike {
  repo: string;
  number: number;
  title: string;
  headRefName?: string;
}

/**
 * 「這件事有沒有對應的 Claude session，沒有就開一個」。
 *
 * 單追蹤、VB Bug 總覽、我的 PR、首頁的「我開著的 PR」都要做同一件事，
 * 所以集中在這裡 —— 散成四份一定會漂移。
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

  /** 這張 PR 掛在哪個工作項目底下（有單就用單號，沒單就用 `PR:<repo>#<號>`） */
  const itemForPr = useCallback(
    (pr: PrLike): WorkItem | undefined => {
      const key = workKeyOf({
        ticketKey: parsePrTicketKey(pr),
        repo: canonicalRepo(pr.repo),
        prNumber: pr.number,
      });
      return key ? workIndex?.items.find((i) => i.key === key) : undefined;
    },
    [workIndex]
  );

  /** resume 既有的 session */
  const resume = useCallback(async (session: { id: string; title: string }) => {
    const res = await fetch(`/api/sessions/${session.id}/open`, { method: "POST" });
    const out = await res.json();
    setNotice(
      out.status === "opened" || out.status === "reused"
        ? `已在 Orca 開啟：${session.title}`
        : out.status === "external"
          ? `已經有人在別的地方 resume 這個 session（pid ${out.pid}）`
          : out.error ?? `Orca 回報：${out.status}`
    );
  }, []);

  /** 問過名稱再建一個新的並開起來 */
  const createAndOpen = useCallback(
    async (defaultValue: string, message: string) => {
      const title = await ask({
        title: "新 session 的名稱",
        message,
        defaultValue,
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
    },
    [ask, loadIndex]
  );

  const openSessionFor = useCallback(
    async (ticket: { key: string; summary: string }) => {
      setBusy(true);
      setNotice(null);
      setError(null);
      try {
        const item = workIndex?.items.find((i) => i.key === ticket.key);
        if (item?.sessions[0]) return await resume(item.sessions[0]);
        await createAndOpen(
          defaultSessionTitleForTicket({
            key: ticket.key,
            summary: ticket.summary,
            repo: item?.prs[0] ? canonicalRepo(item.prs[0].repo) : null,
          }),
          "照 [repo/sub-repo] 單號 描述 的慣例；沒寫 sub-repo 的話之後只會連到這張單。"
        );
      } finally {
        setBusy(false);
      }
    },
    [workIndex, resume, createAndOpen]
  );

  const openSessionForPr = useCallback(
    async (pr: PrLike) => {
      setBusy(true);
      setNotice(null);
      setError(null);
      try {
        const item = itemForPr(pr);
        if (item?.sessions[0]) return await resume(item.sessions[0]);
        await createAndOpen(
          defaultSessionTitleForPr(pr),
          "照 [repo/sub-repo] 單號 描述 的慣例，之後才連得回這張 PR 與單。"
        );
      } finally {
        setBusy(false);
      }
    },
    [itemForPr, resume, createAndOpen]
  );

  return {
    workIndex, itemOf, itemForPr, openSessionFor, openSessionForPr,
    busy, notice, error, setError, loadIndex,
  };
}
