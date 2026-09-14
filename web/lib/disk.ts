import { readFile, stat } from "fs/promises";
import os from "os";
import { repoPath, run } from "@/lib/repo";
import { parseDf, type DiskUsage } from "@/lib/diskRules";

export type { DiskUsage };

/**
 * 看硬碟還剩多少。
 *
 * 看兩個地方：**家目錄所在的卷**（程式碼、build 產物、Claude session 都在這）
 * 與**外接**（offloaded 的 repo 在那）。外接沒掛就跳過，不要報成「壞掉」。
 */
async function usageOf(path: string, label: string): Promise<DiskUsage | null> {
  const exists = await stat(path).then(() => true, () => false);
  if (!exists) return null;
  const { stdout, code } = await run("/bin/df", ["-k", path], { timeoutMs: 10_000 });
  if (code !== 0) return null;
  return parseDf(stdout, label);
}

/** 外接的掛載點寫在 local.workspace.json 的 externalPath（各 org 可能不同） */
async function externalMounts(): Promise<string[]> {
  const raw = await readFile(repoPath("local.workspace.json"), "utf8").catch(() => null);
  if (!raw) return [];
  try {
    const ws = JSON.parse(raw) as { orgs?: Record<string, { externalPath?: string }> };
    const mounts = new Set<string>();
    for (const o of Object.values(ws.orgs ?? {})) {
      if (!o.externalPath) continue;
      // 取 /Volumes/<名稱> 這一層，而不是 repo 目錄本身
      const m = /^(\/Volumes\/[^/]+)/.exec(o.externalPath);
      mounts.add(m ? m[1] : o.externalPath);
    }
    return [...mounts];
  } catch {
    return [];
  }
}

export async function readDisks(): Promise<DiskUsage[]> {
  const home = await usageOf(os.homedir(), "本機");
  const externals = await Promise.all(
    (await externalMounts()).map((m) => usageOf(m, `外接（${m.split("/").pop()}）`))
  );
  return [home, ...externals].filter((d): d is DiskUsage => !!d);
}
