"use client";

import { useCallback, useEffect, useState } from "react";
import Icon, { type IconName } from "@/components/Icon";
import Tooltip from "@/components/Tooltip";
import {
  DEFAULT_UI_SETTINGS, REVIEW_ENGINES, THEMES,
  type DiffThemePref, type Theme, type UiSettings,
} from "@/lib/uiSettingsRules";
import { resolveDiffTheme } from "@/lib/uiSettingsRules";
import { useResolvedTheme } from "@/components/useResolvedTheme";
import DiffView from "@/components/DiffView";
import type { DiffLine } from "@/lib/changesRules";

const THEME_LABEL: Record<Theme, string> = { system: "跟隨系統", light: "淺色", dark: "深色" };
const THEME_ICON: Record<Theme, IconName> = { system: "monitor", light: "sun", dark: "moon" };
const DIFF_LABEL: Record<DiffThemePref, string> = {
  follow: "跟隨全域", light: "淺色", dark: "深色",
};
const DIFF_ICON: Record<DiffThemePref, IconName> = {
  follow: "link", light: "sun", dark: "moon",
};

/** 配色預覽的內容。挑有增有刪的四行就夠看出差別 */
const PREVIEW_LINES: DiffLine[] = [
  { kind: "context", text: "export function relativeWording(at: Date) {", oldNo: 41, newNo: 41 },
  { kind: "del", text: "  return at.toISOString();", oldNo: 42, newNo: null },
  { kind: "add", text: '  return "昨天";', oldNo: null, newNo: 42 },
  { kind: "context", text: "}", oldNo: 43, newNo: 43 },
];

/**
 * 設定。
 *
 * 設定存在 server（`data/machine/ui-settings.json`）而不是 localStorage：
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
    /*
     * `<html data-theme>` 是 server 在 SSR 時從設定檔出的（那是「不會閃」的來源），
     * 所以**存檔本身不會讓當下這一頁變色** —— 要等下一次導覽或重整。改設定卻沒反應
     * 看起來就像壞了（Jay 2026-09-22 回報），所以這裡當場也改一次 DOM。
     * 兩邊寫的是同一個值，重整之後仍由 server 那份作準。
     */
    if (patch.theme) document.documentElement.dataset.theme = patch.theme;
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
          <Icon name="settings" size={22} className="text-fg-subtle" />
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
                <Tooltip key={t} label={THEME_LABEL[t]}>
                  <button
                    onClick={() => save({ theme: t })}
                    disabled={busy || !loaded}
                    aria-label={THEME_LABEL[t]}
                    aria-pressed={settings.theme === t}
                    className={`rounded-lg border p-2 disabled:opacity-50 ${
                      settings.theme === t
                        ? "border-control bg-control text-on-solid"
                        : "border-line text-fg-muted hover:bg-surface-raised"
                    }`}
                  >
                    <Icon name={THEME_ICON[t]} size={16} />
                  </button>
                </Tooltip>
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
                <Tooltip key={t} label={DIFF_LABEL[t]}>
                  <button
                    onClick={() => save({ diffTheme: t })}
                    disabled={busy || !loaded}
                    aria-label={DIFF_LABEL[t]}
                    aria-pressed={settings.diffTheme === t}
                    className={`rounded-lg border p-2 disabled:opacity-50 ${
                      settings.diffTheme === t
                        ? "border-control bg-control text-on-solid"
                        : "border-line text-fg-muted hover:bg-surface-raised"
                    }`}
                  >
                    <Icon name={DIFF_ICON[t]} size={16} />
                  </button>
                </Tooltip>
              ))}
            </div>
          </div>

          {/*
            預覽直接用真正的 `DiffView`，不要自己再畫一份 —— 這裡原本是抄過來的
            表格，DiffView 換了配色它不會跟著換，於是「淺色」會預覽出深色的
            加／刪底色（Jay 2026-09-22 抓到）。抄一份就一定會漂移。
          */}
          <div className="mt-4 overflow-hidden rounded-lg border border-line">
            <DiffView lines={PREVIEW_LINES} file="preview.ts" theme={previewTheme} />
          </div>
        </div>
      </div>
    </div>
  );
}
