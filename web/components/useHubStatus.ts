"use client";

import { useEffect, useState } from "react";

export interface HubView {
  role: string | null;
  machineName: string | null;
  hubUrl: string | null;
  ok: boolean;
  lastOkAt: string | null;
  /** 現在不該讓使用者按「會寫到 hub」的東西 */
  blocked: boolean;
  /** 為什麼不能按。沒被擋就是空字串 */
  reason: string;
}

const EMPTY: HubView = {
  role: null, machineName: null, hubUrl: null, ok: true, lastOkAt: null,
  blocked: false, reason: "",
};

/**
 * 這台的角色，以及「現在能不能做會寫到 hub 的事」。
 *
 * pin、便條這些歸 hub（在 A pin 的要在 B 看得到），所以 satellite 連不上 hub 時
 * 它們**做不到**。畫面要**禁用並說明原因**，不是隱藏 ——
 * 隱藏會讓人以為功能不見了（`docs/ideas/km-multi-machine.md` §10）。
 *
 * 狀態掛在 `globalThis` 共用：一頁可能有幾十顆 pin，各自輪詢會變成幾十個請求。
 */
const g = globalThis as unknown as {
  __kmHubView?: { at: number; data: HubView; subs: Set<(v: HubView) => void> };
};

const POLL_MS = 15_000;

function store() {
  g.__kmHubView ??= { at: 0, data: EMPTY, subs: new Set() };
  return g.__kmHubView;
}

async function refresh(): Promise<void> {
  const s = store();
  const res = await fetch("/api/hub-status", { cache: "no-store" }).catch(() => null);
  if (!res?.ok) return;
  const d = (await res.json()) as Partial<HubView> & { role: string | null };
  const blocked = d.role === "satellite" && !d.ok;
  s.data = {
    ...EMPTY, ...d,
    blocked,
    reason: blocked ? `連不上 hub（${d.hubUrl ?? "未設定"}），這個動作要寫到 hub 才算數` : "",
  };
  s.at = Date.now();
  for (const fn of s.subs) fn(s.data);
}

export function useHubStatus(): HubView {
  const [v, setV] = useState<HubView>(() => store().data);

  useEffect(() => {
    const s = store();
    s.subs.add(setV);
    if (Date.now() - s.at > POLL_MS) void refresh();
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => {
      s.subs.delete(setV);
      clearInterval(t);
    };
  }, []);

  return v;
}
