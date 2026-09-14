"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import Tooltip from "@/components/Tooltip";
import {
  KIND_LABEL, STATUS_STYLE, groupSetsByRepo, matchesDocQuery, sortSets,
  type DocFile, type DocsIndex,
} from "@/lib/docsRules";
import { ticketUrl } from "@/lib/workItemRules";

interface Payload extends DocsIndex {
  pinned: string[];
}

/** 文件用瀏覽器開：走 /docs-view 這條唯讀路由，資產（css／圖）跟著相對路徑一起服務 */
function viewUrl(relPath: string): string {
  return "/" + ["docs-view", ...relPath.split("/").slice(1)].map(encodeURIComponent).join("/");
}

function fmtSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function DocsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [query, setQuery] = useState("");
  const [onlyPinned, setOnlyPinned] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/docs", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) setError(json.error ?? "讀取失敗");
      else setData(json as Payload);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const togglePin = async (dir: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/docs/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dir }),
      });
      const json = await res.json();
      setData((d) => (d ? { ...d, sets: sortSets(d.sets, json.pinned), pinned: json.pinned } : d));
    } finally {
      setBusy(false);
    }
  };

  const pinnedCount = data?.pinned.length ?? 0;
  const sets = useMemo(() => {
    const pinned = new Set(data?.pinned ?? []);
    return (data?.sets ?? [])
      .filter((s) => !onlyPinned || pinned.has(s.dir))
      .filter((s) => matchesDocQuery(s, query));
  }, [data, query, onlyPinned]);
  const totalFiles = (data?.sets ?? []).reduce((n, s) => n + s.files.length, 0);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-6 sm:px-8 sm:py-10">
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-gray-900">
          <Icon name="clipboard" size={22} className="text-gray-400" />
          文件
        </h1>
        <p className="mt-1.5 text-sm text-gray-500">
          `docs/` 底下的 HTML 文件集。一個 feature 資料夾是一份文件集，入口是
          <code className="mx-1 rounded bg-gray-100 px-1 py-0.5 text-xs">index.html</code>。
          點標題用瀏覽器開（圖與樣式都會一起帶）。
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[16rem]">
            <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜尋標題、feature、repo、票號…"
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-gray-500"
            />
          </div>
          <Tooltip label={pinnedCount === 0 ? "還沒有 pin 住任何文件集" : "只看 pin 住的"}>
            <button
              onClick={() => setOnlyPinned((v) => !v)}
              disabled={pinnedCount === 0}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs disabled:opacity-40 ${
                onlyPinned
                  ? "border-amber-400 bg-amber-50 text-amber-800"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Icon name="pin" size={13} className={onlyPinned ? "text-amber-500" : "text-gray-400"} />
              只看 pin（{pinnedCount}）
            </button>
          </Tooltip>
          <button
            onClick={() => void load()}
            className="rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
          >
            重新掃描
          </button>
        </div>

        <div className="mt-2 h-4 text-xs">
          {error ? (
            <span className="text-red-600">{error}</span>
          ) : data ? (
            <span className="text-gray-400">
              {sets.length} / {data.sets.length} 個文件集 · 共 {totalFiles} 份
              {onlyPinned && "（只看 pin 住的）"}
              {data.missingEntry > 0 && (
                <span className="ml-2 text-amber-700">{data.missingEntry} 個沒有 index.html</span>
              )}
            </span>
          ) : (
            <span className="text-gray-400">載入中…</span>
          )}
        </div>

        {data && sets.length === 0 && (
          <p className="mt-4 rounded-xl border border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
            {onlyPinned ? "pin 住的文件集裡沒有符合搜尋的" : "沒有符合的文件"}
          </p>
        )}

        {/* 依 repo 分群（Jay 2026-09-14）。群內沿用 pin 優先、其餘照最後更新 */}
        {groupSetsByRepo(sets, data?.pinned ?? []).map((g) => (
          <section key={g.label} className="mt-4">
            <h2 className="flex items-baseline gap-2 px-1 text-xs font-semibold text-gray-700">
              <span className="font-mono">{g.label}</span>
              <span className="font-normal text-gray-400">{g.sets.length}</span>
              {g.repo === null && (
                <span className="font-normal text-gray-300">docs/features/</span>
              )}
            </h2>
            <ul className="mt-1.5 divide-y divide-gray-100 rounded-xl border border-gray-200">
              {g.sets.map((s) => {
            const pinned = data?.pinned.includes(s.dir) ?? false;
            const open = expanded.has(s.dir);
            const st = STATUS_STYLE[s.status];
            return (
              <li key={s.dir} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <Tooltip label={pinned ? "取消 pin" : "pin 住（排到最前面）"}>
                    <button
                      onClick={() => togglePin(s.dir)}
                      disabled={busy}
                      className={`mt-0.5 ${pinned ? "text-amber-500" : "text-gray-300 hover:text-amber-500"}`}
                    >
                      <Icon name="pin" size={16} />
                    </button>
                  </Tooltip>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={s.entry ? viewUrl(s.entry.path) : undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-sm font-medium text-gray-900 hover:underline"
                      >
                        {s.entry?.title ?? s.feature}
                      </a>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] leading-none ${st.cls}`}>
                        {st.label}
                      </span>
                      {!s.entry && (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] leading-none text-amber-700">
                          沒有 index.html
                        </span>
                      )}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400">
                      {/* repo 已經在群標題上，這裡只留 feature 名 */}
                      <span className="font-mono">{s.feature}</span>
                      <button
                        onClick={() =>
                          setExpanded((prev) => {
                            const next = new Set(prev);
                            if (next.has(s.dir)) next.delete(s.dir);
                            else next.add(s.dir);
                            return next;
                          })
                        }
                        className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-800"
                      >
                        <Icon name={open ? "chevronDown" : "chevronRight"} size={12} />
                        {s.files.length} 份
                      </button>
                      <Tooltip label="最後一次 commit 的日期（未進版控的用檔案時間）">
                        <span>{s.updated ?? "—"}</span>
                      </Tooltip>
                      {s.tickets.map((t) => (
                        <a
                          key={t}
                          href={ticketUrl(t)}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 font-mono text-sky-700 hover:bg-sky-100"
                        >
                          {t}
                        </a>
                      ))}
                    </div>

                    {open && (
                      <ul className="mt-2 space-y-1">
                        {s.files.map((f: DocFile) => (
                          <li key={f.path} className="flex items-baseline gap-2 text-xs">
                            <span className="w-16 shrink-0 text-right text-[11px] text-gray-400">
                              {KIND_LABEL[f.kind]}
                            </span>
                            <a
                              href={viewUrl(f.path)}
                              target="_blank"
                              rel="noreferrer"
                              className={`min-w-0 flex-1 truncate hover:underline ${
                                f.status === "superseded" ? "text-gray-400" : "text-gray-700"
                              }`}
                            >
                              {f.title}
                            </a>
                            <span className="shrink-0 font-mono text-[11px] text-gray-300">
                              {f.name}
                            </span>
                            <span className="shrink-0 text-[11px] text-gray-400">
                              {fmtSize(f.sizeBytes)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <Tooltip side="left" label="用瀏覽器開這份文件集的入口">
                    <a
                      href={s.entry ? viewUrl(s.entry.path) : undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 shrink-0 text-gray-300 hover:text-sky-600"
                    >
                      <Icon name="external" size={16} />
                    </a>
                  </Tooltip>
                </div>
              </li>
            );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
