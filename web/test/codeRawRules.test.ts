import { describe, expect, it } from "vitest";
import { codeRawUrl, decodeRepoKey, encodeRepoKey, rawCsp, rawMimeOf, previewKindOf,
} from "@/lib/codeRawRules";

describe("repo key 的編解碼", () => {
  it("繞一圈拿得回原本的路徑（含中文與空白）", () => {
    for (const dir of ["/Users/jay/Orgs/edu-vbo", "/Volumes/Crucial X9/a b/中文 repo"]) {
      expect(decodeRepoKey(encodeRepoKey(dir))).toBe(dir);
    }
  });

  it("編出來的東西可以安全放在網址路徑裡（沒有 / + =）", () => {
    const key = encodeRepoKey("/Volumes/Crucial X9/ProjectsWork_GitHub/Orgs/Viewsonic-EDU/edu-vbo");
    expect(key).not.toMatch(/[/+=]/);
  });

  it("壞掉的 key 回 null，不要吐出半個字串讓後面去猜", () => {
    expect(decodeRepoKey("")).toBeNull();
    expect(decodeRepoKey("!!!not-base64!!!")).toBeNull();
  });
});

describe("codeRawUrl", () => {
  it("每一段各自 encode，`/` 要留著", () => {
    const u = codeRawUrl("/x/edu-vbo", "docs/star ter/a b.html");
    expect(u).toContain("/docs/star%20ter/a%20b.html");
    expect(u.split("/").length).toBeGreaterThan(3);
  });

  it("script 開關用 query 帶（CSP 是每個回應各自決定的）", () => {
    expect(codeRawUrl("/x/r", "a.html")).not.toContain("scripts=1");
    expect(codeRawUrl("/x/r", "a.html", { scripts: true })).toContain("?scripts=1");
  });
});

describe("rawMimeOf — 白名單", () => {
  it("HTML 預覽要用的那幾種都在", () => {
    expect(rawMimeOf("a.html")).toBe("text/html; charset=utf-8");
    expect(rawMimeOf("x/y.CSS")).toBe("text/css; charset=utf-8");
    expect(rawMimeOf("f.woff2")).toBe("font/woff2");
    expect(rawMimeOf("i.png")).toBe("image/png");
  });

  it("不在白名單的一律 null（沒有副檔名的也是）", () => {
    for (const p of ["a.sh", "b.jks", "Makefile", "x.env", ".env", "a.pdf"]) {
      expect(rawMimeOf(p)).toBeNull();
    }
  });
});

describe("rawCsp", () => {
  it("不管開不開 script 都不准它送請求或送表單", () => {
    for (const allow of [true, false]) {
      expect(rawCsp(allow)).toContain("connect-src 'none'");
      expect(rawCsp(allow)).toContain("form-action 'none'");
    }
  });

  it("script 預設整條不出現（default-src 'none' 就擋掉了）", () => {
    expect(rawCsp(false)).not.toContain("script-src");
    expect(rawCsp(true)).toContain("script-src");
  });

  it("相對資產要載得到，所以圖與樣式放行 'self'", () => {
    expect(rawCsp(false)).toContain("img-src 'self'");
    expect(rawCsp(false)).toContain("style-src 'self'");
  });
});

describe("rawMimeOf — 影音", () => {
  it("音檔認得（工作區實際有 mp3 與 wav）", () => {
    expect(rawMimeOf("assets/notification.wav")).toBe("audio/wav");
    expect(rawMimeOf("a/b/signout.MP3")).toBe("audio/mpeg");
    expect(rawMimeOf("x.m4a")).toBe("audio/mp4");
  });

  it("影片也在白名單裡", () => {
    expect(rawMimeOf("demo.mp4")).toBe("video/mp4");
    expect(rawMimeOf("demo.mov")).toBe("video/quicktime");
  });
});

describe("previewKindOf", () => {
  it("照 MIME 分類", () => {
    expect(previewKindOf("a/icon.svg")).toBe("image");
    expect(previewKindOf("assets/notification.wav")).toBe("audio");
    expect(previewKindOf("demo.mp4")).toBe("video");
    expect(previewKindOf("fonts/AbrilFatface-Regular.ttf")).toBe("font");
  });

  it("認不得的回 null（不要猜，猜錯會出現放不出來的播放器）", () => {
    expect(previewKindOf("a.kt")).toBeNull();
    expect(previewKindOf("b.jks")).toBeNull();
    expect(previewKindOf("README.md")).toBeNull();
  });
});
