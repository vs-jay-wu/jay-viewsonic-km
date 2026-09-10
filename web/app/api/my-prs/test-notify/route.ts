import { NextResponse } from "next/server";
import { notifyMac } from "@/lib/notify";

export const dynamic = "force-dynamic";

/** 讓「通知」這個開關可以當場驗證，而不是等下一則 review 才知道有沒有效。 */
export async function POST() {
  const res = await notifyMac({
    title: "KM 工作台",
    subtitle: "通知測試",
    message: "看得到這則就表示通知管道是通的。",
    sound: true,
  });
  if (!res.ok) return NextResponse.json({ error: res.error ?? "送不出去" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
