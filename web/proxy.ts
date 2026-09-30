import { NextResponse, type NextRequest } from "next/server";
import { checkAccess } from "@/lib/accessRules";
import { accessConfig } from "@/lib/accessConfig";

/**
 * km 的入口守衛。判準在 `lib/accessRules.ts`（純規則，有測試），這裡只負責接線。
 *
 * 用 `proxy.ts` 不是 `middleware.ts`：這個版本的 Next 對後者印
 * 「The "middleware" file convention is deprecated. Please use "proxy" instead.」
 *
 * ⚠️ **這個檔不可以 `export const config`**（連 `runtime` 或 `matcher` 都不行）：
 * `⨯ Route segment config is not allowed in Proxy file at "./proxy.ts".
 * Proxy always runs on Node.js runtime.` —— 而且那是**啟動失敗**，不是警告。
 * 它本來就跑在 Node.js runtime，所以讀得到 `data/hub/devices.json`
 * （實測：`readFileSync(process.cwd() + "/package.json")` 回得出 `web`）。
 *
 * ⚠️ **函式要 `export default`**。具名的 `export function proxy` 在載入時會丟
 * `TypeError: adapterFn is not a function`，每個請求 500 —— 而畫面上看起來
 * 就像整個 app 壞了，不會有人想到是這個檔的匯出方式。
 *
 * **預設什麼都沒放寬**：`km.allowedHosts` 沒設的話只有 loopback 過得了第一關，
 * 也就是跟現況一模一樣。要對外開放是**明確加設定**，不是預設。
 */
/** 靜態資源不檢查：沒有副作用，而且每頁幾十個請求 */
const SKIP = ["/_next/static", "/_next/image", "/favicon.ico"];

/** 配對本身必須在「還沒有 token」的情況下打得到，否則沒有第一步 */
const NO_TOKEN_PATHS = ["/api/devices/pair"];

export default function proxy(req: NextRequest) {
  const h = req.headers;
  const p = req.nextUrl.pathname;
  if (SKIP.some((s) => p.startsWith(s)) || NO_TOKEN_PATHS.some((s) => p.startsWith(s))) {
    return NextResponse.next();
  }
  const d = checkAccess(
    {
      host: h.get("host"),
      origin: h.get("origin"),
      secFetchSite: h.get("sec-fetch-site"),
      method: req.method,
      token: req.cookies.get("km_device")?.value ?? null,
    },
    accessConfig(),
  );
  if (d.ok) return NextResponse.next();
  return new NextResponse(`km 拒絕了這個請求：${d.reason}`, {
    status: d.status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
