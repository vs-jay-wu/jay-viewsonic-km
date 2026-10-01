import { NextResponse } from "next/server";
import { kmConfig } from "@/lib/kmRole";
import { hubStatus } from "@/lib/hubStatus";
import { readMachines } from "@/lib/machines";
import { selfLabel } from "@/lib/machineRules";

export const dynamic = "force-dynamic";

/** 畫面上那條警告列要的東西。hub 自己回 `role: "hub"`，前端就什麼都不畫 */
export async function GET() {
  const cfg = kmConfig();
  /*
   * 機器名**查註冊表**，不是直接用本機設定 —— 名字是跨機器共用的
   * （`machineRules.ts` 的 `selfLabel`）：在任何一台改名，每一台都跟著變。
   * 讀不到註冊表（連不上 hub）就退回本機設定，畫面不會空白。
   */
  const name = cfg
    ? selfLabel(await readMachines().catch(() => ({ machines: [] })), cfg.machine.id, cfg.machine.name)
    : null;
  // 機器名兩種角色都回 —— 側邊欄要顯示「我現在看的是哪一台的 km」
  const base = { role: cfg?.role ?? null, machineName: name };
  if (cfg?.role !== "satellite") return NextResponse.json({ ...base, ok: true, hubUrl: null });
  return NextResponse.json({ ...base, hubUrl: cfg.hubUrl ?? null, ...hubStatus() });
}
