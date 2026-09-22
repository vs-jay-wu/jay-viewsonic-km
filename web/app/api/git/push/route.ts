import { NextRequest, NextResponse } from "next/server";
import { invalidateRepoCache, pushBranch } from "@/lib/gitView";

export const dynamic = "force-dynamic";

/**
 * `git push`。**會把東西送到外面**，所以前端一定要先跳確認框（`useConfirm`）。
 * 能不能推的判準在 `pushPlan`（有測試）：不 force、不刪除、落後上游就擋下來。
 */
export async function POST(req: NextRequest) {
  const { dir, branch } = (await req.json()) as { dir?: string; branch?: string };
  if (!dir || !branch) return NextResponse.json({ error: "要給 dir 與 branch" }, { status: 400 });
  const out = await pushBranch(dir, branch);
  invalidateRepoCache(); // ahead/behind 會變
  return NextResponse.json(out);
}
