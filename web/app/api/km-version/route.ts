import { NextResponse } from "next/server";
import { kmConfig } from "@/lib/kmRole";
import { applyUpdate, checkVersion, readVersionState } from "@/lib/kmVersion";
import { updateMessage, updatePlan } from "@/lib/kmVersionRules";
import { selfLabel } from "@/lib/machineRules";
import { readMachines } from "@/lib/machines";

export const dynamic = "force-dynamic";

async function label(): Promise<string> {
  const cfg = kmConfig();
  if (!cfg) return "這一台";
  return selfLabel(await readMachines().catch(() => ({ machines: [] })), cfg.machine.id, cfg.machine.name);
}

/** `?fresh=1` 才真的去 fetch（會打網路）；預設讀排程留下的那份 */
export async function GET(req: Request) {
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  const state = fresh ? await checkVersion() : ((await readVersionState()) ?? (await checkVersion()));
  const plan = updatePlan(state, kmConfig()?.role);
  return NextResponse.json({ state, plan, message: updateMessage(plan, await label()) });
}

/**
 * 更新並重啟。
 *
 * **hub 上只能手動按**（`updatePlan` 不會給 hub `auto`）—— 這支是那顆按鈕的後端，
 * satellite 的自動更新走排程，不經過 HTTP。
 */
export async function POST() {
  const out = await applyUpdate();
  return NextResponse.json(out, { status: out.ok ? 200 : 409 });
}
