"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { useConfirm } from "@/components/Confirm";
import { formatCode } from "@/lib/deviceRules";

interface Pending {
  machineId: string;
  machineName: string;
  hostname: string;
  code: string;
  requestedAt: string;
}
interface Approved {
  id: string;
  name: string;
  approvedAt: string;
  lastSeenAt: string | null;
}

/**
 * 已核可的機器，與等著你按核可的。
 *
 * 這是多機器架構裡**唯一需要人介入**的一步（Jay 2026-09-30：不要會員系統，
 * 主機器按 approve 就好）。畫面上要看得到機器名、hostname 與配對碼 ——
 * 你是拿它們跟**另一台機器畫面上顯示的**對照，確認核可的是自己那台。
 *
 * ⚠️ 這裡**不顯示 token 也不顯示 claim**。那兩個是鑰匙，顯示出來就等於公開。
 */
export default function DeviceSettings() {
  const [pending, setPending] = useState<Pending[]>([]);
  const [devices, setDevices] = useState<Approved[]>([]);
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    const res = await fetch("/api/devices", { cache: "no-store" });
    if (!res.ok) return;
    const d = (await res.json()) as { pending: Pending[]; devices: Approved[] };
    setPending(d.pending);
    setDevices(d.devices);
  }, []);

  useEffect(() => {
    void load();
    // 另一台按下配對之後，這一頁要自己冒出來 —— 不然你得一直重整
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (action: string, machineId: string) => {
    setBusy(true);
    try {
      await fetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, machineId }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-10">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">
        <Icon name="repos" size={18} className="text-fg-subtle" />
        已核可的機器
      </h2>
      <p className="mt-1 text-sm text-fg-muted">
        另一台機器的 km 連進來時會出現在這裡。核可之後它才拿得到 token ——
        在那之前，除了本機以外的來源一律被擋掉。
      </p>

      {pending.length > 0 && (
        <div className="mt-4 rounded-lg border border-warn bg-warn-bg p-4">
          <p className="flex items-center gap-1.5 text-sm font-medium text-warn">
            <Icon name="alert" size={14} />
            {pending.length} 台在等核可
          </p>
          <p className="mt-1 text-xs text-fg-muted">
            核可之前，先確認下面的配對碼跟<strong className="font-medium text-fg">那台機器畫面上顯示的</strong>一樣。
          </p>
          <ul className="mt-3 space-y-2">
            {pending.map((p) => (
              <li key={p.machineId} className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface px-3 py-2">
                <span className="font-mono text-lg font-semibold tracking-wider text-fg">
                  {formatCode(p.code)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-fg">{p.machineName}</span>
                  <span className="block truncate font-mono text-[11px] text-fg-subtle">{p.hostname}</span>
                </span>
                <button
                  disabled={busy}
                  onClick={() => void act("approve", p.machineId)}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs text-fg hover:bg-surface-raised disabled:opacity-50"
                >
                  核可
                </button>
                <button
                  disabled={busy}
                  onClick={() => void act("reject", p.machineId)}
                  className="rounded-lg px-3 py-1.5 text-xs text-fg-muted hover:text-fg disabled:opacity-50"
                >
                  拒絕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="mt-4 divide-y divide-line overflow-hidden rounded-lg border border-line">
        {devices.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-fg-subtle">還沒有核可過任何機器。</li>
        )}
        {devices.map((d) => (
          <li key={d.id} className="flex items-center gap-3 px-4 py-3">
            <Icon name="repos" size={14} className="shrink-0 text-fg-subtle" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-fg">{d.name}</span>
              <span className="block truncate font-mono text-[11px] text-fg-subtle">
                {new Date(d.approvedAt).toLocaleString("zh-TW")} 核可
                {d.lastSeenAt ? ` · 最後連線 ${new Date(d.lastSeenAt).toLocaleString("zh-TW")}` : ""}
              </span>
            </span>
            <button
              disabled={busy}
              onClick={async () => {
                if (await confirm({ title: `撤銷「${d.name}」？`, message: "它馬上就連不上這台 km，要重新配對。", danger: true })) {
                  void act("revoke", d.id);
                }
              }}
              className="rounded-lg px-3 py-1.5 text-xs text-fg-muted hover:text-warn disabled:opacity-50"
            >
              撤銷
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
