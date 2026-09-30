import { NextRequest, NextResponse } from "next/server";
import { applyPairRequest, checkClaim, formatCode } from "@/lib/deviceRules";
import { newCode, newSecret, readStore, writeStore } from "@/lib/devices";

export const dynamic = "force-dynamic";

/**
 * 裝置配對。**這是唯一不需要 token 的端點**（`proxy.ts` 的 `NO_TOKEN_PATHS`）——
 * 沒有它就沒有第一步。它仍然過得了 Host 白名單那一關。
 *
 * `POST` 提出請求、`GET` 問「核可了沒」。設計見 `lib/deviceRules.ts`。
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    machineId?: string;
    machineName?: string;
    hostname?: string;
  } | null;
  const machineId = body?.machineId?.trim();
  const machineName = body?.machineName?.trim();
  if (!machineId || !machineName) {
    return NextResponse.json({ error: "要給 machineId 與 machineName" }, { status: 400 });
  }

  const out = applyPairRequest(
    await readStore(),
    { machineId, machineName, hostname: body?.hostname?.trim() || "(不明)", code: newCode(), claim: newSecret() },
    Date.now(),
  );
  if (out.kind === "too-many") {
    return NextResponse.json({ error: "待核可的請求太多，先去 hub 上處理掉" }, { status: 429 });
  }
  if (out.kind === "already-approved") {
    // 已經核可過的機器重新配對：不重發 token（那等於誰都能換一把新鑰匙），
    // 請它直接用手上那把；真的掉了就在 hub 上撤銷再來一次
    return NextResponse.json({ status: "already-approved", name: out.device.name });
  }
  await writeStore(out.store);
  return NextResponse.json({
    status: "pending",
    code: out.entry.code,
    display: formatCode(out.entry.code),
    claim: out.entry.claim,
  });
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const id = q.get("id") ?? "";
  const claim = q.get("claim") ?? "";
  if (!id || !claim) return NextResponse.json({ error: "要給 id 與 claim" }, { status: 400 });
  const r = checkClaim(await readStore(), id, claim);
  // claim 不對與「沒這台」回一樣的東西 —— 分開回的話就能用回應差異探測 machineId
  if (r.kind === "unknown") return NextResponse.json({ status: "unknown" }, { status: 404 });
  return NextResponse.json(r.kind === "approved" ? { status: "approved", token: r.token } : { status: "waiting" });
}
