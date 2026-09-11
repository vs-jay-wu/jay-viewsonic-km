"use client";

import { useCallback, useEffect, useState } from "react";
import Icon, { type IconName } from "@/components/Icon";
import { useConfirm } from "@/components/Confirm";

interface RunPr {
  repo: string; number: number; title: string; url: string;
  author: string; priority?: string; reason?: string;
}
interface ClaudeMeta {
  exitCode: number; sessionId: string | null; costUsd: number | null;
  durationMs: number | null; numTurns: number | null; isError: boolean; resultText: string;
}
interface RunRecord {
  id: string; startedAt: string; finishedAt: string; status: string; note: string;
  trigger: string; prCount: number; prs: RunPr[]; claude: ClaudeMeta | null;
  hasLog: boolean; verdictMode?: string;
}
interface LockState {
  locked: boolean; pid: number | null; startedAt: string | null;
  runId: string | null; alive: boolean;
}
type VerdictMode = "off" | "approve" | "full";

interface QuietHours {
  enabled: boolean; startHour: number; endHour: number;
}

interface WatcherState {
  enabled: boolean; intervalSeconds: number; detectOnly: boolean;
  reviewVerdict: VerdictMode; quietHours: QuietHours; updatedAt: string;
  running: boolean; lastTickAt: string | null; nextRunAt: string | null;
  lastSkipReason: string | null; quietNow: boolean; taipeiHour: number;
}

interface PrScope { repos: string[]; configFound: boolean }

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

