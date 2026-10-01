/**
 * 讀狀態檔的唯一入口。跟 `stateWrite.ts` 對稱。
 *
 * **satellite 不自己抓第一類資料**（`docs/ideas/km-multi-machine.md` §2），所以
 * 它的 `data/hub/` 是空的。這支負責把那些讀取轉向 hub：
 *
 * ```
 * hub 擁有的檔 ＋ 這台是 satellite
 *   → GET <hubUrl>/api/state/<name>
 *       成功 → 存進 data/cache/ 並回傳
 *       失敗 → 回傳 data/cache/ 那份（hub 不在時看得到上次的資料）
 * 其餘（machine 擁有的、或這台是 hub）
 *   → 直接讀磁碟
 * ```
 *
 * ⚠️ **拿到的資料可能是舊的，而這支不會告訴你。** 「舊到什麼程度」是畫面要回答的
 * 問題，走 `lib/hubStatus.ts`（一次查詢回答整頁），不要讓每個呼叫端各自處理 ——
 * 那會變成 20 個地方各寫一次「可能過期」的判斷。
 */

import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { kmConfig } from "@/lib/kmRole";
import { cachePath, ownerOfPath } from "@/lib/statePaths";
import { noteHubFailure, noteHubSuccess } from "@/lib/hubStatus";

/** hub 慢或不在的時候不要把整頁拖住。本機區網 ＋ SSH 轉發，5 秒非常寬裕 */
const HUB_TIMEOUT_MS = 5_000;

/**
 * 同一次 render 會有好幾個地方讀同一份狀態（例如 work-index）。
 * 短命的 memo 讓那些合併成一次請求；放 `globalThis` 是為了 dev 模式的 HMR。
 */
const MEMO_MS = 2_000;
const g = globalThis as unknown as { __kmStateMemo?: Map<string, { at: number; text: string | null }> };
function memo(): Map<string, { at: number; text: string | null }> {
  g.__kmStateMemo ??= new Map();
  return g.__kmStateMemo;
}

async function readDisk(filePath: string): Promise<string | null> {
  return readFile(filePath, "utf8").catch(() => null);
}

export async function readStateFile(filePath: string): Promise<string | null> {
  const cfg = kmConfig();
  if (ownerOfPath(filePath) !== "hub" || cfg?.role !== "satellite" || !cfg.hubUrl) {
    return readDisk(filePath);
  }

  const name = path.basename(filePath);
  const hit = memo().get(name);
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.text;

  const cache = cachePath(name);
  let text: string | null;
  try {
    const res = await fetch(`${cfg.hubUrl}/api/state/${encodeURIComponent(name)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(HUB_TIMEOUT_MS),
    });
    // 404 ＝ hub 上也沒有這個檔（還沒產生過），那不是失敗，是「目前沒有資料」
    if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
    text = res.status === 404 ? null : await res.text();
    noteHubSuccess();
    await mkdir(path.dirname(cache), { recursive: true }).catch(() => undefined);
    if (text !== null) await writeFile(cache, text, "utf8").catch(() => undefined);
  } catch (e) {
    noteHubFailure((e as Error).message);
    text = await readDisk(cache);
  }
  memo().set(name, { at: Date.now(), text });
  return text;
}
