import { NextRequest, NextResponse } from "next/server";
import { repoPath, run } from "@/lib/repo";

export const dynamic = "force-dynamic";

/** dry-run：目前記憶體狀況 ＋ 符合清理條件的行程（不殺）。 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const args = ["--json", "-a", String(parseInt(sp.get("age") ?? "120", 10) || 120)];
  if (sp.get("gradle") === "1") args.push("-g");
  if (sp.get("languageServer") === "1") args.push("-l");

  const { stdout, stderr, code } = await run("python3", [repoPath("shell/memclean.py"), ...args]);
  if (code !== 0) {
    return NextResponse.json({ error: stderr || `memclean.py exit ${code}` }, { status: 500 });
  }
  return NextResponse.json(JSON.parse(stdout));
}
