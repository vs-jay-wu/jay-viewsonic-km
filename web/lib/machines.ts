/**
 * 機器註冊表的儲存（判準在 `machineRules.ts`）。
 *
 * 存 `data/hub/machines.json` —— **hub 擁有**。satellite 讀得到（走
 * `readStateFile` 向 hub 要），所以兩邊都看得到「有哪些機器、各自有哪些 session」。
 */

import { statePath } from "@/lib/statePaths";
import { readStateFile } from "@/lib/stateRead";
import { writeStateFile } from "@/lib/stateWrite";
import { EMPTY_REGISTRY, type MachineRegistry } from "@/lib/machineRules";

const FILE = () => statePath("machines.json");

export async function readMachines(): Promise<MachineRegistry> {
  const raw = await readStateFile(FILE());
  if (!raw) return EMPTY_REGISTRY;
  try {
    const r = JSON.parse(raw) as Partial<MachineRegistry>;
    return { machines: r.machines ?? [] };
  } catch {
    return EMPTY_REGISTRY;
  }
}

export async function writeMachines(reg: MachineRegistry): Promise<void> {
  await writeStateFile(FILE(), JSON.stringify(reg, null, 2) + "\n");
}

/**
 * 讀 → 改 → 寫，**序列化**。
 *
 * ⚠️ 這個檔有**兩個 writer**：satellite 的心跳（POST 進來）與 hub 自己的註冊，
 * 兩邊都是「整份覆寫」。沒有這條鎖的話，兩個請求的 read 與 write 交錯時
 * 後寫的那個會把前一個的那台**整筆弄不見** —— 而症狀只是「某台機器偶爾從清單消失，
 * 一分鐘後又回來」，幾乎不可能從畫面上推出原因。
 *
 * 單一 process 內的鎖就夠：km 的 server 只有一個。
 */
const g = globalThis as unknown as { __kmMachinesLock?: Promise<unknown> };

export async function updateMachines(
  fn: (reg: MachineRegistry) => MachineRegistry,
): Promise<MachineRegistry> {
  const run = async (): Promise<MachineRegistry> => {
    const next = fn(await readMachines());
    await writeMachines(next);
    return next;
  };
  const chained = (g.__kmMachinesLock ?? Promise.resolve()).then(run, run);
  g.__kmMachinesLock = chained.catch(() => undefined);
  return chained;
}
