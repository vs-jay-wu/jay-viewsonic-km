/**
 * km 對外開放時的存取判準（純規則，有測試）。
 *
 * **為什麼這件事不能排到後面**：km 會開 Claude session、會跑腳本、讀得到整個
 * workspace。它一旦被打穿，等於**有人以 Jay 的身分在他的機器上執行任意指令**。
 * 目前它安全只有一個理由 —— 只聽 `127.0.0.1`。所以「開始聽 loopback 以外的介面」
 * 與「這三道檢查」必須是同一批改動。設計見 `docs/ideas/km-multi-machine.md` §9。
 *
 * 三道，順序固定：
 *
 * 1. **Host 白名單** —— 擋 DNS rebinding。惡意網站把自己的域名解析到你的內網 IP
 *    就能用瀏覽器打 9487，而那時 Origin 是它自己、看起來完全同源。唯一擋得住的
 *    是「這個 Host 我認不認得」。
 * 2. **裝置 token** —— 非 loopback 的來源要帶。tailnet 裡的裝置被偷了還是要能單獨撤銷。
 * 3. **CSRF** —— km 的 API **不檢查 `Origin`**（HTML 預覽選 `connect-src 'none'`
 *    就是因為這個）。只要不再是 localhost-only，任何網站都能在你瀏覽器裡對它發 POST。
 */

export interface AccessRequest {
  /** `Host` 標頭原文（可能帶 port） */
  host: string | null;
  origin: string | null;
  /** `Sec-Fetch-Site`：same-origin / same-site / cross-site / none */
  secFetchSite: string | null;
  method: string;
  /** cookie 裡的裝置 token */
  token: string | null;
}

export interface AccessConfig {
  /** 除了 loopback 之外還允許的 host（tailscale 的名字或 IP），不含 port */
  allowedHosts: string[];
  /** 已核可的裝置 token */
  tokens: string[];
}

export type AccessDecision = { ok: true } | { ok: false; status: number; reason: string };

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** 去掉 port 與中括號，回小寫主機名。`null` 代表這個 Host 根本不能用 */
export function hostnameOf(hostHeader: string | null): string | null {
  if (!hostHeader) return null;
  const h = hostHeader.trim().toLowerCase();
  if (!h) return null;
  // IPv6 是 `[::1]:9487`
  if (h.startsWith("[")) {
    const end = h.indexOf("]");
    return end > 0 ? h.slice(0, end + 1) : null;
  }
  return h.split(":")[0] || null;
}

function isAllowedHost(name: string | null, cfg: AccessConfig): boolean {
  if (!name) return false;
  return LOOPBACK.has(name) || cfg.allowedHosts.some((h) => h.trim().toLowerCase() === name);
}

export function checkAccess(req: AccessRequest, cfg: AccessConfig): AccessDecision {
  const host = hostnameOf(req.host);
  if (!isAllowedHost(host, cfg)) {
    return { ok: false, status: 403, reason: `不認得這個 Host（${req.host ?? "沒有"}）` };
  }

  const loopback = !!host && LOOPBACK.has(host);

  if (!loopback && !(req.token && cfg.tokens.includes(req.token))) {
    return { ok: false, status: 401, reason: "這個裝置還沒有被核可" };
  }

  if (MUTATING.has(req.method.toUpperCase())) {
    const site = req.secFetchSite?.toLowerCase() ?? null;
    const originHost = req.origin ? hostnameOf(safeHost(req.origin)) : null;
    const originOk = req.origin ? isAllowedHost(originHost, cfg) : false;
    const siteOk = site === "same-origin" || site === "none";

    // 兩個標頭都沒有 ＋ 來自本機 ＝ 不是瀏覽器（腳本用 curl 打自己的 km）。
    // CSRF 一定要有瀏覽器才成立，而瀏覽器發 POST 時這兩個至少會有一個。
    const notABrowser = !req.origin && site === null;
    if (!(siteOk || originOk || (notABrowser && loopback))) {
      return { ok: false, status: 403, reason: "跨站的寫入請求" };
    }
  }

  return { ok: true };
}

/** `http://host:port/...` → `host:port`；不是合法網址就回 null（當成沒給） */
function safeHost(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}
