/**
 * `/repo/code` 與 `/repo/git` 的網址參數。
 *
 * **身分（`repo=`）在 server 端就解析成這台機器的絕對路徑**再傳給 client，
 * 而不是讓 client 拿 repo 清單去比對：清單是非同步載入的，靠它解析會在載入完成前
 * 先閃一下「選一個 repo」，而且清單裡沒有的目錄（掛在別處的 linked worktree）
 * 就永遠解不開。
 */

import { redirect } from "next/navigation";
import { dirOfRef, refOf } from "@/lib/repoRef";
import { canonicalRepoQuery } from "@/lib/repoRefRules";

export interface RepoParams {
  /** 跨機器通用的身分，例如 `Viewsonic-EDU/ragdoll-cat` */
  repo?: string;
  /** 舊的絕對路徑寫法。過渡期用，satellite 上線就拿掉（見 `lib/repoRef.ts`） */
  dir?: string;
}

/** 頁面實際收到的 searchParams：除了上面兩個，還有各視圖自己的（`file`、`sha`…） */
export type RepoSearchParams = RepoParams & Record<string, string | string[] | undefined>;

export async function dirFromParams(q: RepoParams): Promise<string> {
  if (q.repo) return (await dirOfRef(q.repo)) ?? "";
  return q.dir ?? "";
}

/**
 * 帶舊的 `dir=` 進來就轉成 `repo=`（見 `canonicalRepoQuery`）。解不出身分的就照舊用 `dir`。
 *
 * ⚠️ `redirect()` 是用 throw 實作的，不要包進 try/catch。
 */
export async function redirectLegacyDir(view: "code" | "git", q: RepoSearchParams): Promise<void> {
  if (q.repo || typeof q.dir !== "string" || !q.dir) return;
  const next = canonicalRepoQuery(q, await refOf(q.dir));
  if (next) redirect(`/repo/${view}?${next}`);
}
