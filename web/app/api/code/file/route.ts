import { NextRequest, NextResponse } from "next/server";
import { readFileIn, type Reveal } from "@/lib/codeBrowse";

export const dynamic = "force-dynamic";

/**
 * 讀一個檔案的內容。唯讀。
 *
 * 機敏檔案（`.env` 之類）**預設不回內容**，要帶 `?reveal=full`（明碼）或
 * `?reveal=masked`（只留欄位名）才讀 —— 那代表使用者在自己的瀏覽器上明確按了
 * 一下。keystore 那一類不管帶什麼都擋（`excluded-dirs.md`）。
 *
 * ⚠️ **agent 不要打這個參數，也不要從畫面讀已解鎖的內容**（截圖、抓 DOM 都算）。
 * 這個機制的前提是「內容只到使用者的螢幕，不進對話記錄」，
 * 詳見 `.claude/rules/sensitive-files.md`。
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const dir = q.get("dir") ?? "";
  const file = q.get("path") ?? "";
  const raw = q.get("reveal");
  const reveal: Reveal | undefined = raw === "full" || raw === "masked" ? raw : undefined;
  if (!dir || !file) return NextResponse.json({ error: "要給 dir 與 path" }, { status: 400 });
  const out = await readFileIn(dir, file, reveal);
  if ("error" in out) return NextResponse.json(out, { status: 403 });
  return NextResponse.json(out);
}
