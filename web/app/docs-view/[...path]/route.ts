import { readFile, stat } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { resolveDocPath } from "@/lib/docs";

export const dynamic = "force-dynamic";

/**
 * 直接把 `docs/` 底下的檔案吐給瀏覽器。
 *
 * 為什麼要這條路由而不是丟進 `public/`：這些文件用**相對路徑**引資產
 * （`assets/style.css`、`images/…`），複製到 public/ 會把它們跟資產拆開；
 * 走這條路由則是原地服務，相對路徑自然對得上，也保留了「用檔案總管直接
 * 雙擊打開」的能力。
 *
 * 只讀、只給 `docs/` 底下的東西（路徑檢查在 lib/docs.ts 的 resolveDocPath），
 * 而且只回白名單內的副檔名 —— 這個 server 綁 127.0.0.1，但不必因此就不設防。
 */
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".md": "text/plain; charset=utf-8",
  ".json": "application/json",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  const abs = resolveDocPath(segments.map(decodeURIComponent));
  if (!abs) return new NextResponse("路徑不在 docs/ 底下", { status: 403 });

  const ext = path.extname(abs).toLowerCase();
  const type = TYPES[ext];
  if (!type) return new NextResponse(`不提供這種副檔名：${ext || "（無）"}`, { status: 415 });

  const st = await stat(abs).catch(() => null);
  if (!st?.isFile()) {
    return new NextResponse(
      // 圖片是 gitignored 的那種情況（pptx 那份的 images/ 有 13MB 不進版控）
      "找不到這個檔案。若是圖片，可能是刻意不進版控的產物，見該文件集的 STATE.md。",
      { status: 404 }
    );
  }

  const body = await readFile(abs);
  return new NextResponse(new Uint8Array(body), {
    headers: { "Content-Type": type, "Cache-Control": "no-store" },
  });
}
