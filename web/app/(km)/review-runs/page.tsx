"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import Tooltip from "@/components/Tooltip";
import {
  SEVERITY_CLS, SEVERITY_ORDER, VERDICT_STYLE, countBySeverity, latestPerBranch,
  matchesReviewQuery, type ReviewRun,
} from "@/lib/reviewRunsRules";

/**
 * `/review-local` 的交叉驗證紀錄。
 *
 * 紀錄由腳本寫進 `data/review-local-runs/`，**只有結論**（verdict／summary／findings），
 * 沒有 diff 也沒有 prompt —— diff 可能含機敏內容，而且大得沒道理留著。
 *
 * 預設只顯示「每條分支的最後一次」：回頭看時想問的是「這條線上次驗出什麼」，
 * 不是兩小時前那次（Jay 2026-09-18）。
 */

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "剛剛";
  if (m < 60) return `${m} 分鐘前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小時前`;
  const d = Math.floor(h / 24);
  return d === 1 ? "昨天" : d < 30 ? `${d} 天前` : iso.slice(0, 10);
}

export default function ReviewRunsPage() {
  const [runs, setRuns] = useState<ReviewRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [latestOnly, setLatestOnly] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/review-runs", { cache: "no-store" });
      const json = (await res.json()) as { runs: ReviewRun[] };
      setRuns(json.runs ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => {
    const base = latestOnly ? latestPerBranch(runs) : runs;
    return base.filter((r) => matchesReviewQuery(r, query));
  }, [runs, query, latestOnly]);

  const byEngine = useMemo(() => {
    const c = { codex: 0, claude: 0 } as Record<string, number>;
    for (const r of runs) c[r.engine] = (c[r.engine] ?? 0) + 1;
    return c;
  }, [runs]);
  const totalCost = runs.reduce((n, r) => n + (r.costUsd ?? 0), 0);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-fg">
          <Icon name="check" size={22} className="text-fg-subtle" />
          交叉驗證紀錄
        </h1>
        <p className="mt-1.5 text-sm text-fg-muted">
          <code className="rounded bg-surface-sunken px-1 py-0.5 text-xs">/review-local</code>{" "}
          每次跑完留下的結論（verdict、findings、是誰跑的）。
          只存結論，不存 diff。引擎在
          <a href="/settings" className="mx-1 underline">設定頁</a>
          切換。
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[16rem] flex-1">
            <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜尋 repository、分支、摘要、finding 標題…"
              className="w-full rounded-lg border border-line-strong py-2 pl-9 pr-3 text-sm outline-none focus:border-line-strong"
            />
          </div>
          <Tooltip label="同一個 repository＋分支只看最後一次跑的結果">
            <label className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
              <input
                type="checkbox"
                checked={latestOnly}
                onChange={(e) => setLatestOnly(e.target.checked)}
              />
              只看每條分支的最新一次
            </label>
          </Tooltip>
          <button
            onClick={() => void load()}
            className="rounded-lg border border-line-strong px-3 py-2 text-xs text-fg hover:bg-surface-raised"
          >
            重新整理
          </button>
        </div>

        <div className="mt-2 h-4 text-xs text-fg-subtle">
          {loading
            ? "讀取中…"
            : `${shown.length} / ${runs.length} 次 · codex ${byEngine.codex ?? 0}、claude ${byEngine.claude ?? 0}` +
              (totalCost > 0 ? ` · claude 累計 $${totalCost.toFixed(2)}` : "")}
        </div>

        {!loading && runs.length === 0 && (
          <p className="mt-4 rounded-xl border border-line px-4 py-8 text-center text-sm text-fg-subtle">
            還沒有紀錄。在終端機跑一次{" "}
            <code className="rounded bg-surface-sunken px-1 py-0.5 text-xs">/review-local</code> 就會出現。
          </p>
        )}

        <ul className="mt-4 space-y-2">
          {shown.map((r) => {
            const v = VERDICT_STYLE[r.verdict] ?? {
              label: r.verdict,
              cls: "border-line bg-surface-raised text-fg-muted",
            };
            const counts = countBySeverity(r.findings ?? []);
            const isOpen = open === r.id;
            return (
              <li key={r.id} className="rounded-xl border border-line">
                <button
                  onClick={() => setOpen(isOpen ? null : r.id)}
                  className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left"
                >
                  <Icon
                    name={isOpen ? "chevronDown" : "chevronRight"}
                    size={13}
                    className="shrink-0 text-fg-subtle"
                  />
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] leading-none ${v.cls}`}>
                    {v.label}
                  </span>
                  <span className="font-mono text-xs text-fg">{r.repo}</span>
                  <span className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">
                    {r.branch}
                  </span>
                  <span className="font-mono text-[11px] text-fg-subtle">{r.scope}</span>

                  {SEVERITY_ORDER.filter((s) => counts[s] > 0).map((s) => (
                    <span key={s} className={`font-mono text-[11px] ${SEVERITY_CLS[s]}`}>
                      {s}
                      {counts[s]}
                    </span>
                  ))}

                  <span className="ml-auto flex shrink-0 items-center gap-2 text-[11px] text-fg-subtle">
                    <Tooltip label={r.engine === "codex" ? "codex 沒有金額可回報" : `花費 $${(r.costUsd ?? 0).toFixed(2)}`}>
                      <span className="rounded-full border border-line px-1.5 py-0.5 font-mono">
                        {r.engine}
                        {r.costUsd != null && ` $${r.costUsd.toFixed(2)}`}
                      </span>
                    </Tooltip>
                    {relTime(r.finishedAt)}
                  </span>
                </button>

                {isOpen && (
                  <div className="border-t border-line px-4 py-3">
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-fg">
                      {r.summary}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-fg-subtle">
                      <span>{r.head}</span>
                      <span>base {r.base}</span>
                      {r.model && <span>model {r.model}</span>}
                      {r.onDefaultBranch && <span className="text-warn">在預設分支上</span>}
                      {r.diffTruncated && <span className="text-warn">diff 被截斷</span>}
                      {r.sensitiveFilesTouched.length > 0 && (
                        <span className="text-warn">
                          動到機敏檔 {r.sensitiveFilesTouched.length} 個（內容沒進 diff）
                        </span>
                      )}
                    </div>

                    {(r.blockers ?? []).map((b) => (
                      <p key={b} className="mt-2 rounded-lg border border-danger/40 bg-danger-bg px-2.5 py-1.5 text-[11px] text-danger">
                        ⛔ {b}
                      </p>
                    ))}

                    <ul className="mt-2 space-y-2">
                      {(r.findings ?? []).map((f, i) => (
                        <li key={i} className="rounded-lg bg-surface-raised px-3 py-2">
                          <div className="flex flex-wrap items-baseline gap-2 text-xs">
                            <span className={`font-mono font-semibold ${SEVERITY_CLS[f.severity]}`}>
                              {f.severity}
                            </span>
                            {f.confidence && (
                              <span className="font-mono text-[10px] text-fg-subtle">{f.confidence}</span>
                            )}
                            <span className="font-medium text-fg">{f.title}</span>
                            {f.file && (
                              <span className="font-mono text-[11px] text-fg-muted">
                                {f.file}
                                {f.line ? `:${f.line}` : ""}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-fg-muted">
                            {f.detail}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-fg-subtle">
                            證據：{f.evidence}
                          </p>
                          {f.suggestion && (
                            <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-accent">
                              建議：{f.suggestion}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>

                    {(r.claims_without_tests ?? []).map((c) => (
                      <p key={c} className="mt-2 text-[11px] text-fg-muted">🧪 宣稱但沒有測試釘住：{c}</p>
                    ))}
                    {(r.unresolved_questions ?? []).map((q) => (
                      <p key={q} className="mt-1 text-[11px] text-fg-muted">❓ {q}</p>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
