"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icon";
import Tooltip from "@/components/Tooltip";
import { useConfirm } from "@/components/Confirm";
import { refreshHubStatus } from "@/components/useHubStatus";

interface Machine {
  id: string;
  label: string;
  selfName: string;
  renamed: boolean;
  lastSeenAt: string;
  online: boolean;
  reversePort: number | null;
  sessionCount: number;
}

function ago(iso: string): string {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "剛剛";
  if (m < 60) return `${m} 分鐘前`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} 小時前` : new Date(iso).toLocaleString("zh-TW");
}

/**
 * 這個工作區有哪些機器。
 *
 * 名字**跨機器共用**（Jay 2026-10-01）：改一次每一台都跟著變，因為真相是 hub
 * 那份註冊表，不是各自的 `local.workspace.json`。心跳也不會把它蓋回去
 * （`machineRules.ts` 的 `displayName` / `selfLabel`）。
 *
 * 旁邊保留它**自己報的名字**：改過名之後要連過去（ssh、看 log）時需要原本那個 ——
 * 那通常是公司資產編號那種，看不出是哪一台，但 ssh 要用它。
 */
export default function MachineSettings() {
  const [self, setSelf] = useState<{ name: string; role: string } | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    const res = await fetch("/api/machines", { cache: "no-store" });
    if (!res.ok) return;
    const d = (await res.json()) as { self: { name: string; role: string } | null; machines: Machine[] };
    setSelf(d.self);
    setMachines(d.machines);
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await fetch("/api/machines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await load();
      // 改的可能是**自己**的名字，而側邊欄走的是 useHubStatus 的輪詢 ——
      // 不踢一下的話要等最久 15 秒才跟上，看起來像沒生效
      await refreshHubStatus();
    } finally {
      setBusy(false);
      setEditing(null);
    }
  };

  // 單機（沒設角色）時整段不顯示 —— 只有一台時講「有哪些機器」是純噪音
  if (!self) return null;

  return (
    <div className="mt-10">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">
        <Icon name="repos" size={18} className="text-fg-subtle" />
        機器
      </h2>
      <p className="mt-1 text-sm text-fg-muted">
        這一台是 <span className="font-medium text-fg">{self.name}</span>（{self.role}）。
        其他機器每分鐘回報一次，所以清單最舊是一分鐘前的。改名是**共用的**，每一台都會跟著變。
      </p>

      <ul className="mt-4 divide-y divide-line overflow-hidden rounded-lg border border-line">
        {machines.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-fg-subtle">
            還沒有其他機器回報過。satellite 跑起來之後會自己出現。
          </li>
        )}
        {machines.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${m.online ? "bg-ok" : "bg-fg-subtle"}`}
              title={m.online ? "有在回報" : "超過 3 分鐘沒消息"}
            />
            {editing === m.id ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void act({ action: "rename", machineId: m.id, displayName: draft });
                  if (e.key === "Escape") setEditing(null);
                }}
                placeholder={m.selfName}
                className="min-w-0 flex-1 rounded border border-line bg-surface px-2 py-1 text-sm text-fg"
              />
            ) : (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-fg">{m.label}</span>
                <span className="block truncate font-mono text-[11px] text-fg-subtle">
                  {m.renamed && `${m.selfName} · `}
                  {m.sessionCount} 個 session · {ago(m.lastSeenAt)}
                  {m.reversePort ? ` · 反向 ${m.reversePort}` : " · 沒開反向轉發"}
                </span>
              </span>
            )}

            {editing === m.id ? (
              <button
                disabled={busy}
                onClick={() => void act({ action: "rename", machineId: m.id, displayName: draft })}
                className="rounded-lg border border-line px-3 py-1.5 text-xs text-fg hover:bg-surface-raised disabled:opacity-50"
              >
                存檔
              </button>
            ) : (
              <Tooltip label="改這台在這裡顯示的名字（那台自己的設定不會被動到）">
                <button
                  disabled={busy}
                  onClick={() => { setEditing(m.id); setDraft(m.renamed ? m.label : ""); }}
                  className="rounded-lg px-3 py-1.5 text-xs text-fg-muted hover:text-fg disabled:opacity-50"
                >
                  改名
                </button>
              </Tooltip>
            )}
            <Tooltip label="從清單移除。那台還活著的話，下一次心跳就會自己回來">
              <button
                disabled={busy}
                onClick={async () => {
                  if (await confirm({
                    title: `移除「${m.label}」？`,
                    message: "它推上來的 session 會從清單消失。那台還在跑的話，一分鐘內會自己回來。",
                  })) void act({ action: "forget", machineId: m.id });
                }}
                className="rounded-lg px-3 py-1.5 text-xs text-fg-muted hover:text-warn disabled:opacity-50"
              >
                移除
              </button>
            </Tooltip>
          </li>
        ))}
      </ul>
    </div>
  );
}
