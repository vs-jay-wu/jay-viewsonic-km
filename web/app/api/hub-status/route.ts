import { NextResponse } from "next/server";
import { kmConfig } from "@/lib/kmRole";
import { hubStatus } from "@/lib/hubStatus";

export const dynamic = "force-dynamic";

/** 畫面上那條警告列要的東西。hub 自己回 `role: "hub"`，前端就什麼都不畫 */
export async function GET() {
  const cfg = kmConfig();
  // 機器名兩種角色都回 —— 側邊欄要顯示「我現在看的是哪一台的 km」
  const base = { role: cfg?.role ?? null, machineName: cfg?.machine.name ?? null };
  if (cfg?.role !== "satellite") return NextResponse.json({ ...base, ok: true, hubUrl: null });
  return NextResponse.json({ ...base, hubUrl: cfg.hubUrl ?? null, ...hubStatus() });
}
