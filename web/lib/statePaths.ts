/**
 * `data/` 底下的狀態檔要放哪一塊（純規則，有測試）。
 *
 * 多機器（hub / satellite）的地基，設計見
 * `docs/ideas/km-multi-machine.md` §5。三塊的差別是**誰擁有它**：
 *
 * | 目錄 | 誰寫 | 換 hub 時 |
 * |---|---|---|
 * | `data/hub/` | 只有 hub | **跟著搬** —— 換 hub 就是搬這個目錄 |
 * | `data/machine/` | 每台自己 | 留在原地（描述的是那台的磁碟） |
 * | `data/cache/` | satellite 快取的 hub 資料 | 直接丟掉，隨時能重抓 |
 *
 * ⚠️ **不要自己組 `data/...` 的路徑**，一律走 `statePath()`。沒登記歸屬的名字
 * 會**丟例外**，這是刻意的 —— 新增狀態檔時被迫先回答「這東西屬於誰」，
 * 而不是先寫完才發現它在 B 上會被覆蓋。
 *
 * （`data/teams.db` 與 `data/repos-overview.json` 是**進版控**的，靠 git 同步，
 * 不歸這裡管。）
 */

import { repoPath } from "@/lib/repo";

export type StateOwner = "hub" | "machine" | "cache";

/**
 * 每個狀態檔的歸屬。**這是唯一真相**：執行期與遷移腳本都讀它。
 *
 * 判準：
 * - **遠端來的資料、巡邏狀態、你的偏好** → `hub`。偏好歸 hub 是因為在 A 上 pin 的
 *   東西要在 B 上看得到（Jay 2026-09-30）。
 * - **描述「這台機器的磁碟／終端機」的** → `machine`。
 * - 同一個功能的兩半可能歸屬不同：`repo-sync-config.json`（要同步哪些 org，共用）
 *   是 hub，`repo-sync.json`（這台抓了什麼）是 machine。
 */
export const STATE_OWNER: Record<string, StateOwner> = {
  // ── hub：遠端資料與巡邏狀態 ───────────────────────────────────────
  "my-prs.json": "hub",
  "my-prs-config.json": "hub",
  "my-prs-events.json": "hub",
  "my-tickets.json": "hub",
  "my-tickets-config.json": "hub",
  "vb-bugs.json": "hub",
  "vb-bugs-config.json": "hub",
  "pr-inbox-watch.json": "hub",
  "pr-inbox-handled.json": "hub",

  "engine-health.json": "hub",
  "work-index.json": "hub",
  "work-lines.json": "hub",
  // repo 的事實，每台機器看到的都一樣
  "repo-first-commit.json": "hub",
  "repo-moves.jsonl": "hub",
  "repo-sync-config.json": "hub",
  // 已核可的機器與待核可的配對請求。核可是 hub 的職權，satellite 不該有自己一份
  "devices.json": "hub",
  // 各機器的心跳與它們推上來的 session 清單（`machineRules.ts`）
  "machines.json": "hub",

  // ── hub：偏好（pin 與便條）─────────────────────────────────────────
  "changes-pinned.json": "hub",
  "git-pinned.json": "hub",
  "docs-pins.json": "hub",
  "session-pins.json": "hub",
  "ticket-pins.json": "hub",
  "note.json": "hub",

  // ── machine：這台的磁碟與終端機 ──────────────────────────────────
  "changes-snapshot.json": "machine",
  "build-dirs.json": "machine",
  "orca-sessions.json": "machine",
  "orca-presence.json": "machine",
  "session-meta-cache.json": "machine",
  "repo-sync.json": "machine",
  // 深淺色主題這類視覺設定跟著螢幕環境走，在 B 上調不該改到 A（Jay 2026-09-30）
  "ui-settings.json": "machine",
  // 上次連上 hub 是什麼時候。描述的是「這台跟 hub 的關係」，所以歸 machine
  "hub-status.json": "machine",
  /*
   * ⚠️ health 是 **machine** 擁有的，不是 hub。它記的是「**這台**的排程跑得怎樣」。
   * 2026-10-01 歸 hub 時實際出事：satellite 上一次失敗的紀錄被轉送到 hub，
   * hub 的首頁就跳出一個不是它自己的警告（而且訊息是「缺少 ATLASSIAN_API_TOKEN」，
   * 在 hub 上完全看不懂 —— hub 的 .env 明明有）。
   */
  "health.json": "machine",
  // 上傳到 Jira 前的暫存圖檔。程式裡沒有任何引用，是人／agent 手動放的
  "jira-upload": "machine",
};

export function stateDir(owner: StateOwner): string {
  return repoPath("data", owner);
}

/**
 * 狀態檔的完整路徑。`name` 必須登記在 `STATE_OWNER`，否則丟例外。
 *
 * 目錄型的（`jira-upload`）可以再接子路徑：`statePath("jira-upload", "VB-2413", "a.png")`。
 */
export function statePath(name: string, ...rest: string[]): string {
  const owner = STATE_OWNER[name];
  if (!owner) {
    throw new Error(
      `未登記歸屬的狀態檔「${name}」：先去 lib/statePaths.ts 的 STATE_OWNER 決定它屬於 hub / machine / cache`,
    );
  }
  return repoPath("data", owner, name, ...rest);
}

/** satellite 快取 hub 資料用。快取可以隨時丟掉，所以不需要事先登記 */
export function cachePath(name: string, ...rest: string[]): string {
  return repoPath("data", "cache", name, ...rest);
}

/**
 * 從完整路徑反推它屬於哪一塊。不在 `data/<owner>/` 底下就回 null。
 *
 * 用路徑反推而不是再傳一次名字：寫入端手上有的就是路徑常數
 * （`const FILE = statePath("health.json")`），再要它複述一次名字必然會脫鉤。
 */
export function ownerOfPath(filePath: string): StateOwner | null {
  const parts = filePath.split("/");
  const i = parts.lastIndexOf("data");
  const owner = i >= 0 ? parts[i + 1] : undefined;
  return owner === "hub" || owner === "machine" || owner === "cache" ? owner : null;
}
