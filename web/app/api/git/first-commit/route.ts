import { NextRequest, NextResponse } from "next/server";
import { listReposCached } from "@/lib/gitView";
import { listExternalRepos } from "@/lib/externalRepos";
import { firstCommitMap, forgetFirstCommits } from "@/lib/firstCommit";

export const dynamic = "force-dynamic";

/**
 * 每個 repo 的第一顆 commit（清單的「最早／最晚建立」排序用）。
 *
 * **第一次會慢**（475 個 repo 要跑 475 次 git log，7–11 秒），之後都是讀快取。
 * 所以只在使用者真的選了那個排序時才打這支 —— 預設排序用不到它。
 *
 * `?fresh=1` 會丟掉快取重算（歷史被改寫過時）。
 */
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("fresh") === "1") await forgetFirstCommits();
  const [local, ext] = await Promise.all([listReposCached(), listExternalRepos()]);
  const dirs = [...local.repos.map((r) => r.dir), ...ext.repos.map((r) => r.dir)];
  return NextResponse.json({ firstCommitAt: await firstCommitMap(dirs) });
}