const STATUS: Record<string, { label: string; icon: IconName; cls: string }> = {
  clean:           { label: "沒待處理", icon: "check",   cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  detected:        { label: "只偵測",   icon: "search",  cls: "bg-sky-50 text-sky-700 border-sky-200" },
  handled:         { label: "AI 已處理", icon: "play",    cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  skipped:         { label: "跳過（鎖住）", icon: "lock", cls: "bg-gray-50 text-gray-600 border-gray-200" },
  failed:          { label: "失敗",     icon: "alert",   cls: "bg-red-50 text-red-700 border-red-200" },
  aborted:         { label: "被中斷",   icon: "x",       cls: "bg-amber-50 text-amber-700 border-amber-200" },
  "detect-failed": { label: "偵測失敗", icon: "alert",   cls: "bg-red-50 text-red-700 border-red-200" },
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-TW", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function fmtDuration(ms: number | null): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} 秒`;
  return `${Math.floor(s / 60)} 分 ${Math.round(s % 60)} 秒`;
}

function fmtCost(usd: number | null): string {
  return usd == null ? "—" : `$${usd.toFixed(4)}`;
}

export default function PrInboxPage() {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [lock, setLock] = useState<LockState | null>(null);
  const [watcher, setWatcher] = useState<WatcherState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [intervalMin, setIntervalMin] = useState(30);
  const [detectOnly, setDetectOnly] = useState(false);
  const [verdict, setVerdict] = useState<VerdictMode>("full");
  const [quiet, setQuiet] = useState<QuietHours>({ enabled: true, startHour: 0, endHour: 8 });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [log, setLog] = useState<{ id: string; log: string } | null>(null);
  const [scope, setScope] = useState<PrScope | null>(null);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    const res = await fetch("/api/pr-inbox");
    const json = await res.json();
    if (!res.ok) setError(json.error ?? "讀取失敗");
    else {
      setRuns(json.runs);
      setLock(json.lock);
      setScope(json.scope ?? null);
      setWatcher(json.watcher);
      if (json.watcher?.intervalSeconds) {
        setIntervalMin(Math.round(json.watcher.intervalSeconds / 60));
      }
      if (typeof json.watcher?.detectOnly === "boolean") {
        setDetectOnly(json.watcher.detectOnly);
      }
      if (json.watcher?.reviewVerdict) setVerdict(json.watcher.reviewVerdict);
      if (json.watcher?.quietHours) setQuiet(json.watcher.quietHours);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // AI 在跑的時候盯著看，跑完自動停
  useEffect(() => {
    if (!lock?.locked || !lock.alive) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [lock, load]);

  const post = async (url: string, body?: unknown, label?: string) => {
    setBusy(label ?? url);
    setError(null);
    setNotice(null);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setError(json.error ?? "操作失敗");
    else if (json.output) setNotice(json.output);
    setBusy(null);
    await load();
    return res.ok;
  };

  const trigger = async (detectOnly: boolean) => {
    const ok = await post("/api/pr-inbox/run", { detectOnly }, detectOnly ? "detect" : "full");
    if (ok) {
      setNotice(detectOnly ? "已開始偵測…" : "已開始，有待處理的 PR 才會啟動 AI…");
      setTimeout(load, 3000);
    }
  };

  /**
   * 只有「AI 真的跑過」的那幾筆才問一次 —— 那些有花費與當時的判斷，刪掉查不回來。
   * 沒待處理、只偵測、被鎖擋掉的那些看過就沒用了，直接刪，不要每次都跳一個框。
   */
  const removeRun = async (r: RunRecord) => {
    const involvedAi = r.claude !== null || r.status === "aborted";
    if (involvedAi) {
      const ok = await confirm({
        title: "刪掉這筆 AI 執行紀錄？",
        message: `這輪 AI 真的跑過（${fmtCost(r.claude?.costUsd ?? null)}），花費與當時的判斷刪掉就查不回來了。`,
        confirmLabel: "刪除",
        danger: true,
      });
      if (!ok) return;
    }
    const id = r.id;
    const res = await fetch(`/api/pr-inbox/runs/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "刪除失敗");
    }
    load();
  };

  const openLog = async (id: string) => {
    const res = await fetch(`/api/pr-inbox/runs/${id}/log`);
    const json = await res.json();
    if (res.ok) setLog(json);
    else setError(json.error ?? "讀不到 log");
  };

  const totalCost = runs.reduce((n, r) => n + (r.claude?.costUsd ?? 0), 0);
  const aiRuns = runs.filter((r) => r.claude).length;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-10">
        <h1 className="text-2xl font-semibold text-gray-900">PR 巡邏</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
          排程只做<strong className="font-medium text-gray-700">偵測</strong>（
          <code className="text-xs">handle-pr-inbox.sh --json</code>，不花錢、不用 AI）；
          真的有待處理的 PR 才啟動 Claude 跑 <code className="text-xs">/handle-pr-inbox</code>。
          AI 執行期間會上鎖，排程碰到鎖就跳過 —— 同一批 PR 不會被 review 兩次。
        </p>

        {/* 巡邏範圍 —— 靜態清單，但要看得見，不然會誤以為「沒跳出來就是沒有」 */}
        <div className="mt-4 rounded-xl border border-gray-200 px-5 py-3.5 text-sm">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-medium text-gray-900">巡邏範圍</span>
            {scope?.repos.length ? (
              <span className="flex flex-wrap gap-1.5">
                {scope.repos.map((r) => (
                  <code
                    key={r}
                    className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700"
                  >
                    {r}
                  </code>
                ))}
              </span>
            ) : (
              <span className="text-gray-500">
                {scope?.configFound
                  ? "（清單是空的 —— 會掃所有與我有關的 PR）"
                  : "（讀不到 local.workspace.json）"}
              </span>
            )}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-gray-500">
            這些 repo 底下<strong className="font-medium text-gray-700">所有</strong>開著的 PR
            都會進來（不必被指派），再聯集 GitHub 認定與我有關的：review-requested、
            reviewed-by、mentions、assignee。
            <strong className="font-medium text-gray-700">清單以外的 repo 只會靠後者帶到</strong>
            —— 去別的 repo 做事時要自己留意。清單是靜態的，改在{" "}
            <code className="text-xs">local.workspace.json</code> 的{" "}
            <code className="text-xs">.prReview.repos</code>（gitignored）。
          </p>
        </div>

        {error && (
          <div className="mt-6 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <Icon name="alert" size={16} className="mt-0.5" />
            <span className="whitespace-pre-wrap">{error}</span>
          </div>
        )}
        {notice && (
          <div className="mt-6 flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
            <Icon name="check" size={16} className="mt-0.5" />
            <span className="whitespace-pre-wrap">{notice}</span>
          </div>
        )}

        {/* 排程 */}
        <div className="mt-7 rounded-xl border border-gray-200 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span
                className={`inline-flex h-2.5 w-2.5 rounded-full ${
                  watcher?.enabled ? "bg-emerald-500" : "bg-gray-300"
                }`}
              />
              <h2 className="text-sm font-semibold text-gray-900">
                定期偵測 {watcher?.enabled ? "已啟用" : "未啟用"}
              </h2>
              {watcher?.enabled && (
                <span className="text-xs text-gray-400">
                  每 {Math.round(watcher.intervalSeconds / 60)} 分鐘
                  {watcher.nextRunAt && ` · 下次 ${fmtTime(watcher.nextRunAt)}`}
                </span>
              )}
              {watcher?.enabled && watcher.detectOnly && (
                <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs text-sky-700">
                  只偵測
                </span>
              )}
              {watcher?.enabled && watcher.quietNow && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
                  <Icon name="clock" size={12} /> 靜音中，暫停巡邏
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={detectOnly}
                  onChange={(e) => {
                    setDetectOnly(e.target.checked);
                    if (watcher?.enabled) {
                      post("/api/pr-inbox/watcher",
                        { enabled: true, intervalSeconds: intervalMin * 60, detectOnly: e.target.checked },
                        "detectOnly");
                    }
                  }}
                />
                只偵測不叫 AI
              </label>
              <label className="inline-flex items-center gap-1.5 text-sm text-gray-600">
                間隔
                <input
                  type="number"
                  min={1}
                  value={intervalMin}
                  onChange={(e) => setIntervalMin(Number(e.target.value))}
                  className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900"
                />
                分
              </label>
              {watcher?.enabled ? (
                <>
                  <button
                    onClick={() => post("/api/pr-inbox/watcher", { enabled: true, intervalSeconds: intervalMin * 60, detectOnly }, "apply")}
                    disabled={!!busy}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    套用間隔
                  </button>
                  <button
                    onClick={() => post("/api/pr-inbox/watcher", { enabled: false }, "disable")}
                    disabled={!!busy}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    停用
                  </button>
                </>
              ) : (
                <button
                  onClick={() => post("/api/pr-inbox/watcher", { enabled: true, intervalSeconds: intervalMin * 60, detectOnly }, "enable")}
                  disabled={!!busy}
                  className="rounded-lg bg-gray-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
                >
                  啟用排程
                </button>
              )}
            </div>
          </div>

          {/* 靜音時段 */}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-gray-200 bg-gray-50/60 px-4 py-3 text-sm">
            <label className="inline-flex items-center gap-2 text-gray-700">
              <input
                type="checkbox"
                checked={quiet.enabled}
                onChange={(e) => {
                  const q = { ...quiet, enabled: e.target.checked };
                  setQuiet(q);
                  post("/api/pr-inbox/watcher",
                    { enabled: !!watcher?.enabled, quietHours: q }, "quiet");
                }}
              />
              這段時間不巡邏
            </label>
            <label className="inline-flex items-center gap-1.5 text-gray-700">
              <input
                type="number" min={0} max={23} value={quiet.startHour}
                onChange={(e) => setQuiet({ ...quiet, startHour: Number(e.target.value) })}
                className="w-14 rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900"
              />
              點 到
              <input
                type="number" min={0} max={23} value={quiet.endHour}
                onChange={(e) => setQuiet({ ...quiet, endHour: Number(e.target.value) })}
                className="w-14 rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900"
              />
              點
            </label>
            <button
              onClick={() => post("/api/pr-inbox/watcher",
                { enabled: !!watcher?.enabled, quietHours: quiet }, "quiet")}
              disabled={!!busy}
              className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              套用
            </button>
            <span className="text-xs text-gray-400">
              台北時間（不跟機器時區走）
              {watcher && ` · 現在 ${hh(watcher.taipeiHour)}`}
              {quiet.enabled && ` · ${hh(quiet.startHour)} 起暫停，${hh(quiet.endHour)} 恢復`}
            </span>
            <p className="w-full text-xs leading-relaxed text-gray-500">
              只擋排程。手動觸發任何時間都能跑 —— 這條規則是「不要半夜自動去動別人的 PR」，
              不是「半夜不准用」。靜音期間不會留執行紀錄（一晚會堆出近百筆「因為半夜所以沒跑」）。
            </p>
          </div>

          {/* 送不送出 review 判定 */}
          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50/60 px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-gray-900">AI 的 review 判定</span>
              <select
                value={verdict}
                onChange={(e) => {
                  const v = e.target.value as VerdictMode;
                  setVerdict(v);
                  post("/api/pr-inbox/watcher",
                    { enabled: !!watcher?.enabled, reviewVerdict: v },
                    "verdict");
                }}
                className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-800"
              >
                <option value="full">approve ＋ request changes 都可以（預設）</option>
                <option value="approve">只送 approve（要改的只留言）</option>
                <option value="off">只留言（不 approve、不 request changes）</option>
              </select>
              {verdict !== "off" && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                  <Icon name="alert" size={12} /> 會代表你對別人的 PR 表態
                </span>
              )}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-gray-500">
              {verdict === "off" &&
                "只用 gh pr comment 留言。approve／request changes 一律不送 —— review 不會有結論，球留在你手上。"}
              {verdict === "approve" &&
                "沒有 MUST、也沒有程式碼層 SHOULD 時送 approve；有 MUST 只留言，不送 request changes。"}
              {verdict === "full" &&
                "approve 同上；另外在有至少一條「自己追到程式碼確認過」的 MUST 時送 request changes。只有 SHOULD／NIT／QUESTION 不會 request changes。"}
              {verdict !== "off" &&
                " 只剩文件類 SHOULD（PR 描述／註解與 head 不符）時會附條件 approve —— 壓住的話 PR 會停在 REVIEW_REQUIRED 等你手動處理。"}
              {" "}不確定一律退回留言。草稿含本機／km 路徑時會被守門擋下、完全不貼
              （<code>review-pr.sh</code> 的洩漏檢查）。
            </p>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-gray-400">
            排程掛在這個 web server 裡（設定寫進 <code>data/local-state/pr-inbox-watch.json</code>，
            server 重開會自己接回去），所以 <strong className="text-gray-500">web 沒開就不會巡邏</strong> ——
            要讓它常駐請跑 <code>./scripts/setup-km-web.sh --install</code>。
            啟用後只要有待處理的 PR 就會自動叫 AI 去看並留言，那是會對外送出的動作；
            不想自動化就別啟用，改用下面的手動觸發。
            {watcher?.lastTickAt && (
              <>
                {" "}上次檢查 {fmtTime(watcher.lastTickAt)}
                {watcher.lastSkipReason ? `（跳過：${watcher.lastSkipReason}）` : ""}。
              </>
            )}
          </p>

          {/* 鎖狀態 */}
          {lock?.locked && (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 px-4 py-3 text-sm">
              <Icon name={lock.alive ? "spinner" : "alert"} size={15}
                    className={lock.alive ? "animate-spin text-indigo-600" : "text-amber-600"} />
              {lock.alive ? (
                <span className="text-gray-700">
                  正在執行中（pid {lock.pid}{lock.runId ? `，run ${lock.runId}` : ""}）—— 排程這段時間會跳過
                </span>
              ) : (
                <>
                  <span className="text-gray-700">
                    殘留的鎖（pid {lock.pid} 已不在）。下一輪會自己回收，也可以手動清掉。
                  </span>
                  <button
                    onClick={() => post("/api/pr-inbox/unlock", {}, "unlock")}
                    disabled={!!busy}
                    className="ml-auto rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    清除鎖
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* 手動觸發 */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => trigger(true)}
            disabled={!!busy || (lock?.locked && lock.alive)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Icon name="search" size={15} /> 只偵測（不叫 AI）
          </button>
          <button
            onClick={() => trigger(false)}
            disabled={!!busy || (lock?.locked && lock.alive)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
          >
            <Icon name="play" size={15} /> 偵測並處理
          </button>
          <button
            onClick={load}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Icon name="refresh" size={15} /> 重新載入
          </button>
        </div>

        {/* 執行紀錄 */}
        <div className="mt-9">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-gray-900">執行紀錄</h2>
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
              <Icon name="coins" size={13} />
              {runs.length} 筆 · 其中 {aiRuns} 次叫了 AI · 累計 {fmtCost(totalCost)}
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            存在 <code>data/pr-inbox-runs/</code>（gitignored，不進版控）。
            自動清理：沒叫 AI 的留 7 天，派過 AI 的留 30 天。
          </p>

          {loading ? (
            <p className="mt-4 text-sm text-gray-400">載入中…</p>
          ) : runs.length === 0 ? (
            <p className="mt-4 rounded-xl border border-gray-200 px-5 py-6 text-sm text-gray-400">
              還沒有紀錄。按上面的「只偵測」跑一次看看。
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200">
              {runs.map((r) => {
                const st = STATUS[r.status] ?? {
                  label: r.status, icon: "clock" as IconName,
                  cls: "bg-gray-50 text-gray-600 border-gray-200",
                };
                const open = expanded === r.id;
                return (
                  <li key={r.id}>
                    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <button
                        onClick={() => setExpanded(open ? null : r.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <Icon name={open ? "chevronDown" : "chevronRight"} size={14} className="text-gray-300" />
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${st.cls}`}>
                          <Icon name={st.icon} size={12} /> {st.label}
                        </span>
                        <span className="text-sm text-gray-800">{fmtTime(r.startedAt)}</span>
                        <span className="text-xs text-gray-400">
                          {r.trigger === "manual" ? "手動" : "排程"}
                        </span>
                        <span className="truncate text-xs text-gray-500">
                          {r.prCount > 0 ? `${r.prCount} 筆待處理` : r.note}
                        </span>
                      </button>
                      {r.claude && (
                        <span className="text-xs text-gray-500">
                          {fmtCost(r.claude.costUsd)} · {r.claude.numTurns ?? "?"} turns ·{" "}
                          {fmtDuration(r.claude.durationMs)}
                        </span>
                      )}
                      <button
                        onClick={() => removeRun(r)}
                        title="刪除這筆紀錄"
                        className="text-gray-300 hover:text-red-600"
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </div>

                    {open && (
                      <div className="border-t border-gray-100 bg-gray-50/60 px-11 py-4 text-sm">
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-3">
                          <div><dt className="text-gray-400">run id</dt><dd className="font-mono text-gray-700">{r.id}</dd></div>
                          <div><dt className="text-gray-400">結束</dt><dd className="text-gray-700">{fmtTime(r.finishedAt)}</dd></div>
                          <div><dt className="text-gray-400">說明</dt><dd className="text-gray-700">{r.note || "—"}</dd></div>
                          <div>
                            <dt className="text-gray-400">判定模式</dt>
                            <dd className="text-gray-700">{r.verdictMode ?? "off"}</dd>
                          </div>
                          {r.claude && (
                            <>
                              <div><dt className="text-gray-400">花費</dt><dd className="text-gray-700">{fmtCost(r.claude.costUsd)}</dd></div>
                              <div><dt className="text-gray-400">耗時</dt><dd className="text-gray-700">{fmtDuration(r.claude.durationMs)}</dd></div>
                              <div><dt className="text-gray-400">turns</dt><dd className="text-gray-700">{r.claude.numTurns ?? "—"}</dd></div>
                              <div className="col-span-2 sm:col-span-3">
                                <dt className="text-gray-400">session</dt>
                                <dd className="font-mono text-[11px] text-gray-600">{r.claude.sessionId ?? "—"}</dd>
                              </div>
                            </>
                          )}
                        </dl>

                        {r.prs.length > 0 && (
                          <ul className="mt-3 space-y-1.5">
                            {r.prs.map((p) => (
                              <li key={`${p.repo}#${p.number}`} className="flex items-start gap-2">
                                {p.priority && (
                                  <span className="mt-0.5 rounded bg-white px-1.5 py-0.5 text-[11px] text-gray-600 ring-1 ring-gray-200">
                                    {p.priority}
                                  </span>
                                )}
                                <a href={p.url} target="_blank" rel="noreferrer"
                                   className="min-w-0 text-xs text-gray-700 hover:underline">
                                  <span className="font-mono text-gray-500">
                                    {p.repo.split("/").pop()}#{p.number}
                                  </span>{" "}
                                  {p.title}
                                  {p.reason && <span className="text-gray-400">　—　{p.reason}</span>}
                                </a>
                              </li>
                            ))}
                          </ul>
                        )}

                        {r.claude?.resultText && (
                          <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-3 font-mono text-[11px] leading-relaxed text-gray-700 ring-1 ring-gray-200">
                            {r.claude.resultText}
                          </pre>
                        )}

                        {r.hasLog && (
                          <button
                            onClick={() => openLog(r.id)}
                            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                          >
                            <Icon name="code" size={13} /> 看原始 log
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* log 彈窗 */}
        {log && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={() => setLog(null)}>
            <div
              className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3.5">
                <h3 className="text-sm font-semibold text-gray-900">claude 原始輸出 · {log.id}</h3>
                <button onClick={() => setLog(null)} className="text-gray-400 hover:text-gray-700">
                  <Icon name="x" size={18} />
                </button>
              </div>
              <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-5 font-mono text-[11px] leading-relaxed text-gray-800">
                {log.log}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
