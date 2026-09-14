import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { repoPath } from "@/lib/repo";
import { DEFAULT_UI_SETTINGS, normalizeUiSettings, type UiSettings } from "@/lib/uiSettingsRules";

export type { UiSettings };

const FILE = repoPath("data/local-state/ui-settings.json");

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
  const next = normalizeUiSettings({ ...(await readUiSettings()), ...patch });
  next.updatedAt = new Date().toISOString();
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(next, null, 2) + "\n", "utf8");
  return next;
}
