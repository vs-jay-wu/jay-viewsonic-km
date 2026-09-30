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
  hasLog: boolean; verdictMode?: string; engine?: "claude" | "codex";
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
  clean:           { label: "沒待處理", icon: "check",   cls: "bg-ok-bg text-ok border-ok/40" },
  // 有待處理、但指紋跟上次一樣（head sha ＋ 對方最後動作時間都沒動）→ 不重送 AI
  "already-handled": { label: "都處理過了", icon: "check", cls: "bg-surface-raised text-fg-muted border-line" },
  detected:        { label: "只偵測",   icon: "search",  cls: "bg-surface-selected text-accent border-accent/50" },
  handled:         { label: "AI 已處理", icon: "play",    cls: "bg-surface-sunken text-info border-info/40" },
  skipped:         { label: "跳過（鎖住）", icon: "lock", cls: "bg-surface-raised text-fg-muted border-line" },
  failed:          { label: "失敗",     icon: "alert",   cls: "bg-danger-bg text-danger border-danger/40" },
  aborted:         { label: "被中斷",   icon: "x",       cls: "bg-warn-bg text-warn border-warn/40" },
  "detect-failed": { label: "偵測失敗", icon: "alert",   cls: "bg-danger-bg text-danger border-danger/40" },
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

  /**
   * 一次清掉沒有 AI 參與、也不是失敗的紀錄。
   * 失敗的刻意留著 —— 首頁「連續失敗」的判斷是從這些紀錄推導的。
   */
  const clearRuns = async () => {
    const clearable = runs.filter(
      (r) => r.claude === null && r.status !== "aborted"
        && r.status !== "failed" && r.status !== "detect-failed"
    ).length;
    // 兩個類別會重疊（被中斷的那輪同時是失敗、也有 AI 的花費），
    // 所以用「總數 - 可清的」算保留數，不要把兩個數字相加
    const kept = runs.length - clearable;
    if (clearable === 0) return;

    const ok = await confirm({
      title: `清除 ${clearable} 筆紀錄？`,
      message:
        `要清的是沒待處理／只偵測／被鎖擋掉的那些。` +
        `其餘 ${kept} 筆保留：AI 真的跑過的（有花費與當時的判斷）` +
        `，以及失敗的（首頁「連續失敗」的判斷要用）。`,
      confirmLabel: "清除",
      danger: true,
    });
    if (!ok) return;

    setBusy("clear");
    const res = await fetch("/api/pr-inbox/runs/clear", { method: "POST" });
    if (!res.ok) setError("清除失敗");
    setBusy(null);
    load();
  };

  const openLog = async (id: string) => {
    const res = await fetch(`/api/pr-inbox/runs/${id}/log`);
    const json = await res.json();
    if (res.ok) setLog(json);
    else setError(json.error ?? "讀不到 log");
  };

  const clearableCount = runs.filter(
    (r) => r.claude === null && r.status !== "aborted"
      && r.status !== "failed" && r.status !== "detect-failed"
  ).length;
  const totalCost = runs.reduce((n, r) => n + (r.claude?.costUsd ?? 0), 0);
  const aiRuns = runs.filter((r) => r.claude).length;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-6 sm:px-8 sm:py-10">
        <h1 className="text-2xl font-semibold text-fg">PR 巡邏</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
          排程只做<strong className="font-medium text-fg">偵測</strong>（
          <code className="text-xs">handle-pr-inbox.sh --json</code>，不花錢、不用 AI）；
          真的有待處理的 PR 才啟動 Claude 跑 <code className="text-xs">/handle-pr-inbox</code>。
          AI 執行期間會上鎖，排程碰到鎖就跳過 —— 同一批 PR 不會被 review 兩次。
        </p>

        {/* 巡邏範圍 —— 靜態清單，但要看得見，不然會誤以為「沒跳出來就是沒有」 */}
        <div className="mt-4 rounded-xl border border-line px-5 py-3.5 text-sm">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-medium text-fg">巡邏範圍</span>
            {scope?.repos.length ? (
              <span className="flex flex-wrap gap-1.5">
                {scope.repos.map((r) => (
                  <code
                    key={r}
                    className="rounded bg-surface-sunken px-1.5 py-0.5 text-xs text-fg"
                  >
                    {r}
                  </code>
                ))}
              </span>
            ) : (
              <span className="text-fg-muted">
                {scope?.configFound
                  ? "（清單是空的 —— 會掃所有與我有關的 PR）"
                  : "（讀不到 local.workspace.json）"}
              </span>
            )}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-fg-muted">
            這些 repo 底下<strong className="font-medium text-fg">所有</strong>開著的 PR
            都會進來（不必被指派），再聯集 GitHub 認定與我有關的：review-requested、
            reviewed-by、mentions、assignee。
            <strong className="font-medium text-fg">清單以外的 repo 只會靠後者帶到</strong>
            —— 去別的 repo 做事時要自己留意。清單是靜態的，改在{" "}
            <code className="text-xs">local.workspace.json</code> 的{" "}
            <code className="text-xs">.prReview.repos</code>（gitignored）。
          </p>
        </div>

        {error && (
          <div className="mt-6 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger-bg px-4 py-3 text-sm text-danger">
            <Icon name="alert" size={16} className="mt-0.5" />
            <span className="whitespace-pre-wrap">{error}</span>
          </div>
        )}
        {notice && (
          <div className="mt-6 flex items-start gap-2 rounded-lg border border-accent/50 bg-surface-selected px-4 py-3 text-sm text-accent">
            <Icon name="check" size={16} className="mt-0.5" />
            <span className="whitespace-pre-wrap">{notice}</span>
          </div>
        )}

        {/* 排程 */}
        <div className="mt-7 rounded-xl border border-line p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span
                className={`inline-flex h-2.5 w-2.5 rounded-full ${
                  watcher?.enabled ? "bg-ok" : "bg-fg-disabled"
                }`}
              />
              <h2 className="text-sm font-semibold text-fg">
                定期偵測 {watcher?.enabled ? "已啟用" : "未啟用"}
              </h2>
              {watcher?.enabled && (
                <span className="text-xs text-fg-subtle">
                  每 {Math.round(watcher.intervalSeconds / 60)} 分鐘
                  {watcher.nextRunAt && ` · 下次 ${fmtTime(watcher.nextRunAt)}`}
                </span>
              )}
              {watcher?.enabled && watcher.detectOnly && (
                <span className="rounded-full border border-accent/50 bg-surface-selected px-2 py-0.5 text-xs text-accent">
                  只偵測
                </span>
              )}
              {watcher?.enabled && watcher.quietNow && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-info/40 bg-surface-sunken px-2 py-0.5 text-xs text-info">
                  <Icon name="clock" size={12} /> 靜音中，暫停巡邏
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 text-sm text-fg-muted">
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
              <label className="inline-flex items-center gap-1.5 text-sm text-fg-muted">
                間隔
                <input
                  type="number"
                  min={1}
                  value={intervalMin}
                  onChange={(e) => setIntervalMin(Number(e.target.value))}
                  className="w-16 rounded-md border border-line-strong px-2 py-1 text-sm text-fg"
                />
                分
              </label>
              {watcher?.enabled ? (
                <>
                  <button
                    onClick={() => post("/api/pr-inbox/watcher", { enabled: true, intervalSeconds: intervalMin * 60, detectOnly }, "apply")}
                    disabled={!!busy}
                    className="rounded-lg border border-line px-3 py-2 text-sm text-fg hover:bg-surface-raised disabled:opacity-50"
                  >
                    套用間隔
                  </button>
                  <button
                    onClick={() => post("/api/pr-inbox/watcher", { enabled: false }, "disable")}
                    disabled={!!busy}
                    className="rounded-lg border border-line px-3 py-2 text-sm text-fg hover:bg-surface-raised disabled:opacity-50"
                  >
                    停用
                  </button>
                </>
              ) : (
                <button
                  onClick={() => post("/api/pr-inbox/watcher", { enabled: true, intervalSeconds: intervalMin * 60, detectOnly }, "enable")}
                  disabled={!!busy}
                  className="rounded-lg bg-control px-3.5 py-2 text-sm font-medium text-on-solid hover:bg-control/85 disabled:opacity-50"
                >
                  啟用排程
                </button>
              )}
            </div>
          </div>

          {/* 靜音時段 */}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-surface-raised/60 px-4 py-3 text-sm">
            <label className="inline-flex items-center gap-2 text-fg">
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
            <label className="inline-flex items-center gap-1.5 text-fg">
              <input
                type="number" min={0} max={23} value={quiet.startHour}
                onChange={(e) => setQuiet({ ...quiet, startHour: Number(e.target.value) })}
                className="w-14 rounded-md border border-line-strong px-2 py-1 text-sm text-fg"
              />
              點 到
              <input
                type="number" min={0} max={23} value={quiet.endHour}
                onChange={(e) => setQuiet({ ...quiet, endHour: Number(e.target.value) })}
                className="w-14 rounded-md border border-line-strong px-2 py-1 text-sm text-fg"
              />
              點
            </label>
            <button
              onClick={() => post("/api/pr-inbox/watcher",
                { enabled: !!watcher?.enabled, quietHours: quiet }, "quiet")}
              disabled={!!busy}
              className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs text-fg hover:bg-surface-raised disabled:opacity-50"
            >
              套用
            </button>
            <span className="text-xs text-fg-subtle">
              台北時間（不跟機器時區走）
              {watcher && ` · 現在 ${hh(watcher.taipeiHour)}`}
              {quiet.enabled && ` · ${hh(quiet.startHour)} 起暫停，${hh(quiet.endHour)} 恢復`}
            </span>
            <p className="w-full text-xs leading-relaxed text-fg-muted">
              只擋排程。手動觸發任何時間都能跑 —— 這條規則是「不要半夜自動去動別人的 PR」，
              不是「半夜不准用」。靜音期間不會留執行紀錄（一晚會堆出近百筆「因為半夜所以沒跑」）。
            </p>
          </div>

          {/* 送不送出 review 判定 */}
          <div className="mt-4 rounded-lg border border-line bg-surface-raised/60 px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-fg">AI 的 review 判定</span>
              <select
                value={verdict}
                onChange={(e) => {
                  const v = e.target.value as VerdictMode;
                  setVerdict(v);
                  post("/api/pr-inbox/watcher",
                    { enabled: !!watcher?.enabled, reviewVerdict: v },
                    "verdict");
                }}
                className="rounded-md border border-line-strong px-2 py-1 text-sm text-fg"
              >
                <option value="full">approve ＋ request changes 都可以（預設）</option>
                <option value="approve">只送 approve（要改的只留言）</option>
                <option value="off">只留言（不 approve、不 request changes）</option>
              </select>
              {verdict !== "off" && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-warn/40 bg-warn-bg px-2 py-0.5 text-xs text-warn">
                  <Icon name="alert" size={12} /> 會代表你對別人的 PR 表態
                </span>
              )}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-fg-muted">
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

          <p className="mt-3 text-xs leading-relaxed text-fg-subtle">
            排程掛在這個 web server 裡（設定寫進 <code>data/hub/pr-inbox-watch.json</code>，
            server 重開會自己接回去），所以 <strong className="text-fg-muted">web 沒開就不會巡邏</strong> ——
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
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-surface-raised px-4 py-3 text-sm">
              <Icon name={lock.alive ? "spinner" : "alert"} size={15}
                    className={lock.alive ? "animate-spin text-info" : "text-warn"} />
              {lock.alive ? (
                <span className="text-fg">
                  正在執行中（pid {lock.pid}{lock.runId ? `，run ${lock.runId}` : ""}）—— 排程這段時間會跳過
                </span>
              ) : (
                <>
                  <span className="text-fg">
                    殘留的鎖（pid {lock.pid} 已不在）。下一輪會自己回收，也可以手動清掉。
                  </span>
                  <button
                    onClick={() => post("/api/pr-inbox/unlock", {}, "unlock")}
                    disabled={!!busy}
                    className="ml-auto rounded-md border border-line bg-surface px-2.5 py-1 text-xs text-fg hover:bg-surface-raised"
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
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-sm text-fg hover:bg-surface-raised disabled:opacity-50"
          >
            <Icon name="search" size={15} /> 只偵測（不叫 AI）
          </button>
          <button
            onClick={() => trigger(false)}
            disabled={!!busy || (lock?.locked && lock.alive)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-control px-3.5 py-2 text-sm font-medium text-on-solid hover:bg-control/85 disabled:opacity-50"
          >
            <Icon name="play" size={15} /> 偵測並處理
          </button>
          <button
            onClick={load}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-fg hover:bg-surface-raised"
          >
            <Icon name="refresh" size={15} /> 重新載入
          </button>
        </div>

        {/* 執行紀錄 */}
        <div className="mt-9">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-fg">執行紀錄</h2>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-xs text-fg-subtle">
                <Icon name="coins" size={13} />
                {runs.length} 筆 · 其中 {aiRuns} 次叫了 AI · 累計 {fmtCost(totalCost)}
              </span>
              {clearableCount > 0 && (
                <button
                  onClick={clearRuns}
                  disabled={!!busy}
                  title="清掉沒有 AI 參與、也不是失敗的那些"
                  className="rounded-md border border-line px-2.5 py-1 text-xs text-fg-muted hover:bg-surface-raised disabled:opacity-50"
                >
                  清除 {clearableCount} 筆非 AI 紀錄
                </button>
              )}
            </div>
          </div>
          <p className="mt-1 text-xs text-fg-subtle">
            存在 <code>data/pr-inbox-runs/</code>（gitignored，不進版控）。
            自動清理：沒叫 AI 的留 7 天，派過 AI 的留 30 天。
          </p>

          {loading ? (
            <p className="mt-4 text-sm text-fg-subtle">載入中…</p>
          ) : runs.length === 0 ? (
            <p className="mt-4 rounded-xl border border-line px-5 py-6 text-sm text-fg-subtle">
              還沒有紀錄。按上面的「只偵測」跑一次看看。
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
              {runs.map((r) => {
                const st = STATUS[r.status] ?? {
                  label: r.status, icon: "clock" as IconName,
                  cls: "bg-surface-raised text-fg-muted border-line",
                };
                const open = expanded === r.id;
                return (
                  <li key={r.id}>
                    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <button
                        onClick={() => setExpanded(open ? null : r.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <Icon name={open ? "chevronDown" : "chevronRight"} size={14} className="text-fg-disabled" />
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${st.cls}`}>
                          <Icon name={st.icon} size={12} /> {st.label}
                        </span>
                        <span className="text-sm text-fg">{fmtTime(r.startedAt)}</span>
                        <span className="text-xs text-fg-subtle">
                          {r.trigger === "manual" ? "手動" : "排程"}
                        </span>
                        <span className="truncate text-xs text-fg-muted">
                          {r.prCount > 0 ? `${r.prCount} 筆待處理` : r.note}
                        </span>
                      </button>
                      {r.claude && (
                        <span className="flex items-center gap-1.5 text-xs text-fg-muted">
                          {/* 2026-09-21 前的紀錄沒有 engine 欄位，那時只有 claude */}
                          <span className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">
                            {r.engine ?? "claude"}
                          </span>
                          {/* codex 不回報金額與 turns，就不要擺一排問號 */}
                          {r.engine === "codex"
                            ? fmtDuration(r.claude.durationMs)
                            : `${fmtCost(r.claude.costUsd)} · ${r.claude.numTurns ?? "?"} turns · ${fmtDuration(r.claude.durationMs)}`}
                        </span>
                      )}
                      <button
                        onClick={() => removeRun(r)}
                        title="刪除這筆紀錄"
                        className="text-fg-disabled hover:text-danger"
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </div>

                    {open && (
                      <div className="border-t border-line bg-surface-raised/60 px-11 py-4 text-sm">
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-3">
                          <div><dt className="text-fg-subtle">run id</dt><dd className="font-mono text-fg">{r.id}</dd></div>
                          <div><dt className="text-fg-subtle">結束</dt><dd className="text-fg">{fmtTime(r.finishedAt)}</dd></div>
                          <div><dt className="text-fg-subtle">說明</dt><dd className="text-fg">{r.note || "—"}</dd></div>
                          <div>
                            <dt className="text-fg-subtle">判定模式</dt>
                            <dd className="text-fg">{r.verdictMode ?? "off"}</dd>
                          </div>
                          {r.claude && (
                            <>
                              <div><dt className="text-fg-subtle">花費</dt><dd className="text-fg">{fmtCost(r.claude.costUsd)}</dd></div>
                              <div><dt className="text-fg-subtle">耗時</dt><dd className="text-fg">{fmtDuration(r.claude.durationMs)}</dd></div>
                              <div><dt className="text-fg-subtle">turns</dt><dd className="text-fg">{r.claude.numTurns ?? "—"}</dd></div>
                              <div className="col-span-2 sm:col-span-3">
                                <dt className="text-fg-subtle">session</dt>
                                <dd className="font-mono text-[11px] text-fg-muted">{r.claude.sessionId ?? "—"}</dd>
                              </div>
                            </>
                          )}
                        </dl>

                        {r.prs.length > 0 && (
                          <ul className="mt-3 space-y-1.5">
                            {r.prs.map((p) => (
                              <li key={`${p.repo}#${p.number}`} className="flex items-start gap-2">
                                {p.priority && (
                                  <span className="mt-0.5 rounded bg-surface px-1.5 py-0.5 text-[11px] text-fg-muted ring-1 ring-line">
                                    {p.priority}
                                  </span>
                                )}
                                <a href={p.url} target="_blank" rel="noreferrer"
                                   className="min-w-0 text-xs text-fg hover:underline">
                                  <span className="font-mono text-fg-muted">
                                    {p.repo.split("/").pop()}#{p.number}
                                  </span>{" "}
                                  {p.title}
                                  {p.reason && <span className="text-fg-subtle">　—　{p.reason}</span>}
                                </a>
                              </li>
                            ))}
                          </ul>
                        )}

                        {r.claude?.resultText && (
                          <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-3 font-mono text-[11px] leading-relaxed text-fg ring-1 ring-line">
                            {r.claude.resultText}
                          </pre>
                        )}

                        {r.hasLog && (
                          <button
                            onClick={() => openLog(r.id)}
                            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-fg hover:bg-surface-raised"
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={() => setLog(null)}>
            <div
              className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-surface shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
                <h3 className="text-sm font-semibold text-fg">claude 原始輸出 · {log.id}</h3>
                <button onClick={() => setLog(null)} className="text-fg-subtle hover:text-fg">
                  <Icon name="x" size={18} />
                </button>
              </div>
              <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-5 font-mono text-[11px] leading-relaxed text-fg">
                {log.log}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
