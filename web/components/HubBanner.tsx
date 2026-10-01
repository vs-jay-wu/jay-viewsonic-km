"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";

interface Status {
  role: string | null;
  machineName?: string;
  hubUrl?: string | null;
  lastOkAt?: string | null;
  lastFailAt?: string | null;
  lastError?: string | null;
  ok?: boolean;
}

/**
 * satellite 連不上 hub 時的提示列。
 *
 * 三條規則（`docs/ideas/km-multi-machine.md` §10）：
 *
 * 1. **灰底提示，不是紅色錯誤** —— hub 是一台筆電，不在是可預期的狀態，不是故障。
 * 2. **一定要有時間戳。** 沒有時間戳的舊資料**比沒有資料危險**：你會照著昨天的
 *    PR 狀態做決定而不自知。
 * 3. hub 自己什麼都不畫（`role !== "satellite"` 就 render null）。
 */
export default function HubBanner() {
  const [s, setS] = useState<Status | null>(null);

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/hub-status", { cache: "no-store" }).catch(() => null);
      if (res?.ok) setS((await res.json()) as Status);
    };
    void load();
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, []);

  if (!s || s.role !== "satellite" || s.ok) return null;

  const when = s.lastOkAt
    ? new Date(s.lastOkAt).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line bg-surface-raised px-4 py-1.5 text-xs text-fg-muted">
      <Icon name="alert" size={13} className="shrink-0 text-warn" />
      <span className="text-fg">連不上 hub</span>
      <span>
        {when
          ? `顯示的是 ${when} 的快取`
          : "而且沒有任何快取 —— 這一台還沒成功連上過"}
      </span>
      {s.hubUrl && <span className="font-mono text-fg-subtle">{s.hubUrl}</span>}
      <span className="text-fg-subtle">本機的改動、程式碼、session 不受影響</span>
    </div>
  );
}
