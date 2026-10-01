/**
 * 定期查 km 落後幾個 commit；satellite 符合條件時自己更新。
 *
 * 間隔 30 分鐘：它要打一次網路（`git fetch`），而「落後幾個 commit」不是每秒都在變。
 * timer 掛 `globalThis`，否則 dev 模式的 HMR 會留下孤兒 interval。
 */

import { kmConfig } from "@/lib/kmRole";
import { applyUpdate, checkVersion } from "@/lib/kmVersion";
import { updatePlan } from "@/lib/kmVersionRules";

const EVERY_MS = 30 * 60 * 1000;
const g = globalThis as unknown as { __kmVersionTimer?: NodeJS.Timeout };

async function tick(): Promise<void> {
  const state = await checkVersion().catch(() => null);
  if (!state) return;
  const plan = updatePlan(state, kmConfig()?.role);

  if (plan.kind === "blocked") {
    // 不要默默跳過：工作區不乾淨正是「有人在這台上動了 km」的徵兆
    console.warn(`[km] 落後 ${plan.behind} 個 commit 但沒有自動更新 —— ${plan.reason}`);
    return;
  }
  if (plan.kind !== "auto") return;

  console.log(`[km] satellite 落後 ${plan.behind} 個 commit，自動更新中`);
  const out = await applyUpdate();
  console.log(`[km] 自動更新${out.ok ? "完成" : "失敗"}：${out.log.join(" / ")}`);
}

export function initKmVersion(): void {
  if (g.__kmVersionTimer) clearInterval(g.__kmVersionTimer);
  void tick();
  g.__kmVersionTimer = setInterval(() => void tick(), EVERY_MS);
}
