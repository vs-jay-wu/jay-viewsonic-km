"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icon";
import {
  DEFAULT_UI_SETTINGS, REVIEW_ENGINES, THEMES,
  type DiffThemePref, type Theme, type UiSettings,
} from "@/lib/uiSettingsRules";
import { resolveDiffTheme } from "@/lib/uiSettingsRules";
import { useResolvedTheme } from "@/components/useResolvedTheme";

const THEME_LABEL: Record<Theme, string> = { system: "跟隨系統", light: "淺色", dark: "深色" };

/**
 * 設定。
 *
 * 設定存在 server（`data/local-state/ui-settings.json`）而不是 localStorage：
 * 這個 app 的其他設定（PR 巡邏、VB Bug 抓取）都在 server，換瀏覽器或從手機開
 * 也要一致。
 */
export default function SettingsPage() {
  const [settings, setSettings] = useState<UiSettings>(DEFAULT_UI_SETTINGS);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  /** 預覽要顯示**實際**會用到的配色 —— `follow` 時得先把全域的三態解析出來 */
  const previewTheme = resolveDiffTheme(settings.diffTheme, useResolvedTheme(settings.theme));

  const load = useCallback(async () => {
    const res = await fetch("/api/settings", { cache: "no-store" });
    if (res.ok) setSettings((await res.json()) as UiSettings);
    setLoaded(true);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async (patch: Partial<UiSettings>) => {
    setBusy(true);
    setSettings((s) => ({ ...s, ...patch })); // 先動畫面，不要等往返
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) setSettings((await res.json()) as UiSettings);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-fg">
          <Icon name="cpu" size={22} className="text-fg-subtle" />
          設定
        </h1>
        <p className="mt-1.5 text-sm text-fg-muted">
          存在 server，所以換瀏覽器或從別的裝置開也一致。
        </p>

        <div className="mt-6 rounded-xl border border-line p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-fg">配色</div>
              <p className="mt-0.5 max-w-xl text-xs text-fg-muted">
                「跟隨系統」是純 CSS 判斷、明確指定的由 server 在輸出 HTML 時就決定，
                所以兩種都<b className="text-fg">不會先閃一下</b>。
              </p>
            </div>
            <div className="flex gap-1">
              {THEMES.map((t) => (
                <button
                  key={t}
                  onClick={() => save({ theme: t })}
                  disabled={busy || !loaded}
                  className={`rounded-lg border px-3 py-1.5 text-xs disabled:opacity-50 ${
                    settings.theme === t
                      ? "border-control bg-control text-on-solid"
                      : "border-line text-fg-muted hover:bg-surface-raised"
                  }`}
                >
                  {THEME_LABEL[t]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-line p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-fg">
                <code className="font-mono">/review-local</code> 用哪個引擎
              </div>
              <p className="mt-0.5 max-w-xl text-xs text-fg-muted">
                commit／push 之前的交叉驗證要交給誰跑。<b className="text-fg">兩邊的輸出格式一模一樣</b>
                （同一份 schema），所以舊的紀錄照樣讀得懂；差別只在 codex 沒有金額可回報。
                在終端機打 <code className="font-mono">/review-local</code> 也會讀這裡的設定。
              </p>
              <p className="mt-1.5 max-w-xl text-xs text-fg-muted">
                <b className="text-fg">PR 巡邏也吃這個設定</b>（2026-09-21 起）。兩邊拿到的是同一份指示：
                claude 走 <code className="font-mono">/handle-pr-inbox</code> slash command，codex 沒有這個機制，
                所以改成叫它先讀那份 <code className="font-mono">.md</code> 再照做。
                codex 那側沒有金額可回報，巡邏紀錄的花費會是空的。
              </p>
            </div>
            <div className="flex gap-1">
              {REVIEW_ENGINES.map((e) => (
                <button
                  key={e}
                  onClick={() => save({ reviewEngine: e })}
                  disabled={busy || !loaded}
                  className={`rounded-lg border px-3 py-1.5 font-mono text-xs disabled:opacity-50 ${
                    settings.reviewEngine === e
                      ? "border-control bg-control text-on-solid"
                      : "border-line text-fg-muted hover:bg-surface-raised"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-line p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-fg">看 diff 的配色</div>
              <p className="mt-0.5 max-w-xl text-xs text-fg-muted">
                程式碼區塊要用深色還是淺色。
                <b className="text-fg">「跟隨全域」</b>就是跟上面那格走；
                要維持「淺色頁面配深色 diff」就自己指定 —— 它是獨立設定，不會被覆蓋。
              </p>
            </div>
            <div className="flex gap-1">
              {(["follow", "dark", "light"] as DiffThemePref[]).map((t) => (
                <button
                  key={t}
                  onClick={() => save({ diffTheme: t })}
                  disabled={busy || !loaded}
                  className={`rounded-lg border px-3 py-1.5 text-xs disabled:opacity-50 ${
                    settings.diffTheme === t
                      ? "border-control bg-control text-on-solid"
                      : "border-line text-fg-muted hover:bg-surface-raised"
                  }`}
                >
                  {t === "follow" ? "跟隨全域" : t === "dark" ? "深色" : "淺色"}
                </button>
              ))}
            </div>
          </div>

          {/* 預覽：讓你不用切過去就看得出差別 */}
          <div
            className={`mt-4 overflow-hidden rounded-lg border ${
              previewTheme === "dark" ? "border-line bg-[#0d1117]" : "border-line bg-surface"
            }`}
          >
            <table className="w-full border-collapse font-mono text-[12px] leading-[1.55]">
              <tbody>
                {[
                  { no: [41, 41], sign: " ", text: "export function relativeWording(at: Date) {", kind: "context" },
                  { no: [42, null], sign: "−", text: "  return at.toISOString();", kind: "del" },
                  { no: [null, 42], sign: "+", text: '  return "昨天";', kind: "add" },
                  { no: [43, 43], sign: " ", text: "}", kind: "context" },
                ].map((l, i) => (
                  <tr
                    key={i}
                    className={
                      previewTheme === "dark"
                        ? l.kind === "add"
                          ? "bg-emerald-950/60"
                          : l.kind === "del"
                            ? "bg-red-950/60"
                            : ""
                        : l.kind === "add"
                          ? "bg-ok-bg"
                          : l.kind === "del"
                            ? "bg-danger-bg"
                            : ""
                    }
                  >
                    <td className={`w-10 px-2 text-right ${previewTheme === "dark" ? "text-fg-muted" : "text-fg-disabled"}`}>
                      {l.no[0] ?? ""}
                    </td>
                    <td className={`w-10 px-2 text-right ${previewTheme === "dark" ? "text-fg-muted" : "text-fg-disabled"}`}>
                      {l.no[1] ?? ""}
                    </td>
                    <td className={`w-4 text-center ${l.kind === "add" ? "text-ok" : l.kind === "del" ? "text-danger" : "text-fg-muted"}`}>
                      {l.sign}
                    </td>
                    <td className={`px-2 ${previewTheme === "dark" ? "text-fg-disabled" : "text-fg"}`}>
                      {l.text}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
