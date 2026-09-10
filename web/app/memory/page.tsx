"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icon";

interface MemStats {
  totalMB: number; usedMB: number; appMB: number; wiredMB: number;
  compressedMB: number; cachedMB: number; freeMB: number; usedPercent: number;
}
interface Proc {
  pid: number; kind: string; reason: string; footprintMB: number;
  age: string; ageSeconds: number; command: string;
}
interface Killed {
  pid: number; kind: string; footprintMB: number; outcome: string; message: string;
}
interface MemPayload {
  generatedAt: string;
  options: { force: boolean; ageMinutes: number; includeGradle: boolean; includeLanguageServer: boolean };
  memory: MemStats;
  swap: { usedMB: number; totalMB: number };
  processes: Proc[];
  reclaimableMB: number;
  killed?: Killed[];
  swapAfter?: { usedMB: number; totalMB: number };
  memoryAfter?: MemStats;
}
interface ScriptFile { path: string; language: string; note: string; content: string }

function gb(mb: number): string {
  return `${(mb / 1024).toFixed(1)} GB`;
}

function barColor(pct: number): string {
  if (pct < 60) return "bg-emerald-500";
  if (pct < 85) return "bg-amber-500";
  return "bg-red-500";
}

function Segments({ stats }: { stats: MemStats }) {
  const segs = [
    { label: "App", mb: stats.appMB, color: "bg-sky-500" },
    { label: "Wired", mb: stats.wiredMB, color: "bg-indigo-500" },
    { label: "壓縮", mb: stats.compressedMB, color: "bg-violet-500" },
    { label: "快取檔案", mb: stats.cachedMB, color: "bg-gray-300" },
    { label: "可用", mb: stats.freeMB, color: "bg-gray-100" },
  ];
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
        {segs.map((s) => (
          <div
            key={s.label}
            className={s.color}
            style={{ width: `${(s.mb / stats.totalMB) * 100}%` }}
            title={`${s.label} ${gb(s.mb)}`}
          />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        {segs.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${s.color}`} />
            {s.label} {gb(s.mb)}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function MemoryPage() {
  const [data, setData] = useState<MemPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MemPayload | null>(null);

  const [age, setAge] = useState(120);
  const [gradle, setGradle] = useState(false);
  const [langServer, setLangServer] = useState(false);

  const [scripts, setScripts] = useState<ScriptFile[] | null>(null);
  const [showScripts, setShowScripts] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({
      age: String(age),
      gradle: gradle ? "1" : "0",
      languageServer: langServer ? "1" : "0",
    });
    const res = await fetch(`/api/memory?${qs}`);
    const json = await res.json();
    if (!res.ok) setError(json.error ?? "讀取失敗");
    else setData(json);
    setLoading(false);
  }, [age, gradle, langServer]);

  useEffect(() => { load(); }, [load]);

  const clean = async () => {
    if (!confirm(`確定要殺掉這 ${data?.processes.length ?? 0} 個行程嗎？`)) return;
    setCleaning(true);
    setError(null);
    const res = await fetch("/api/memory/clean", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ age, gradle, languageServer: langServer }),
    });
    const json = await res.json();
    if (!res.ok) setError(json.error ?? "清理失敗");
    else {
      setResult(json);
      setData({ ...json, processes: [], reclaimableMB: 0 });
    }
    setCleaning(false);
    load();
  };

  const openScripts = async () => {
    setShowScripts(true);
    if (!scripts) {
      const res = await fetch("/api/memory/script");
      const json = await res.json();
      setScripts(json.files);
    }
  };

  const mem = data?.memory;
  const swapPct = data ? (data.swap.usedMB / data.swap.totalMB) * 100 : 0;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">記憶體狀況</h1>
            <p className="mt-1.5 text-sm text-gray-500">
              數字來自 <code className="text-xs">vm_stat</code> / <code className="text-xs">top</code>；
              清理走的是同一支 <code className="text-xs">shell/memclean.py</code>，與終端機的
              <code className="text-xs"> memclean</code> 完全同源。
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={openScripts}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Icon name="code" size={15} /> 檢視腳本
            </button>
            <button
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Icon name="refresh" size={15} className={loading ? "animate-spin" : ""} /> 重新掃描
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-6 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <Icon name="alert" size={16} className="mt-0.5" />
            <span className="whitespace-pre-wrap">{error}</span>
          </div>
        )}

        {/* 記憶體與 swap */}
        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-gray-200 p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-gray-900">實體記憶體</h2>
              <span className="text-xs text-gray-400">
                {mem ? `${gb(mem.usedMB)} / ${gb(mem.totalMB)}（${mem.usedPercent}%）` : "—"}
              </span>
            </div>
            <div className="mt-4">{mem ? <Segments stats={mem} /> : <div className="h-3 rounded-full bg-gray-100" />}</div>
          </div>

          <div className="rounded-xl border border-gray-200 p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Swap</h2>
              <span className="text-xs text-gray-400">
                {data ? `${gb(data.swap.usedMB)} / ${gb(data.swap.totalMB)}` : "—"}
              </span>
            </div>
            <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-gray-100">
              <div className={`h-full ${barColor(swapPct)}`} style={{ width: `${Math.min(swapPct, 100)}%` }} />
            </div>
            <p className="mt-2.5 text-xs text-gray-400">
              swap 吃很深代表實體記憶體長期不夠；清完不會立刻降，macOS 要一段時間才收回 swapfile。
            </p>
          </div>
        </div>

        {/* 掃描條件 */}
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-gray-200 px-5 py-4 text-sm">
          <label className="inline-flex items-center gap-2 text-gray-700">
            年齡門檻
            <input
              type="number"
              min={0}
              value={age}
              onChange={(e) => setAge(Number(e.target.value))}
              className="w-20 rounded-md border border-gray-200 px-2 py-1 text-sm"
            />
            分鐘
          </label>
          <label className="inline-flex items-center gap-2 text-gray-700">
            <input type="checkbox" checked={gradle} onChange={(e) => setGradle(e.target.checked)} />
            含 Gradle / Kotlin daemon
            <span className="text-xs text-amber-600">（build 中勿用）</span>
          </label>
          <label className="inline-flex items-center gap-2 text-gray-700">
            <input type="checkbox" checked={langServer} onChange={(e) => setLangServer(e.target.checked)} />
            含 dart language-server
            <span className="text-xs text-gray-400">（VS Code 會重開）</span>
          </label>
        </div>

        {/* 行程清單 */}
        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              符合清理條件的行程
              {data && <span className="ml-2 font-normal text-gray-400">{data.processes.length} 個</span>}
            </h2>
            {data && data.processes.length > 0 && (
              <button
                onClick={clean}
                disabled={cleaning}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
              >
                <Icon name={cleaning ? "spinner" : "trash"} size={15} className={cleaning ? "animate-spin" : ""} />
                {cleaning ? "清理中…" : `執行清理（可回收 ${gb(data.reclaimableMB)}）`}
              </button>
            )}
          </div>

          {loading ? (
            <p className="mt-4 text-sm text-gray-400">掃描中…</p>
          ) : !data || data.processes.length === 0 ? (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-gray-200 px-5 py-6 text-sm text-gray-500">
              <Icon name="check" size={16} className="text-emerald-500" />
              沒有符合條件的行程
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">PID</th>
                    <th className="px-4 py-2.5 font-medium">類型</th>
                    <th className="px-4 py-2.5 font-medium text-right">佔用</th>
                    <th className="px-4 py-2.5 font-medium">年齡</th>
                    <th className="px-4 py-2.5 font-medium">原因</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.processes.map((p) => (
                    <tr key={p.pid}>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{p.pid}</td>
                      <td className="px-4 py-2.5 text-gray-800">{p.kind}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-gray-900">
                        {p.footprintMB.toFixed(0)} MB
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{p.age}</td>
                      <td className="px-4 py-2.5 text-gray-500">
                        {p.reason}
                        <div className="mt-0.5 truncate font-mono text-[11px] text-gray-300" title={p.command}>
                          {p.command}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 清理結果 */}
        {result?.killed && (
          <div className="mt-8">
            <h2 className="text-sm font-semibold text-gray-900">上次清理結果</h2>
            <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200 text-sm">
              {result.killed.map((k) => (
                <li key={k.pid} className="flex items-center gap-3 px-4 py-2.5">
                  <Icon
                    name={k.outcome === "denied" ? "x" : "check"}
                    size={15}
                    className={k.outcome === "denied" ? "text-red-500" : "text-emerald-500"}
                  />
                  <span className="font-mono text-xs text-gray-500">{k.pid}</span>
                  <span className="text-gray-800">{k.kind}</span>
                  <span className="text-gray-400">{k.message}</span>
                  <span className="ml-auto text-gray-500">{k.footprintMB.toFixed(0)} MB</span>
                </li>
              ))}
              {result.killed.length === 0 && (
                <li className="px-4 py-2.5 text-gray-400">沒有行程被清掉</li>
              )}
            </ul>
          </div>
        )}

        {/* 腳本內容 */}
        {showScripts && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={() => setShowScripts(false)}>
            <div
              className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3.5">
                <h3 className="text-sm font-semibold text-gray-900">memclean 腳本內容</h3>
                <button onClick={() => setShowScripts(false)} className="text-gray-400 hover:text-gray-700">
                  <Icon name="x" size={18} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-5">
                {!scripts ? (
                  <p className="text-sm text-gray-400">載入中…</p>
                ) : (
                  scripts.map((f) => (
                    <div key={f.path}>
                      <div className="flex items-baseline gap-2">
                        <code className="text-xs font-semibold text-gray-900">{f.path}</code>
                        <span className="text-xs text-gray-400">{f.note}</span>
                      </div>
                      <pre className="mt-2 overflow-x-auto rounded-lg bg-gray-50 p-4 font-mono text-[11px] leading-relaxed text-gray-800">
                        {f.content}
                      </pre>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
