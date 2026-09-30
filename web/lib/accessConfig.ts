/**
 * 存取檢查要用的設定（碰檔案系統的那一半，判準在 `accessRules.ts`）。
 *
 * - `allowedHosts`：`local.workspace.json` 的 `km.allowedHosts`。開 Tailscale 之後
 *   放它的機器名與 IP（例如 `mac-hub`、`100.x.y.z`）。**沒設就只剩 loopback**，
 *   也就是維持現況 —— 預設安全。
 * - `tokens`：`data/hub/devices.json` 裡已核可的裝置。
 *
 * 快取 5 秒：核可一台裝置之後不必重啟就會生效，但也不會每個請求都讀兩次檔。
 */

import { readFileSync } from "fs";
import { repoPath } from "@/lib/repo";
import type { AccessConfig } from "@/lib/accessRules";

export interface Device {
  id: string;
  name: string;
  token: string;
  approvedAt: string;
}

const TTL_MS = 5_000;
const g = globalThis as unknown as { __kmAccessCfg?: { at: number; cfg: AccessConfig } };

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export function devicesFile(): string {
  return repoPath("data", "hub", "devices.json");
}

export function readDevices(): Device[] {
  return readJson<{ devices?: Device[] }>(devicesFile())?.devices ?? [];
}

export function accessConfig(): AccessConfig {
  const now = Date.now();
  if (g.__kmAccessCfg && now - g.__kmAccessCfg.at < TTL_MS) return g.__kmAccessCfg.cfg;
  const ws = readJson<{ km?: { allowedHosts?: string[] } }>(repoPath("local.workspace.json"));
  const cfg: AccessConfig = {
    allowedHosts: ws?.km?.allowedHosts ?? [],
    tokens: readDevices().map((d) => d.token),
  };
  g.__kmAccessCfg = { at: now, cfg };
  return cfg;
}
