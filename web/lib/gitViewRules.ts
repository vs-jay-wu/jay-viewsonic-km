/**
 * 唯讀的 repo 檢視：解析 git 輸出、算 commit graph 的走線。
 *
 * 純函式（客戶端要用，不能帶 fs/promises）。
 *
 * **這個功能刻意只有兩個會改到東西的動作：fetch 與 push。**
 * 不做 checkout／merge／rebase／branch 刪除 —— 那些由 AI 在 CLI 做，
 * km 這邊只負責「不用開 IDE 也看得到」（Jay 2026-09-16）。
 */

export interface Commit {
  sha: string;
  shortSha: string;
  parents: string[];
  author: string;
  /** ISO 8601 */
  date: string;
  subject: string;
  /** `git log --format=%D` 的裝飾：分支、tag、HEAD */
  refs: RefChip[];
}

/**
 * 「未提交」那一列要畫在第幾列**之前**。
 *
 * ⚠️ **不是固定第 0 列。** 未提交的改動長在 **HEAD** 上，不是長在清單最上面那個
 * commit 上 —— 看「全部分支」時最上面通常是別人的 `origin/main`，而本機 HEAD 可能
 * 落後好幾百個 commit（Jay 2026-09-30 在 edu-vbo 上看到：HEAD 落後 origin/main
 * 202 個，未提交那一列卻畫在 origin/main 上面，看起來像是那條線上的改動）。
 *
 * HEAD 不在這批 commit 裡（切到別條分支、只載入一部分）就回 0 —— 畫在最上面，
 * 跟以前一樣；呼叫端會另外標示「HEAD 不在畫面上」。
 */
export function wipRowIndex(commits: { sha: string }[], headSha: string | null): number {
  if (!headSha) return 0;
  const i = commits.findIndex((c) => c.sha === headSha);
  return i < 0 ? 0 : i;
}

export interface RefChip {
  name: string;
  kind: "head" | "local" | "remote" | "tag";
}

export interface Branch {
  /** 短名（`main`、`origin/main`） */
  name: string;
  /** 完整 ref（`refs/heads/main`） */
  ref: string;
  remote: boolean;
  /** 本地分支追蹤的上游（沒有就是 null） */
  upstream: string | null;
  ahead: number;
  behind: number;
  sha: string;
  subject: string;
  date: string;
  /** 這條分支現在被哪個 worktree 簽出（`git branch` 的 `+`／`*`）；沒有就是 null */
  checkedOutAt: string | null;
}

export interface RepoHead {
  /** 分支名；detached HEAD 是 null */
  branch: string | null;
  sha: string;
  detached: boolean;
}

// ─── 解析 ────────────────────────────────────────────────────────────────────

/** 欄位分隔用 US(0x1f)、紀錄分隔用 RS(0x1e) —— commit 訊息裡不會出現 */
export const LOG_FORMAT = "%H%x1f%P%x1f%an%x1f%aI%x1f%D%x1f%s%x1e";

/**
 * `%D` 的裝飾字串 → 分支／tag 標籤。
 *
 * **要拿實際的 remote 名單來判斷遠端**，不能看有沒有斜線 —— 這個工作區的本地分支
 * 幾乎都有斜線（`Jay/VB-1945`、`jay/vb-2192-…`），用斜線判斷會把它們全部誤標成遠端。
 */
export function parseRefs(decoration: string, remotes: string[] = ["origin"]): RefChip[] {
  if (!decoration.trim()) return [];
  return decoration
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((raw): RefChip => {
      // `HEAD -> main` 是「HEAD 指著 main」，兩件事要分開標
      if (raw.startsWith("HEAD -> ")) return { name: raw.slice(8), kind: "head" };
      if (raw === "HEAD") return { name: "HEAD", kind: "head" };
      if (raw.startsWith("tag: ")) return { name: raw.slice(5), kind: "tag" };
      if (remotes.some((r) => raw === r || raw.startsWith(`${r}/`))) {
        return { name: raw, kind: "remote" };
      }
      return { name: raw, kind: "local" };
    });
}

