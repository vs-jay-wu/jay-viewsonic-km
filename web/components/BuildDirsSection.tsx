"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icon";
import Tooltip from "@/components/Tooltip";
import { useConfirm } from "@/components/Confirm";
import {
  KIND_SPECS, SIZE_THRESHOLD_BYTES, formatBytes, noteForKinds,
  type BuildDirsSnapshot, type RepoBuildDirs,
} from "@/lib/buildDirRules";

/**
 * 首頁的「build 產物」區塊。
 *
 * 刻意**非同步載入**：掃一次要 du 幾十 GB（實測約 7 秒），不能擋住首頁其他內容
 * （Jay 2026-09-11：這一塊慢點出來沒關係）。所以整塊自己 fetch，
 * 載入中就佔一個固定高度的骨架，不要讓下面的區塊跳動。
 */

const KIND_LABEL = Object.fromEntries(KIND_SPECS.map((s) => [s.kind, s.label]));

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-TW", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function BuildDirsSection() {
  const [data, setData] = useState<BuildDirsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();

  const load = useCallback(async (rescan = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/build-dirs${rescan ? "?scan=1" : ""}`);
      const json = await res.json();
      if (!res.ok) setError(json.error ?? "掃描失敗");
      else setData(json as BuildDirsSnapshot);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  /** 一次清掉所有列出來的 repo。逐個打 API —— 每次清完 server 都會重掃，
   *  這樣中途失敗時前面已經釋出的空間也算數。 */
  const cleanAll = async () => {
    if (!data?.repos.length) return;
    const cleanable = data.repos
      .map((r) => ({ repo: r, dirs: r.dirs.filter((d) => !d.notIgnored) }))
      .filter((x) => x.dirs.length > 0);
    if (!cleanable.length) {
      setError("列出來的目錄都沒有被 gitignore，為安全起見不刪");
      return;
    }
    const total = cleanable.reduce(
      (n, x) => n + x.dirs.reduce((m, d) => m + d.bytes, 0), 0
    );
    const ok = await confirm({
      title: `清掉全部 ${cleanable.length} 個 repo 的 build 產物？`,
      message:
        `${cleanable.map((x) => `${x.repo.repo}（${formatBytes(x.dirs.reduce((m, d) => m + d.bytes, 0))}）`).join("、")}\n` +
        `共會釋出約 ${formatBytes(total)}。\n` +
        `這些 repo 下次 build 都要整包重來（node_modules 還要重新 install）。`,
      confirmLabel: "全部清掉",
      danger: true,
    });
    if (!ok) return;

    setNotice(null);
    setError(null);
    let freed = 0;
    let count = 0;
    for (const x of cleanable) {
      setBusy(x.repo.repo);
      const res = await fetch("/api/build-dirs/clean", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: x.repo.repo, dirs: x.dirs.map((d) => d.path) }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(`${x.repo.repo}：${json.error ?? "清除失敗"}`);
        break;
      }
      freed += json.freedBytes;
      count += 1;
    }
    setBusy(null);
    setNotice(`清掉 ${count} 個 repo，釋出 ${formatBytes(freed)}`);
    await load();
  };

  const cleanRepo = async (repo: RepoBuildDirs) => {
    const dirs = repo.dirs.filter((d) => !d.notIgnored);
    if (!dirs.length) {
      setError(`${repo.repo} 的目錄都沒有被 gitignore，為安全起見不刪`);
      return;
    }
    const ok = await confirm({
      title: `清掉 ${repo.repo} 的 build 產物？`,
      message:
        `會刪掉：${dirs.map((d) => `${d.path}（${formatBytes(d.bytes)}）`).join("、")}\n` +
        `共 ${formatBytes(dirs.reduce((n, d) => n + d.bytes, 0))}。\n` +
        `${noteForKinds(repo.kinds)}。`,
      confirmLabel: "清除",
      danger: true,
    });
    if (!ok) return;

    setBusy(repo.repo);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/build-dirs/clean", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: repo.repo, dirs: dirs.map((d) => d.path) }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "清除失敗");
        return;
      }
      setNotice(`${repo.repo}：清掉 ${json.removed.length} 個目錄，釋出 ${formatBytes(json.freedBytes)}`);
      await load();
    } finally {
      setBusy(null);
    }
  };

  // 沒有任何 repo 超過門檻就**整塊不顯示**（Jay 2026-09-11）——
  // 空狀態的框只是佔位置。載入中也不顯示，避免出現又消失的跳動。
  if (!error && (!data || data.repos.length === 0)) return null;

  return (
    <div className="mt-10">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-fg">
          佔空間的 build 產物
          {data && data.repos.length > 0 && (
            <span className="ml-2 font-normal text-fg-subtle">
              {formatBytes(data.totalBytes)}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-1">
          {/* 只有圖示的按鈕一定要包 Tooltip（web/AGENTS.md）—— 原生 title 要停留快一秒
              才出現，隔幾個月回來會看不出這顆會做什麼，而其中一顆是刪東西的 */}
          <Tooltip label="全部清理：刪掉所有 repo 的 build 產物">
            <button
              onClick={cleanAll}
              disabled={loading || !!busy || !data?.repos.length}
              aria-label="全部清理"
              className="rounded p-1 text-fg-subtle hover:bg-surface-sunken hover:text-danger disabled:opacity-40"
            >
              <Icon name="trash" size={15} />
            </button>
          </Tooltip>
          <Tooltip label={loading ? "掃描中…" : "重新掃描"}>
            <button
              onClick={() => load(true)}
              disabled={loading || !!busy}
              aria-label="重新掃描"
              className="rounded p-1 text-fg-subtle hover:bg-surface-sunken hover:text-fg disabled:opacity-40"
            >
              <Icon name="refresh" size={15} className={loading ? "animate-spin" : ""} />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="mt-1 min-h-[1rem] text-xs">
        {notice && <span className="text-ok">{notice}</span>}
        {error && <span className="text-danger">{error}</span>}
        {!notice && !error && data && (
          <span className="text-fg-subtle">
            超過 {formatBytes(SIZE_THRESHOLD_BYTES)} 的才列出來 · 掃了 {data.repoCount} 個 repo ·
            {" "}{fmtTime(data.scannedAt)}
          </span>
        )}
      </div>

      {data && data.repos.length > 0 && (
        <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
          {data.repos.map((r) => (
            <li key={r.repo} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-fg">{r.repo}</span>
                  <span className="text-[11px] text-fg-subtle">
                    {r.kinds.map((k) => KIND_LABEL[k] ?? k).join("／")}
                  </span>
                  <span className="text-xs text-fg-muted">{formatBytes(r.totalBytes)}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {r.dirs.map((d) => (
                    <span
                      key={d.path}
                      className={`rounded-full border px-1.5 py-0.5 font-mono text-[11px] leading-none ${
                        d.notIgnored
                          ? "border-warn/40 bg-warn-bg text-warn"
                          : "border-line bg-surface-raised text-fg-muted"
                      }`}
                      title={d.notIgnored ? "沒有被 gitignore —— 不會被清掉" : undefined}
                    >
                      {d.path} {formatBytes(d.bytes)}
                    </span>
                  ))}
                </div>
              </div>
              <Tooltip side="left" label={`刪掉這些目錄（${noteForKinds(r.kinds)}）`}>
                <button
                  onClick={() => cleanRepo(r)}
                  disabled={!!busy}
                  className="mt-0.5 shrink-0 text-fg-disabled hover:text-danger disabled:opacity-40"
                >
                  <Icon name={busy === r.repo ? "spinner" : "trash"} size={16}
                        className={busy === r.repo ? "animate-spin" : ""} />
                </button>
              </Tooltip>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
