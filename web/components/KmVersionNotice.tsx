"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { useConfirm } from "@/components/Confirm";
import type { UpdatePlan } from "@/lib/kmVersionRules";

interface Info {
  plan: UpdatePlan;
  message: string | null;
  state: { behind: number; ahead: number; dirty: boolean; checkedAt: string };
}

/**
 * 「這台的 km 落後了」的提示，放在首頁的警告區。
 *
 * 比較基準是**自己與 `origin/master`**，不是兩台互比 —— hub 自己也會落後，
 * 互比的話兩台都落後時會說「一致」（`lib/kmVersionRules.ts`）。
 *
 * ⚠️ 按下「更新並重啟」之後 server 會重啟，所以**這一頁會短暫連不上**。
 * 不先講的話看起來像當掉了。
 */
export default function KmVersionNotice() {
  const [info, setInfo] = useState<Info | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[] | null>(null);
  const confirm = useConfirm();

  const load = useCallback(async (fresh = false) => {
    const res = await fetch(`/api/km-version${fresh ? "?fresh=1" : ""}`, { cache: "no-store" }).catch(() => null);
    if (res?.ok) setInfo((await res.json()) as Info);
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5 * 60_000);
    return () => clearInterval(t);
  }, [load]);

  if (!info || !info.message) return null;
  const kind = info.plan.kind;

  const update = async () => {
    if (
      !(await confirm({
        title: "更新並重啟 km？",
        message:
          "會跑 git pull --ff-only，相依有變才 npm ci，最後重啟 server。\n" +
          "重啟期間這一頁會短暫連不上，過幾秒重整就好。",
        confirmLabel: "更新並重啟",
      }))
    ) return;
    setBusy(true);
    const res = await fetch("/api/km-version", { method: "POST" }).catch(() => null);
    const out = (await res?.json().catch(() => null)) as { ok: boolean; log: string[] } | null;
    setBusy(false);
    setLog(out?.log ?? ["送不出去 —— server 可能已經在重啟了"]);
  };

  return (
    <div
      className={`rounded-xl border p-4 ${
        kind === "blocked" || kind === "unknown" ? "border-warn bg-warn-bg" : "border-line bg-surface-raised"
      }`}
    >
      <p className="flex items-center gap-1.5 text-sm text-fg">
        <Icon name="alert" size={14} className={kind === "offer" ? "text-fg-subtle" : "text-warn"} />
        {info.message}
      </p>
      {kind === "offer" && (
        <div className="mt-3 flex items-center gap-3">
          <button
            disabled={busy}
            onClick={() => void update()}
            className="rounded-lg border border-line px-3 py-1.5 text-xs text-fg hover:bg-surface-raised disabled:opacity-50"
          >
            {busy ? "更新中…" : "更新並重啟"}
          </button>
          <button
            onClick={() => void load(true)}
            className="text-xs text-fg-muted hover:text-fg"
          >
            重新檢查
          </button>
          {info.state.dirty && (
            <span className="text-[11px] text-fg-subtle">
              工作區有未提交的東西，`--ff-only` 碰到衝突會失敗並照原樣告訴你
            </span>
          )}
        </div>
      )}
      {log && (
        <ul className="mt-3 space-y-0.5 font-mono text-[11px] text-fg-muted">
          {log.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