export function parseCommits(stdout: string, remotes: string[] = ["origin"]): Commit[] {
  return stdout
    .split("\x1e")
    .map((r) => r.replace(/^\n+/, ""))
    .filter((r) => r.trim())
    .map((r) => {
      const [sha = "", parents = "", author = "", date = "", decoration = "", subject = ""] =
        r.split("\x1f");
      return {
        sha,
        shortSha: sha.slice(0, 8),
        parents: parents.split(" ").filter(Boolean),
        author,
        date,
        subject,
        refs: parseRefs(decoration, remotes),
      };
    })
    .filter((c) => c.sha);
}

/**
 * `git for-each-ref` 的輸出（欄位用 US 分隔）→ 分支清單。
 *
 * ahead/behind 從 `%(upstream:track)` 來，長相是 `[ahead 2, behind 1]`；
 * **沒有上游時整欄是空的**，那跟「0/0」不一樣，UI 要分得出來。
 */
export function parseBranches(stdout: string, checkedOut: Map<string, string>): Branch[] {
  const out: Branch[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    const [ref = "", name = "", upstream = "", track = "", sha = "", date = "", subject = ""] =
      line.split("\x1f");
    // `refs/remotes/<remote>/HEAD` 是「遠端的預設分支」這個符號連結，不是分支本身。
    // 不濾掉的話清單裡會多一個叫 `origin` 的東西，看起來像一條分支
    if (/^refs\/remotes\/[^/]+\/HEAD$/.test(ref)) continue;
    const ahead = Number(/ahead (\d+)/.exec(track)?.[1] ?? 0);
    const behind = Number(/behind (\d+)/.exec(track)?.[1] ?? 0);
    out.push({
      ref,
      name,
      remote: ref.startsWith("refs/remotes/"),
      upstream: upstream || null,
      ahead,
      behind,
      sha,
      date,
      subject,
      checkedOutAt: checkedOut.get(name) ?? null,
    });
  }
  return out;
}

