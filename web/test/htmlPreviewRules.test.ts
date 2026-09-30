import { describe, expect, it } from "vitest";
import {
  isHtmlPath, previewCsp, previewSandbox, withPreviewCsp,
} from "@/lib/htmlPreviewRules";

describe("isHtmlPath", () => {
  it(".html 與 .htm 都算，大小寫不拘", () => {
    expect(isHtmlPath("docs/a.html")).toBe(true);
    expect(isHtmlPath("a.HTM")).toBe(true);
  });

  it("其餘一律不算（含長得像的）", () => {
    expect(isHtmlPath("a.html.ts")).toBe(false);
    expect(isHtmlPath("index.htmlx")).toBe(false);
    expect(isHtmlPath("README.md")).toBe(false);
  });
});

describe("previewSandbox", () => {
  it("**永遠沒有 allow-same-origin**（給了就等於沒沙箱）", () => {
    expect(previewSandbox(true)).not.toContain("allow-same-origin");
    expect(previewSandbox(false)).not.toContain("allow-same-origin");
  });

  it("script 開關決定 allow-scripts", () => {
    expect(previewSandbox(true)).toContain("allow-scripts");
    expect(previewSandbox(false)).not.toContain("allow-scripts");
  });
});

describe("previewCsp", () => {
  it("不管開不開 script，都不准它送請求（sandbox 擋不住這個）", () => {
    for (const allow of [true, false]) {
      expect(previewCsp(allow)).toContain("connect-src 'none'");
      expect(previewCsp(allow)).toContain("form-action 'none'");
    }
  });

  it("不開 script 時整條 script-src 不出現（預設就是 default-src 'none'）", () => {
    expect(previewCsp(false)).not.toContain("script-src");
    expect(previewCsp(true)).toContain("script-src");
  });

  it("圖、字型、樣式放行 https 與 data —— 不然那些自成一頁的檔會走樣", () => {
    const csp = previewCsp(false);
    expect(csp).toContain("img-src data: blob: https:");
    expect(csp).toContain("style-src 'unsafe-inline' data: https:");
    expect(csp).toContain("font-src data: https:");
  });
});

describe("withPreviewCsp", () => {
  it("插在 <head> 的最前面（http-equiv 只對它後面的東西生效）", () => {
    const out = withPreviewCsp('<html><head><link href="x.css"></head><body>x</body></html>', false);
    expect(out.indexOf("Content-Security-Policy")).toBeLessThan(out.indexOf("x.css"));
  });

  it("<head> 有屬性、大小寫不同也認得", () => {
    const out = withPreviewCsp('<HEAD lang="zh">\n<title>t</title>', false);
    expect(out.indexOf("Content-Security-Policy")).toBeLessThan(out.indexOf("<title>"));
    expect(out).toContain('<HEAD lang="zh">');
  });

  it("沒有 <head> 的片段就插在最前面", () => {
    expect(withPreviewCsp("<p>hi</p>", false).startsWith("<meta")).toBe(true);
  });

  it("不動原本的內容", () => {
    const src = "<html><head></head><body><p>保留</p></body></html>";
    expect(withPreviewCsp(src, true)).toContain("<body><p>保留</p></body>");
  });
});
