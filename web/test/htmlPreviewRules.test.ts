import { describe, expect, it } from "vitest";
import { isHtmlPath, previewSandbox } from "@/lib/htmlPreviewRules";

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