/** 分支排序：被簽出的最前、然後本地、再來遠端；同組照最後 commit 時間 */
export function sortBranches(branches: Branch[]): Branch[] {
  return [...branches].sort((a, b) => {
    const rank = (x: Branch) => (x.checkedOutAt ? 0 : x.remote ? 2 : 1);
    return rank(a) - rank(b) || (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
  });
}

// ─── commit graph 的走線 ─────────────────────────────────────────────────────

export interface GraphLink {
  from: number;
  to: number;
}

export interface GraphRow {
  /** 這個 commit 的點畫在第幾條 lane */
  lane: number;
  /** 上半格要畫的線（從上一列的 lane 位置連到這一列） */
  up: GraphLink[];
  /** 下半格要畫的線（連到下一列的 lane 位置） */
  down: GraphLink[];
}

export interface Graph {
  rows: GraphRow[];
  /** 最寬用到幾條 lane —— 畫布寬度 */
  width: number;
}

function firstFree(lanes: (string | null)[]): number {
  const i = lanes.indexOf(null);
  return i === -1 ? lanes.length : i;
}

/**
 * 算出每個 commit 的 lane 與連線。
 *
 * 做法是最常見的那種：一條 lane 記著「它接下來在等哪個 commit」。
 * **lane 不做壓縮**（空掉的 lane 留著當洞，之後可以被重用）——
 * 壓縮會讓上下兩列的同一條線左右跳動，看起來像換了一條分支。
 *
 * 前提是 commit 已經照 `git log` 的順序（拓樸／時間）排好；
 * 先出現的一定不是後出現者的祖先。
 */
export function layoutGraph(commits: Commit[]): Graph {
  const lanes: (string | null)[] = [];
  const rows: GraphRow[] = [];
  let width = 0;

  for (const c of commits) {
    const before = [...lanes];
    let lane = before.indexOf(c.sha);
    if (lane === -1) {
      // 沒有人在等它 —— 新的分支頭（或第一列）
      lane = firstFree(lanes);
      lanes[lane] = c.sha;
    }

    // 上半格：所有在等這個 commit 的 lane 都收束到它的點上；其餘原地往下
    const up: GraphLink[] = [];
    for (let i = 0; i < before.length; i++) {
      if (before[i] === null) continue;
      up.push({ from: i, to: before[i] === c.sha ? lane : i });
    }

    // 這條 lane 接到第一個 parent；其餘 parent 各自找 lane（已經有人等就共用）
    lanes[lane] = c.parents[0] ?? null;
    for (const p of c.parents.slice(1)) {
      if (lanes.includes(p)) continue;
      const j = firstFree(lanes);
      lanes[j] = p;
    }
    // 收束掉重複：同一個 parent 被兩條 lane 等著時只留最左邊那條
    for (let i = lanes.length - 1; i >= 0; i--) {
      if (lanes[i] !== null && lanes.indexOf(lanes[i]) !== i) lanes[i] = null;
    }
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();

    // 下半格。用「**這條 lane 的 sha 跑到哪裡去了**」來算，不要用「是不是 parent」去猜 ——
    // 那樣會漏掉兩種線，兩種都造成主線斷一截（Jay 2026-09-16 兩次回報）：
    //
    //   ① lane 0 在等 C、而這個 commit 的 parent 也是 C：直線與斜線**都要**畫，
    //      二選一的話直線就沒了。
    //   ② 兩條 lane 收束成一條（lane 0 的新 parent 正好是 lane 1 在等的 sha）：
    //      被收掉的那條 lane 得有一段線斜過去，否則它就那樣消失。
    const down: GraphLink[] = [];
    // ① 每條原本就存在的 lane：它的 sha 現在在哪一格，就連到哪一格
    for (let j = 0; j < before.length; j++) {
      const v = before[j];
      if (v === null || v === c.sha) continue; // 等這個 commit 的線在上半格已經收束了
      const k = lanes.indexOf(v);
      if (k !== -1) down.push({ from: j, to: k });
    }
    // ② 這個 commit 到它每個 parent 的線（從它的點拉出去）
    for (const p of c.parents) {
      const k = lanes.indexOf(p);
      if (k !== -1) down.push({ from: lane, to: k });
    }

    rows.push({ lane, up, down });
    width = Math.max(width, before.length, lanes.length, lane + 1);
  }

  return { rows, width };
}

/** lane 的顏色。**同一條 lane 一直是同一個顏色**，眼睛才追得下去 */
export const LANE_COLORS = [
  "#2563eb", "#16a34a", "#d97706", "#db2777", "#7c3aed",
  "#0891b2", "#dc2626", "#65a30d",
];

export function laneColor(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length];
}

// ─── fetch 的輸出 ───────────────────────────────────────────────────────────

export interface FetchRefChange {
  /** 遠端追蹤分支的名字（`origin/master`） */
  ref: string;
  kind: "updated" | "created" | "deleted" | "tag" | "forced" | "rejected";
  /** `updated`／`forced` 才有：舊的與新的 revision，可以拿去數 commit 數 */
  range?: { from: string; to: string };
}

/**
 * 解析 `git fetch` 的輸出。
 *
 * 一行長這樣（第一個字元是旗標，`->` 左邊是來源、右邊是本地的遠端追蹤分支）：
 *
 * ```
 *  - [deleted]         (none)     -> origin/Jay/VSFT-9785-spike-classswift-fusion
 *  * [new branch]      jay/x      -> origin/jay/x
 *    ab3af7d54..6dbcc8516  master -> origin/master
 *  + 1234abc...5678def  b         -> origin/b  (forced update)
 * ```
 *
 * **不要用固定欄寬切**：summary 欄裡有空白（`[new branch]`），而且分支名長度差很多。
 * 先用 ` -> ` 切兩半，左半的最後一個 token 才是來源。
 */
