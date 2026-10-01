import { NextResponse } from "next/server";
import { kmConfig } from "@/lib/kmRole";
import { hubStatus } from "@/lib/hubStatus";

export const dynamic = "force-dynamic";

/** 畫面上那條警告列要的東西。hub 自己回 `role: "hub"`，前端就什麼都不畫 */
export async function GET() {
  const cfg = kmConfig();
  if (cfg?.role !== "satellite") return NextResponse.json({ role: cfg?.role ?? null });
  return NextResponse.json({
    role: "satellite",
    machineName: cfg.machine.name,
    hubUrl: cfg.hubUrl ?? null,
    ...hubStatus(),
  });
}
