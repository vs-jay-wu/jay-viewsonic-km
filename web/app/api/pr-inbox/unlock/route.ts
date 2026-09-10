import { NextResponse } from "next/server";
import { lockState } from "@/lib/prInbox";
import { repoPath, run } from "@/lib/repo";

export const dynamic = "force-dynamic";

/** 清掉殘留的鎖。持有者還活著就拒絕 —— 那是重入保護，不該被繞過。 */
export async function POST() {
  const lock = await lockState();
  if (lock.locked && lock.alive) {
    return NextResponse.json(
      { error: `pid ${lock.pid} 還在跑，不能解鎖`, lock },
      { status: 409 }
    );
  }
  const { stdout, stderr, code } = await run(
    "/bin/zsh",
    [repoPath("scripts/pr-inbox-watch.sh"), "--force-unlock"],
    { timeoutMs: 15_000 }
  );
  if (code !== 0) return NextResponse.json({ error: stderr || stdout }, { status: 500 });
  return NextResponse.json({ ok: true, output: stdout.trim() });
}
