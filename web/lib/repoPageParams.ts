/**
 * `/repo/code` 與 `/repo/git` 的網址參數。
 *
 * **身分（`repo=`）在 server 端就解析成這台機器的絕對路徑**再傳給 client，
 * 而不是讓 client 拿 repo 清單去比對：清單是非同步載入的，靠它解析會在載入完成前
 * 先閃一下「選一個 repo」，而且清單裡沒有的目錄（掛在別處的 linked worktree）
 * 就永遠解不開。
 */

import { dirOfRef } from "@/lib/repoRef";

export interface RepoParams {
  /** 跨機器通用的身分，例如 `Viewsonic-EDU/ragdoll-cat` */
  repo?: string;
  /** 舊的絕對路徑寫法。過渡期用，satellite 上線就拿掉（見 `lib/repoRef.ts`） */
  dir?: string;
}

export async function dirFromParams(q: RepoParams): Promise<string> {
  if (q.repo) return (await dirOfRef(q.repo)) ?? "";
  return q.dir ?? "";
}