export function parseFetchOutput(stdout: string): FetchRefChange[] {
  const out: FetchRefChange[] = [];
  for (const raw of stdout.split("\n")) {
    const line = raw.replace(/\r$/, "");
    const arrow = line.indexOf(" -> ");
    if (arrow === -1) continue; // `From <url>` 這種標題行
    const left = line.slice(0, arrow);
    const ref = line.slice(arrow + 4).trim().split(/\s+/)[0];
    if (!ref) continue;
    const parts = left.trim().split(/\s+/);
    const summary = parts.slice(0, -1).join(" ");
    const forced = line.includes("(forced update)") || left.trimStart().startsWith("+");

    const range = /([0-9a-f]{4,40})\.\.\.?([0-9a-f]{4,40})/.exec(summary);
    if (summary.includes("[deleted]")) out.push({ ref, kind: "deleted" });
    else if (summary.includes("[new tag]")) out.push({ ref, kind: "tag" });
    else if (summary.includes("[new branch]") || summary.includes("[new ref]")) {
      out.push({ ref, kind: "created" });
    } else if (summary.includes("[rejected]")) out.push({ ref, kind: "rejected" });
    else if (range) {
      out.push({
        ref,
        kind: forced ? "forced" : "updated",
        range: { from: range[1], to: range[2] },
      });
    }
  }
  return out;
}

/**
 * 把 fetch 的結果講成一句話。
 *
 * `commitCounts` 是各個更新的 ref 抓到幾個新 commit（呼叫端用 `rev-list --count` 算）。
 * **原始輸出不要整段倒進通知裡**（Jay 2026-09-17：「顯示太多資訊」）——
 * 那是給終端機看的，在角落的小卡片裡只會洗版。
 */
export function describeFetch(
  changes: FetchRefChange[],
  commitCounts: Record<string, number> = {}
): { text: string; detail?: string } {
  if (!changes.length) return { text: "已是最新" };

  const by = (k: FetchRefChange["kind"]) => changes.filter((c) => c.kind === k);
  const updated = [...by("updated"), ...by("forced")];
  const commits = updated.reduce((n, c) => n + (commitCounts[c.ref] ?? 0), 0);

  const bits: string[] = [];
  if (updated.length) {
    bits.push(commits > 0 ? `${updated.length} 條分支更新（${commits} 個 commit）` : `${updated.length} 條分支更新`);
  }
  if (by("created").length) bits.push(`新增 ${by("created").length} 條`);
  if (by("deleted").length) bits.push(`刪掉 ${by("deleted").length} 條`);
  if (by("tag").length) bits.push(`${by("tag").length} 個 tag`);
  if (by("forced").length) bits.push(`${by("forced").length} 條被強制覆寫`);
  if (by("rejected").length) bits.push(`${by("rejected").length} 條被拒絕`);

  // 細節只列更新的分支（那是真的會想知道「哪一條」的），最多三條
  const named = updated
    .slice(0, 3)
    .map((c) => `${short(c.ref)}${commitCounts[c.ref] ? ` +${commitCounts[c.ref]}` : ""}`);
  const more = updated.length - named.length;

  return {
    text: bits.join("、"),
    detail: named.length ? named.join("、") + (more > 0 ? ` …還有 ${more} 條` : "") : undefined,
  };
}

/** `origin/Jay/VB-2193-xxx` → `Jay/VB-2193-xxx`（remote 前綴在同一個 repo 裡是重複資訊） */
function short(ref: string): string {
  const i = ref.indexOf("/");
  return i === -1 ? ref : ref.slice(i + 1);
}

// ─── push 的判準 ─────────────────────────────────────────────────────────────

export interface PushPlan {
  /** 能不能推 */
  ok: boolean;
  /** 不能推的原因，或推之前要讓人看到的說明 */
  reason: string;
  /** 要送出去的 refspec（一律不 force、不刪除） */
  refspec?: string;
  remote?: string;
}

