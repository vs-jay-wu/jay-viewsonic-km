import { NextRequest, NextResponse } from "next/server";
import { readRawIn } from "@/lib/codeBrowse";
import { decodeRepoKey, rawCsp } from "@/lib/codeRawRules";
import { dirOfRef } from "@/lib/repoRef";

export const dynamic = "force-dynamic";

/**
 * 把 repo 裡的檔案**原封不動**交給瀏覽器，給 `/repo/code` 的 HTML 預覽用。
 *
 * 網址是 `/code-view/<base64url(repo 路徑)>/<檔案路徑…>`：**路徑式**，
 * 這樣 HTML 裡的相對資產（`./style.css`）才解析得到隔壁的檔案
 * （見 `lib/codeRawRules.ts` 的檔頭）。
 *
 * 唯讀。守衛全部在 `readRawIn`（與 `/api/code/file` 同一套，外加副檔名白名單）。
 *
 * ⚠️ **CSP 放在回應標頭，不是塞進 HTML**：iframe 的 sandbox 只管 iframe，
 * 使用者把網址貼到新分頁時那份 HTML 就是跟 km 同源的一般頁面 ——
 * 標頭上的 CSP 兩種情境都算得到。
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  const [key, ...rest] = segments;
  // key 裡放的是 **repo 身分**（`Viewsonic-EDU/ragdoll-cat`），不是絕對路徑。
  // 這個網址會被嵌進預覽出來的 HTML 裡、也會被貼到新分頁，帶絕對路徑的話
  // 貼到另一台機器就會安靜地指向那台的磁碟（見 lib/repoRefRules.ts）。
  const ref = key ? decodeRepoKey(key) : null;
  const dir = ref ? await dirOfRef(ref) : null;
  if (!dir || rest.length === 0) {
    return new NextResponse("網址要是 /code-view/<repoKey>/<檔案路徑>", { status: 400 });
  }

  const rel = rest.map((s) => decodeURIComponent(s)).join("/");
  const out = await readRawIn(dir, rel);
  if ("error" in out) return new NextResponse(out.error, { status: out.status });

  // script 要不要能跑由呼叫端決定（畫面上的開關），預設不能
  const allowScripts = req.nextUrl.searchParams.get("scripts") === "1";
  return new NextResponse(new Uint8Array(out.data), {
    headers: {
      "Content-Type": out.mime,
      // repo 的檔案隨時會變，快取住就會看到舊的
      "Cache-Control": "no-store",
      "Content-Security-Policy": rawCsp(allowScripts),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
