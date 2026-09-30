import { NextRequest, NextResponse } from "next/server";
import { listReposCached } from "@/lib/gitView";
import { listExternalRepos } from "@/lib/externalRepos";
import { refRoots } from "@/lib/repoRef";
import { encodeRepoRef } from "@/lib/repoRefRules";

export const dynamic = "force-dynamic";

/**
 * `/code` 的 repo 清單：本機的 ＋ **外接碟上的**（offloaded 那批）。
 *
 * 跟 `/api/git/repos` 分開是因為兩者的成本天差地遠：本機那批要對每個 repo 跑
 * 5 個 git 指令（2.6 秒，所以有快取），外接那批只是 scandir 拿名字（74ms／
 * 快取後 1ms）。`/code` 只需要名字就能列，git 那些資訊它一個都用不到。
 */
export async function GET(req: NextRequest) {
  // ⚠️ 以前這裡沒收參數，前端傳了 `?fresh=1` 也被安靜忽略 —— 要重掃的時候
  // 拿到的是快取，而呼叫端無從得知
  const fresh = req.nextUrl.searchParams.get("fresh") === "1";
  const [local, ext, roots] = await Promise.all([
    listReposCached(fresh),
    listExternalRepos(),
    refRoots(),
  ]);
  // `ref` 是跨機器通用的身分（`Viewsonic-EDU/ragdoll-cat`），網址用它；
  // `dir` 是這台機器解出來的絕對路徑，只在同一台機器內部用。
  // 兩個都給，呼叫端才不必為了做一個連結再打一次 API。
  return NextResponse.json({
    local: local.repos.map((r) => ({
      dir: r.dir,
      ref: encodeRepoRef(r.dir, roots),
      name: r.name,
      worktreeOf: r.worktreeOf,
      pinned: r.pinned,
      // ⚠️ 這個欄位不能省：清單的預設排序（pin ＋ 最後 commit）靠它。
      // 漏掉時畫面不會壞，只是順序默默變成「server 回什麼就是什麼」（踩過）
      lastCommitAt: r.lastCommitAt,
    })),
    external: ext.repos.map((r) => ({ dir: r.dir, ref: encodeRepoRef(r.dir, roots), name: r.name })),
    externalMounted: ext.mounted,
  });
}
