/**
 * 寫狀態檔的唯一入口。**所有對 `data/` 的寫入都走這裡。**
 *
 * 它做兩件事：
 *
 * 1. **守衛**：satellite 不得寫 hub 擁有的狀態。這讓
 *    「B 不能主動更新 GitHub／Jira 那類資料」（Jay 2026-09-30）變成**程式擋得住**
 *    的事，而不是要記住的規則 —— 規則只對讀到它的人有效，守衛對所有程式碼有效。
 * 2. 順手把目錄建好，省掉每個呼叫端各自 `mkdir`。
 *
 * 設計見 `docs/ideas/km-multi-machine.md` §5。
 */

import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { kmConfig } from "@/lib/kmRole";
import { hubWriteRefusal } from "@/lib/kmRoleRules";
import { cachePath, ownerOfPath } from "@/lib/statePaths";

/**
 * 這個路徑現在能不能**就地**寫。不能就回一句話說明為什麼。
 *
 * 角色**沒設定**時放行：那是還沒跑過多機器設定的單機狀態，擋下來只會讓既有
 * 使用者的 km 整個壞掉，而單機本來就沒有這個問題。
 *
 * satellite ＋ hub 擁有的狀態 → 不是「不能寫」，而是**要寫到別的地方**（轉送給 hub），
 * 見 `writeStateFile`。只有連 hub 都不知道是誰的時候才真的拒絕。
 */
export function stateWriteRefusal(filePath: string): string | null {
  if (ownerOfPath(filePath) !== "hub") return null;
  const cfg = kmConfig();
  if (!cfg || cfg.role === "hub") return null;
  if (cfg.hubUrl) return null; // 轉送得出去
  return hubWriteRefusal(path.basename(filePath), cfg.machine.name);
}

export async function writeStateFile(filePath: string, contents: string): Promise<void> {
  const cfg = kmConfig();
  const owner = ownerOfPath(filePath);

  /*
   * satellite 改 hub 擁有的狀態（pin、便條）→ 轉送給 hub。
   *
   * pin 歸 hub 就是為了「在 A pin 的在 B 看得到」（Jay 2026-09-30），所以 satellite
   * 在本機寫一份是**錯的**：那份誰也看不到，而且下一次讀取會被 hub 的版本蓋掉，
   * 看起來就像「pin 了但沒反應」。
   */
  if (owner === "hub" && cfg?.role === "satellite" && cfg.hubUrl) {
    const name = path.basename(filePath);
    const res = await fetch(`${cfg.hubUrl}/api/state/${encodeURIComponent(name)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: contents,
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`寫不進 hub（${name}）：HTTP ${res.status}`);
    // 本機的快取跟著更新，否則畫面要等 memo 過期才看得到自己剛做的事
    await mkdir(path.dirname(cachePath(name)), { recursive: true }).catch(() => undefined);
    await writeFile(cachePath(name), contents, "utf8").catch(() => undefined);
    return;
  }

  const refusal = stateWriteRefusal(filePath);
  if (refusal) throw new Error(refusal);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
}
