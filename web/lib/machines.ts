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
