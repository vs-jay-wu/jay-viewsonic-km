"use client";

import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import Tooltip from "@/components/Tooltip";
import {
  DEFAULT_FILTERS, UNGROUPED, filterRepos, groupByProduct,
  type RepoEntry, type ReposOverview,
} from "@/lib/reposOverviewRules";

interface Payload {
  overview: ReposOverview;
  fileModifiedAt: string | null;
}

const GITHUB_ORG = "Viewsonic-EDU";

function githubUrl(repo: RepoEntry, org: string): string {
  // Jay 自己的 repo 掛在個人帳號底下，不在 org 裡
  const owner = repo.org?.toLowerCase().includes("self") ? "vs-jay-wu" : org;
  return `https://github.com/${owner}/${repo.name}`;
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "gray" | "sky" | "amber" }) {
  const cls = {
    gray: "border-gray-200 bg-gray-50 text-gray-500",
    sky: "border-sky-200 bg-sky-50 text-sky-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
  }[tone];
  return (
    <span className={`rounded-full border px-1.5 py-0.5 text-[11px] leading-none ${cls}`}>
      {children}
    </span>
  );
}

function RepoRow({ repo, org }: { repo: RepoEntry; org: string }) {
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <a
          href={githubUrl(repo, org)}
          target="_blank"
          rel="noreferrer"
          className="group inline-flex items-center gap-1 font-mono text-sm text-gray-900 hover:underline"
        >
          {repo.name}
          <Icon name="external" size={12} className="text-gray-300 group-hover:text-gray-500" />
        </a>
        {repo.archived && <Chip tone="amber">已封存</Chip>}
        {repo.type && <Chip>{repo.type}</Chip>}
        {repo.org && <Chip>{repo.org}</Chip>}
        {repo.hostPrefix && (
          <Tooltip label="部署的 host 前綴">
            <span className="font-mono text-[11px] text-gray-400">{repo.hostPrefix}.*</span>
          </Tooltip>
        )}
      </div>

      {(repo.aliases?.length ?? 0) > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <span className="text-[11px] text-gray-400">別名</span>
          {repo.aliases!.map((a) => <Chip key={a}>{a}</Chip>)}
        </div>
      )}

      <p className="mt-1 text-xs leading-relaxed text-gray-600">{repo.description}</p>

      {((repo.tech?.length ?? 0) > 0 || (repo.dependencies?.length ?? 0) > 0) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {repo.tech?.map((t) => <Chip key={t} tone="sky">{t}</Chip>)}
          {repo.dependencies?.map((d) => (
            <Tooltip key={d.repo} label={d.note ?? "依賴"}>
              <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-1.5 py-0.5 text-[11px] leading-none text-gray-500">
                <Icon name="chevronRight" size={10} className="text-gray-400" />
                {d.repo}
              </span>
            </Tooltip>
          ))}
        </div>
      )}
    </li>
  );
}

export default function ReposPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  /** 手動收合的群組。未歸類預設就是收的 —— 那一組有一百多個，展開會蓋掉其他產品 */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set([UNGROUPED]));

  useEffect(() => {
    fetch("/api/repos-overview")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "讀取失敗");
        setData(j as Payload);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const searching = filters.query.trim().length > 0;
  const groups = useMemo(() => {
    if (!data) return [];
    return groupByProduct(data.overview, filterRepos(data.overview, filters));
  }, [data, filters]);

  const shown = groups.reduce((n, g) => n + g.repos.length, 0);
  const total = data?.overview.repos.length ?? 0;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-10">
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-gray-900">
          <Icon name="repos" size={22} className="text-gray-400" />
          Repos 總覽
        </h1>
        <p className="mt-1.5 text-sm text-gray-500">
          {data?.overview._meta.description ?? "org 底下每個 repo 是做什麼的"}
          {data?.overview._meta.updated && `（內容標記更新於 ${data.overview._meta.updated}）`}
        </p>

        {error && (
          <div className="mt-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <Icon name="alert" size={15} className="mt-0.5" />
            <div>
              {error}
              <div className="mt-1 text-xs">這份檔案是手動維護的，不是排程產的。</div>
            </div>
          </div>
        )}

        {/* 篩選列：高度固定，不隨結果變動（版面不要跳） */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[16rem]">
            <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={filters.query}
              onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
              placeholder="搜尋 repo 名、別名、用途、技術、host…"
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-gray-500"
            />
          </div>
          <label className="inline-flex items-center gap-1.5 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={filters.showArchived}
              onChange={(e) => setFilters((f) => ({ ...f, showArchived: e.target.checked }))}
            />
            已封存
          </label>
          <label className="inline-flex items-center gap-1.5 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={filters.showNonCode}
              onChange={(e) => setFilters((f) => ({ ...f, showNonCode: e.target.checked }))}
            />
            fork／keystore
          </label>
        </div>

        <div className="mt-2 h-4 text-xs text-gray-400">
          {data && `顯示 ${shown} / ${total} 個 repo · ${groups.length} 條產品線`}
        </div>

        {/* 產品分組 */}
        <div className="mt-4 space-y-3">
          {data && groups.length === 0 && (
            <p className="rounded-xl border border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
              沒有符合的 repo。試試別名（例如 <code>cs backend</code>、<code>learn-swift</code>）。
            </p>
          )}
          {groups.map((g) => {
            // 搜尋中一律展開 —— 收合起來會讓人以為沒找到
            const open = searching || !collapsed.has(g.key);
            return (
              <section key={g.key} className="rounded-xl border border-gray-200">
                <button
                  onClick={() =>
                    setCollapsed((prev) => {
                      const next = new Set(prev);
                      if (next.has(g.key)) next.delete(g.key);
                      else next.add(g.key);
                      return next;
                    })
                  }
                  disabled={searching}
                  className="flex w-full items-start gap-2.5 px-4 py-3 text-left disabled:cursor-default"
                >
                  <Icon
                    name={open ? "chevronDown" : "chevronRight"}
                    size={15}
                    className="mt-0.5 text-gray-400"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">{g.fullName}</span>
                      <span className="text-xs text-gray-400">{g.repos.length}</span>
                      {g.aliases?.slice(0, 4).map((a) => <Chip key={a}>{a}</Chip>)}
                    </div>
                    {g.description && (
                      <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{g.description}</p>
                    )}
                  </div>
                </button>
                {open && (
                  <ul className="divide-y divide-gray-100 border-t border-gray-100">
                    {g.repos.map((r) => (
                      <RepoRow key={r.name} repo={r} org={data?.overview._meta.organization ?? GITHUB_ORG} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
