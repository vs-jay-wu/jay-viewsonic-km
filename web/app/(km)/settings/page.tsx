"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { DEFAULT_UI_SETTINGS, type DiffTheme, type UiSettings } from "@/lib/uiSettingsRules";

/**
 * 設定。目前只有一項（Jay 2026-09-14：先維持一項就好）。
 *
 * 設定存在 server（`data/local-state/ui-settings.json`）而不是 localStorage：
 * 這個 app 的其他設定（PR 巡邏、VB Bug 抓取）都在 server，換瀏覽器或從手機開
 * 也要一致。
 */
export default function SettingsPage() {
  const [settings, setSettings] = useState<UiSettings>(DEFAULT_UI_SETTINGS);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/settings", { cache: "no-store" });
    if (res.ok) setSettings((await res.json()) as UiSettings);
    setLoaded(true);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async (diffTheme: DiffTheme) => {
    setBusy(true);
    setSettings((s) => ({ ...s, diffTheme })); // 先動畫面，不要等往返
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diffTheme }),
      });
      if (res.ok) setSettings((await res.json()) as UiSettings);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-gray-900">
          <Icon name="cpu" size={22} className="text-gray-400" />
          設定
        </h1>
        <p className="mt-1.5 text-sm text-gray-500">
          存在 server，所以換瀏覽器或從別的裝置開也一致。
        </p>

        <div className="mt-6 rounded-xl border border-gray-200 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-gray-900">看 diff 的配色</div>
              <p className="mt-0.5 text-xs text-gray-500">
                「未提交的改動」頁的程式碼區塊要用深色還是淺色。
              </p>
            </div>
            <div className="flex gap-1">
              {(["dark", "light"] as DiffTheme[]).map((t) => (
                <button
                  key={t}
                  onClick={() => save(t)}
                  disabled={busy || !loaded}
                  className={`rounded-lg border px-3 py-1.5 text-xs disabled:opacity-50 ${
                    settings.diffTheme === t
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {t === "dark" ? "深色" : "淺色"}
                </button>
              ))}
            </div>
          </div>

          {/* 預覽：讓你不用切過去就看得出差別 */}
          <div
            className={`mt-4 overflow-hidden rounded-lg border ${
              settings.diffTheme === "dark" ? "border-gray-800 bg-[#0d1117]" : "border-gray-200 bg-white"
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
                      settings.diffTheme === "dark"
                        ? l.kind === "add"
                          ? "bg-emerald-950/60"
                          : l.kind === "del"
                            ? "bg-red-950/60"
                            : ""
                        : l.kind === "add"
                          ? "bg-emerald-50"
                          : l.kind === "del"
                            ? "bg-red-50"
                            : ""
                    }
                  >
                    <td className={`w-10 px-2 text-right ${settings.diffTheme === "dark" ? "text-gray-600" : "text-gray-300"}`}>
                      {l.no[0] ?? ""}
                    </td>
                    <td className={`w-10 px-2 text-right ${settings.diffTheme === "dark" ? "text-gray-600" : "text-gray-300"}`}>
                      {l.no[1] ?? ""}
                    </td>
                    <td className={`w-4 text-center ${l.kind === "add" ? "text-emerald-500" : l.kind === "del" ? "text-red-400" : "text-gray-500"}`}>
                      {l.sign}
                    </td>
                    <td className={`px-2 ${settings.diffTheme === "dark" ? "text-gray-200" : "text-gray-800"}`}>
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
