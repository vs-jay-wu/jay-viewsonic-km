import { NextRequest, NextResponse } from "next/server";
import { approve, prunePending, revoke } from "@/lib/deviceRules";
import { newSecret, readStore, writeStore } from "@/lib/devices";

export const dynamic = "force-dynamic";

/**
 * 待核可與已核可的裝置。**只給 hub 自己的瀏覽器用**（`proxy.ts` 已經擋掉
 * 非 loopback 又沒 token 的來源；核可這件事本來就該在你面前那台上做）。
 *
 * ⚠️ 回應**不含 `claim` 也不含 `token`**：前者是取件憑證，顯示出來等於公開；
 * 後者是正式鑰匙。畫面上只需要「哪一台、哪個碼」就夠你確認了。
 */
export async function GET() {
  const s = prunePending(await readStore(), Date.now());
  return NextResponse.json({
    pending: s.pending.map((p) => ({
      machineId: p.machineId,
      machineName: p.machineName,
      hostname: p.hostname,
      code: p.code,
      requestedAt: p.requestedAt,
    })),
    devices: s.devices.map((d) => ({
      id: d.id,
      name: d.name,
      approvedAt: d.approvedAt,
      lastSeenAt: d.lastSeenAt ?? null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { action?: string; machineId?: string } | null;
  const id = body?.machineId?.trim();
  if (!id) return NextResponse.json({ error: "要給 machineId" }, { status: 400 });

  const store = await readStore();
  if (body?.action === "approve") {
    const r = approve(store, id, newSecret(), Date.now());
    if (!r) return NextResponse.json({ error: "找不到這筆待核可（可能已過期）" }, { status: 404 });
    await writeStore(r.store);
    return NextResponse.json({ ok: true, name: r.device.name });
  }
  if (body?.action === "revoke" || body?.action === "reject") {
    await writeStore(revoke(store, id));
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "action 要是 approve / reject / revoke" }, { status: 400 });
}
