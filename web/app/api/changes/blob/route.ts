import { NextRequest, NextResponse } from "next/server";
import { isExternalRepo } from "@/lib/externalRepos";
import { isKnownWorktree, readImageBlob } from "@/lib/changes";

export const dynamic = "force-dynamic";

/**
 * 圖片的位元組，直接串給 `<img>`。
 *
 * `side=old` 是 HEAD 裡那張、`side=new` 是工作區那張。改名時舊版的路徑不一樣，
 * 所以 `file` 傳的就是「那一側自己的路徑」，不在這裡推。
 *
 * worktree 一樣要過 `isKnownWorktree`，否則任何路徑都能被拿去跑 `git -C`。
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const worktree = q.get("worktree") ?? "";
  const file = q.get("file") ?? "";
  const side = q.get("side") === "old" ? "old" : "new";
  if (!worktree || !file) {
    return NextResponse.json({ error: "要給 worktree 與 file" }, { status: 400 });
  }
  if (!(await isKnownWorktree(worktree)) && !(await isExternalRepo(worktree))) {
    return NextResponse.json({ error: "不認得這個工作區" }, { status: 403 });
  }

  // 舊側取哪個版本：看整條線時是 merge-base，不是 HEAD
  const rev = q.get("rev") || "HEAD";
  const r = await readImageBlob(worktree, file, side, rev);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });

  return new NextResponse(new Uint8Array(r.data), {
    headers: {
      "Content-Type": r.mime,
      // 工作區的檔隨時會變，快取住就會看到舊的
      "Cache-Control": "no-store",
      // SVG 裡可以藏 script，而這裡跟整個 app 同源。畫在 <img> 裡本來就不會執行，
      // 但直接開這個網址會 —— 所以擋在回應層，不靠呼叫端的用法
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