/**
 * 這條分支現在能不能 push，以及要送什麼。
 *
 * 規則刻意保守（Jay 2026-09-16：唯一的行為只有 push 與 fetch）：
 * - **只推本地分支**，遠端追蹤分支不是能推的東西
 * - **落後就不推**：那需要先 rebase／merge，而那是 AI 在 CLI 做的事，
 *   在這裡按下去只會得到一個被拒絕的 non-fast-forward（或更糟，讓人想找 force）
 * - 沒有上游時照樣可以推，用同名的 refspec（**不自動 `--set-upstream`**，
 *   那會改設定，超出「唯讀」的範圍）
 */
export function pushPlan(branch: Branch, remote = "origin"): PushPlan {
  if (branch.remote) return { ok: false, reason: "這是遠端追蹤分支，不能推" };
  if (branch.upstream && branch.ahead === 0) {
    return { ok: false, reason: "沒有領先上游，沒東西可推" };
  }
  if (branch.behind > 0) {
    return {
      ok: false,
      reason: `落後上游 ${branch.behind} 個 commit —— 先在 CLI 把它接上（rebase／merge）再推`,
    };
  }
  const r = branch.upstream?.includes("/") ? branch.upstream.split("/")[0] : remote;
  return {
    ok: true,
    reason: branch.upstream
      ? `把 ${branch.name} 的 ${branch.ahead} 個 commit 推到 ${branch.upstream}`
      : `${branch.name} 還沒有上游，會在 ${r} 建立同名分支`,
    refspec: `refs/heads/${branch.name}:refs/heads/${branch.name}`,
    remote: r,
  };
}

/**
 * 把新載入的一頁 commit 併進已經顯示的那串。
 *
 * **一定要以 sha 去重**：分頁是 `git log --skip=N` 算的位移，翻頁之間若有新 commit
 * 進來（fetch、或自己 commit 一顆），第二頁會整體往後位移，邊界那幾顆就會重複出現。
 * 重複的 commit 進到 `layoutGraph` 不會報錯 —— 它會替同一個 sha 開第二條 lane，
 * 畫出一條憑空岔出去又接回來的線，看起來像真的有那樣一條分支。
 *
 * 保留**先出現**的那一份：`layoutGraph` 是單向前掃，已經畫出來的列只依賴它前面的
 * commit，所以維持既有順序才不會讓上面的線跳動。
 */
export function mergeCommitPage(current: Commit[], incoming: Commit[]): Commit[] {
  const seen = new Set(current.map((c) => c.sha));
  const added = incoming.filter((c) => !seen.has(c.sha));
  return added.length ? [...current, ...added] : current;
}

/**
 * 自動更新時把**重抓的第一頁**併回已經顯示的那串。
 *
 * 跟 `mergeCommitPage`（往後接下一頁）方向相反：新的 commit 在**最上面**，
 * 而且第一頁是那一段的真相 —— amend／rebase 之後舊的 tip 已經不存在，
 * 直接把新的接在前面會留下一顆到不了的幽靈 commit。
 *
 * 做法是拿第一頁的**最後一顆**當錨點：
 * - 錨點還在原本那串裡 → 錨點以下（你已經捲出來的那幾頁）原封不動留著，
 *   上面換成新的第一頁。**這就是「自動更新不該害你重捲一次」的保證。**
 * - 錨點不在了（整段被改寫、或離線太久） → 只留新的那一頁，分頁游標跟著重來。
 *   這時寧可讓人重捲，也不要把兩棵不同的 graph 併在一起。
 */
export function refreshCommits(current: Commit[], fresh: Commit[]): Commit[] {
  if (!fresh.length) return current;
  const anchor = fresh[fresh.length - 1].sha;
  const at = current.findIndex((c) => c.sha === anchor);
  return at === -1 ? fresh : [...fresh, ...current.slice(at + 1)];
}
