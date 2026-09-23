import { stat } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { isKnownWorktree } from "@/lib/changes";
import { isExternalRepo } from "@/lib/externalRepos";
import { readPinned, togglePinned } from "@/lib/gitView";

export const dynamic = "force-dynamic";

/**
 * pin／取消 pin（再按一次就取消）。只是排序偏好，不動 git。
 *
 * 接受三種路徑：主 repo、worktree、外接碟上的 repo。存的就是路徑本身，
 * **pin 的語意由讀取端決定**（`lib/repoGroupRules.ts`：主 repo 的 pin 管 repo
 * 清單的順序，worktree 的 pin 只管那個 repo 底下的順序）。
 */
/**
 * 目前 pin 住哪些路徑，以及其中哪些是 **linked worktree**。
 *
 * 判斷方式是看 `<dir>/.git` 是檔案還是目錄 —— linked worktree 的 `.git` 是一個
 * 寫著 `gitdir: …` 的**檔案**。不跑 git，只 stat 一次。
 *
 * ⚠️ **不要用名字猜**（`<repo>-<topic>` 的前綴關係）。那只夠決定畫哪個圖示；
 * 側邊欄拿它決定「顯不顯示」的話，名字剛好長那樣的真 repo 會整個消失。
 */
export async function GET() {
  const pinned = await readPinned();
  const worktrees: string[] = [];
  await Promise.all(
    pinned.map(async (dir) => {
      const st = await stat(path.join(dir, ".git")).catch(() => null);
      if (st?.isFile()) worktrees.push(dir);
    })
  );
  return NextResponse.json({ pinned, worktrees });
}

export async function POST(req: NextRequest) {
  const { dir } = (await req.json()) as { dir?: string };
  if (!dir) return NextResponse.json({ error: "要給 dir" }, { status: 400 });
  if (!(await isKnownWorktree(dir)) && !(await isExternalRepo(dir))) {
    return NextResponse.json({ error: "不認得這個 repo" }, { status: 403 });
  }
  // 不作廢 repo 清單的快取：pin 不改 git 狀態，清單那支是在回應時才疊上 pin 的
  return NextResponse.json({ pinned: await togglePinned(dir) });
}
