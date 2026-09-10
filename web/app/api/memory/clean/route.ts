import { NextRequest, NextResponse } from "next/server";
import { repoPath, run } from "@/lib/repo";

export const dynamic = "force-dynamic";

/** 真的執行清理（memclean -f）。 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    age?: number;
    gradle?: boolean;
    languageServer?: boolean;
  };

  const args = ["--json", "-f", "-a", String(Number(body.age) || 120)];
  if (body.gradle) args.push("-g");
  if (body.languageServer) args.push("-l");

  const { stdout, stderr, code } = await run(
    "python3",
    [repoPath("shell/memclean.py"), ...args],
    { timeoutMs: 120_000 }
  );
  if (code !== 0) {
    return NextResponse.json({ error: stderr || `memclean.py exit ${code}` }, { status: 500 });
  }
  return NextResponse.json(JSON.parse(stdout));
}
