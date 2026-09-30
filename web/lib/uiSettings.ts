import { mkdir, readFile } from "fs/promises";
import path from "path";
import { DEFAULT_UI_SETTINGS, normalizeUiSettings, type UiSettings } from "@/lib/uiSettingsRules";
import { statePath } from "@/lib/statePaths";
import { writeStateFile } from "@/lib/stateWrite";

export type { UiSettings };

const FILE = statePath("ui-settings.json");

export async function readUiSettings(): Promise<UiSettings> {
  const raw = await readFile(FILE, "utf8").catch(() => null);
  if (!raw) return DEFAULT_UI_SETTINGS;
  try {
    return normalizeUiSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_UI_SETTINGS;
  }
}

export async function writeUiSettings(patch: Partial<UiSettings>): Promise<UiSettings> {
  // **先把 undefined 的欄位濾掉**。呼叫端常常只想改一項，卻把整個 body 當 patch 傳
  // （沒填的欄位是 undefined）；直接展開的話那些欄位會蓋掉既有值，再被 normalize
  // 退回預設 —— 表現是「改配色順便把 diff 配色重設了」，而且沒有任何錯誤訊息。
  const defined = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined)
  ) as Partial<UiSettings>;
  const next = normalizeUiSettings({ ...(await readUiSettings()), ...defined });
  next.updatedAt = new Date().toISOString();
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeStateFile(FILE, JSON.stringify(next, null, 2) + "\n");
  return next;
}
