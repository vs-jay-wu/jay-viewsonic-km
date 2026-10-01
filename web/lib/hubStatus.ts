/**
 * 「hub 現在連得上嗎、上次成功是什麼時候」。
 *
 * 一次查詢回答整頁，而不是讓每個讀取各自回報 —— 畫面要的是**一條警告列**
 * （`docs/ideas/km-multi-machine.md` §10），不是 20 個地方各自標「可能過期」。
 *
 * 狀態放 `globalThis`（HMR 安全）＋ 落一份到 `data/machine/`，這樣 server 重開
 * 之後「上次連上 hub 是什麼時候」不會歸零 —— 那個時間戳正是使用者要判斷
 * 「我看到的資料有多舊」的依據。
 */

import { readFileSync, writeFileSync } from "fs";
import { statePath } from "@/lib/statePaths";

export interface HubStatus {
  /** 最近一次成功取得 hub 資料的時間 */
  lastOkAt: string | null;
  /** 最近一次失敗，與原因 */
  lastFailAt: string | null;
  lastError: string | null;
  /** 最近一次嘗試是成功還是失敗 */
  ok: boolean;
}

const FILE = () => statePath("hub-status.json");
const g = globalThis as unknown as { __kmHubStatus?: HubStatus };

function load(): HubStatus {
  if (g.__kmHubStatus) return g.__kmHubStatus;
  let s: HubStatus = { lastOkAt: null, lastFailAt: null, lastError: null, ok: false };
  try {
    s = { ...s, ...(JSON.parse(readFileSync(FILE(), "utf8")) as Partial<HubStatus>) };
  } catch {
    /* 沒有就用預設 */
  }
  g.__kmHubStatus = s;
  return s;
}

function save(s: HubStatus): void {
  g.__kmHubStatus = s;
  // machine 擁有的檔，不會被寫入守衛擋掉；寫失敗不影響功能，所以不往外丟
  try {
    writeFileSync(FILE(), JSON.stringify(s, null, 2) + "\n", "utf8");
  } catch {
    /* 落地失敗就只留記憶體那份 */
  }
}

export function noteHubSuccess(): void {
  save({ ...load(), lastOkAt: new Date().toISOString(), ok: true, lastError: null });
}

export function noteHubFailure(reason: string): void {
  save({ ...load(), lastFailAt: new Date().toISOString(), ok: false, lastError: reason });
}

export function hubStatus(): HubStatus {
  return load();
}
