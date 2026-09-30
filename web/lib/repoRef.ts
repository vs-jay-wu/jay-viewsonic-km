/**
 * repo 身分的解析（碰檔案系統的那一半，判準在 `repoRefRules.ts`）。
 *
 * root 清單是**每台機器自己的**：org 的 `localPath` / `externalPath` 來自
 * `local.workspace.json`，km 自己來自 `KM_REPO_ROOT`，`home` 來自 `os.homedir()`。
 * 同一個 `Viewsonic-EDU/ragdoll-cat` 在兩台機器上會解到各自的絕對路徑 ——
 * 這正是整件事的目的。
 */

import { readFile } from "fs/promises";
import { homedir } from "os";
import { repoPath, repoRoot } from "@/lib/repo";
import { decodeRepoRef, encodeRepoRef, type RefRoot } from "@/lib/repoRefRules";

/** root 清單不常變，但**不要跨請求快取太久** —— 掛外接碟之後就多一個 root */
export async function refRoots(): Promise<RefRoot[]> {
  const roots: RefRoot[] = [{ id: "km", base: repoRoot() }];
  const raw = await readFile(repoPath("local.workspace.json"), "utf8").catch(() => null);
  if (raw) {
    try {
      const ws = JSON.parse(raw) as {
        orgs?: Record<string, { localPath?: string; externalPath?: string }>;
      };
      for (const [org, o] of Object.entries(ws.orgs ?? {})) {
        if (o.localPath) roots.push({ id: org, base: o.localPath });
        if (o.externalPath) roots.push({ id: `${org}@external`, base: o.externalPath });
      }
    } catch {
      /* 壞掉就只剩 km 與 home —— 比整個爆掉好 */
    }
  }
  // 兜底：worktree 可以開在任何地方。放最後，`encodeRepoRef` 本來就挑最長的 base
  roots.push({ id: "home", base: homedir() });
  return roots;
}

export async function refOf(abs: string): Promise<string | null> {
  return encodeRepoRef(abs, await refRoots());
}

export async function dirOfRef(ref: string): Promise<string | null> {
  return decodeRepoRef(ref, await refRoots());
}

/**
 * 從請求參數拿到 repo 的絕對路徑。
 *
 * `repo=` 是正式的；`dir=` 是**過渡期**的舊寫法，留著讓既有的分頁與書籤不會當場壞掉。
 *
 * ⚠️ 這兩條不要長期並存：`dir=` 帶的絕對路徑在另一台機器上可能**也解析得開**，
 * 那正是這整套要消滅的無聲錯位。satellite 一上線就把 `dir=` 拿掉。
 */
export async function repoDirFromParams(params: URLSearchParams): Promise<string | null> {
  const ref = params.get("repo");
  if (ref) return dirOfRef(ref);
  return params.get("dir") || null;
}
