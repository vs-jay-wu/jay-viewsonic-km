/**
 * 讀這台機器的角色設定（碰檔案系統的那一半，判準在 `kmRoleRules.ts`）。
 *
 * 設定放在 `local.workspace.json` 的 `km` 區塊 —— 那個檔本來就是**每台各自一份、
 * 不進版控**（`.gitignore:5`），正好符合「角色在安裝時就寫進該機器」。
 */

import { readFileSync } from "fs";
import { repoPath } from "@/lib/repo";
import { parseKmConfig, type KmConfig } from "@/lib/kmRoleRules";

/**
 * 快取掛在 `globalThis`：dev 模式的 HMR 每次重載都會產生新的模組實例，
 * 用模組層變數的話等於每次改檔都重讀一次。
 */
const g = globalThis as unknown as { __kmRoleConfig?: { config: KmConfig } | { error: string } };

function load(): { config: KmConfig } | { error: string } {
  if (g.__kmRoleConfig) return g.__kmRoleConfig;
  let parsed: { config: KmConfig } | { error: string };
  try {
    parsed = parseKmConfig(JSON.parse(readFileSync(repoPath("local.workspace.json"), "utf8")));
  } catch (e) {
    parsed = { error: `local.workspace.json 讀不到或不是合法 JSON：${(e as Error).message}` };
  }
  g.__kmRoleConfig = parsed;
  return parsed;
}

/** 設定好了就回傳，沒設定回 null（呼叫端自己決定要不要因此擋下來） */
export function kmConfig(): KmConfig | null {
  const r = load();
  return "config" in r ? r.config : null;
}

/** 沒設定就丟例外。會改變資料的路徑用這支，唯讀的用 `kmConfig()` */
export function requireKmConfig(): KmConfig {
  const r = load();
  if ("error" in r) throw new Error(r.error);
  return r.config;
}

/** 改了 local.workspace.json 之後叫一次；測試也用它清乾淨 */
export function resetKmConfigCache(): void {
  delete g.__kmRoleConfig;
}
