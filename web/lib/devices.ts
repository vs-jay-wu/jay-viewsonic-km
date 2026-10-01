/**
 * 裝置配對的儲存（碰檔案系統的那一半，判準在 `deviceRules.ts`）。
 *
 * 存在 `data/hub/devices.json` —— **hub 擁有**，所以 satellite 寫不進去
 * （`writeStateFile` 的守衛，見 `lib/stateWrite.ts`）。這是對的：核可裝置是
 * hub 的職權，satellite 不該有自己的一份信任清單。
 */

import { readFile } from "fs/promises";
import { randomBytes, randomInt } from "crypto";
import { statePath } from "@/lib/statePaths";
import { writeStateFile } from "@/lib/stateWrite";
import { EMPTY_STORE, prunePending, type DeviceStore } from "@/lib/deviceRules";

/**
 * ⚠️ 這份**一律讀本機磁碟**，不走 `readStateFile`。它是「這台自己認得哪些裝置」，
 * 而 `proxy.ts` 的守衛（`accessConfig`）也是直接讀同一個檔 —— 兩邊來源不一致的話，
 * 會出現「清單上看得到、但守衛不認得」這種極難查的狀況。
 */
const FILE = statePath("devices.json");

export async function readStore(): Promise<DeviceStore> {
  const raw = await readFile(FILE, "utf8").catch(() => null);
  if (!raw) return EMPTY_STORE;
  try {
    const s = JSON.parse(raw) as Partial<DeviceStore>;
    return { pending: s.pending ?? [], devices: s.devices ?? [] };
  } catch {
    return EMPTY_STORE;
  }
}

export async function writeStore(store: DeviceStore): Promise<void> {
  await writeStateFile(FILE, JSON.stringify(prunePending(store, Date.now()), null, 2) + "\n");
}

/** 給人看的 6 位數。`randomInt` 不是 `Math.random()` —— 這串會顯示在畫面上當識別 */
export function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** 取件憑證與正式 token 都要是真亂數 */
export function newSecret(): string {
  return randomBytes(32).toString("hex");
}
