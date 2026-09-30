import { describe, expect, it } from "vitest";
import { checkAccess, hostnameOf, type AccessConfig, type AccessRequest } from "@/lib/accessRules";

const cfg: AccessConfig = { allowedHosts: ["mac-hub", "100.64.0.1"], tokens: ["good-token"] };
const req = (o: Partial<AccessRequest> = {}): AccessRequest => ({
  host: "localhost:9487", origin: null, secFetchSite: null, method: "GET", token: null, ...o,
});

describe("Host 白名單（擋 DNS rebinding）", () => {
  it("loopback 一律放行", () => {
    for (const h of ["localhost:9487", "127.0.0.1:9487", "[::1]:9487", "localhost"]) {
      expect(checkAccess(req({ host: h }), cfg), h).toEqual({ ok: true });
    }
  });

  it("設定裡的 host 要帶 token 才放行", () => {
    expect(checkAccess(req({ host: "mac-hub:9487" }), cfg)).toMatchObject({ ok: false, status: 401 });
    expect(checkAccess(req({ host: "mac-hub:9487", token: "good-token" }), cfg)).toEqual({ ok: true });
  });

  it("沒見過的 host 直接擋 —— 這是 DNS rebinding 唯一擋得住的地方", () => {
    // 惡意網站把自己的域名解析到內網 IP，那時 Origin 是它自己、看起來完全同源
    for (const h of ["evil.example.com", "192.168.1.20:9487", "", null]) {
      expect(checkAccess(req({ host: h, token: "good-token" }), cfg), String(h))
        .toMatchObject({ ok: false, status: 403 });
    }
  });

  it("token 錯或沒帶都是 401，而且不會被 Host 正確掩蓋過去", () => {
    expect(checkAccess(req({ host: "100.64.0.1", token: "stolen" }), cfg)).toMatchObject({ status: 401 });
  });
});

describe("CSRF：跨站的寫入", () => {
  const post = (o: Partial<AccessRequest>) => checkAccess(req({ method: "POST", ...o }), cfg);

  it("同源的寫入放行", () => {
    expect(post({ secFetchSite: "same-origin" })).toEqual({ ok: true });
    expect(post({ origin: "http://localhost:9487" })).toEqual({ ok: true });
  });

  it("跨站的寫入擋掉", () => {
    expect(post({ secFetchSite: "cross-site", origin: "https://evil.example.com" }))
      .toMatchObject({ ok: false, status: 403 });
    // 沒有 Sec-Fetch-Site 的舊瀏覽器也擋得住，靠 Origin
    expect(post({ origin: "https://evil.example.com" })).toMatchObject({ ok: false, status: 403 });
  });

  it("本機腳本（curl，兩個標頭都沒有）放行", () => {
    // CSRF 要有瀏覽器才成立，而瀏覽器發 POST 時這兩個至少會有一個
    expect(post({})).toEqual({ ok: true });
  });

  it("遠端來源就沒有那個豁免 —— 兩個標頭都沒有也要擋", () => {
    expect(post({ host: "mac-hub:9487", token: "good-token" })).toMatchObject({ ok: false, status: 403 });
    expect(post({ host: "mac-hub:9487", token: "good-token", origin: "http://mac-hub:9487" }))
      .toEqual({ ok: true });
  });

  it("GET 不受 CSRF 那條管", () => {
    expect(checkAccess(req({ secFetchSite: "cross-site" }), cfg)).toEqual({ ok: true });
  });
});

describe("hostnameOf", () => {
  it("拆掉 port 與中括號", () => {
    expect(hostnameOf("Mac-Hub:9487")).toBe("mac-hub");
    expect(hostnameOf("[::1]:9487")).toBe("[::1]");
    expect(hostnameOf("  localhost  ")).toBe("localhost");
    expect(hostnameOf(null)).toBeNull();
    expect(hostnameOf(":9487")).toBeNull();
  });
});
