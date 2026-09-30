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
import { ownerOfPath } from "@/lib/statePaths";

/**
 * 這個路徑現在能不能寫。不能寫就回一句話說明為什麼（可以直接丟出去給人看）。
 *
 * 角色**沒設定**時放行：那是還沒跑過多機器設定的單機狀態，擋下來只會讓既有
 * 使用者的 km 整個壞掉，而單機本來就沒有這個問題。要擋的是「明確宣告自己是
 * satellite、卻在寫 hub 的東西」。
 */
export function stateWriteRefusal(filePath: string): string | null {
  if (ownerOfPath(filePath) !== "hub") return null;
  const cfg = kmConfig();
  if (!cfg || cfg.role === "hub") return null;
  return hubWriteRefusal(path.basename(filePath), cfg.machine.name);
}

export async function writeStateFile(filePath: string, contents: string): Promise<void> {
  const refusal = stateWriteRefusal(filePath);
  if (refusal) throw new Error(refusal);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
}
