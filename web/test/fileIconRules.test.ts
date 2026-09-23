import { describe, expect, it } from "vitest";
import { fileIconOf, folderIconOf } from "@/lib/fileIconRules";
import { FALLBACK_FILE_ICON, FALLBACK_FOLDER_ICON, FOLDER_OPEN_ICON } from "@/lib/fileIconsData";

describe("fileIconOf", () => {
  it("常見的副檔名對得到各自的圖示", () => {
    expect(fileIconOf("lib/main.dart")).toBe("dart");
    expect(fileIconOf("Foo.kt")).toBe("kotlin");
    expect(fileIconOf("app/page.tsx")).toBe("react_ts");
    expect(fileIconOf("lib/x.ts")).toBe("typescript");
    expect(fileIconOf("a/b/icon.svg")).toBe("svg");
    expect(fileIconOf("README.zh.md")).toBe("markdown");
  });

  it("完整檔名比副檔名優先", () => {
    // 不然 package.json 會跟其他 json 長一樣，看不出它是專案的入口
    expect(fileIconOf("package.json")).toBe("nodejs");
    expect(fileIconOf("web/package.json")).toBe("nodejs");
    expect(fileIconOf("tsconfig.json")).not.toBe(fileIconOf("data.json"));
  });

  it("複合副檔名比單一副檔名優先", () => {
    // `.lock` 之類的只有在完整比對時才對得到
    expect(fileIconOf("yarn.lock")).toBe(fileIconOf("YARN.LOCK"));
    expect(fileIconOf("pnpm-lock.yaml")).not.toBe(fileIconOf("config.yaml"));
  });

  it("大小寫不影響", () => {
    expect(fileIconOf("A/B/Main.DART")).toBe("dart");
    expect(fileIconOf("Dockerfile")).toBe(fileIconOf("dockerfile"));
  });

  it("沒有副檔名或認不得的用預設", () => {
    expect(fileIconOf("Procfile")).toBe(FALLBACK_FILE_ICON);
    expect(fileIconOf("a/b/notes")).toBe(FALLBACK_FILE_ICON);
    expect(fileIconOf("x.qqq")).toBe(FALLBACK_FILE_ICON);
  });

  it("空字串與只有路徑的情況不會炸", () => {
    expect(fileIconOf("")).toBe(FALLBACK_FILE_ICON);
    expect(fileIconOf("a/b/")).toBe(FALLBACK_FILE_ICON);
  });

  it("以點開頭的檔案不會被當成「只有副檔名」", () => {
    // `.gitignore` 的 name 是 `.gitignore`，切出來第一段是空的
    expect(fileIconOf(".gitignore")).toBe("git");
    expect(fileIconOf("a/.gitignore")).toBe("git");
  });

});

describe("folderIconOf", () => {
  it("依名字給圖示", () => {
    expect(folderIconOf("src")).toBe("folder-src");
    expect(folderIconOf("test")).toBe("folder-test");
    expect(folderIconOf("android")).toBe("folder-android");
    expect(folderIconOf("images")).toBe("folder-images");
  });

  it("開頭的點要去掉再查", () => {
    // 上游的表寫的是 `github`／`claude`，而目錄叫 `.github`／`.claude`；
    // 不去點的話這些最好認的資料夾反而吃預設圖示
    expect(folderIconOf(".github")).toBe("folder-github");
    expect(folderIconOf(".claude")).toBe("folder-claude");
    expect(folderIconOf(".vscode")).toBe("folder-vscode");
  });

  it("只看最後一段，不受前面的路徑影響", () => {
    expect(folderIconOf("a/b/test")).toBe(folderIconOf("test"));
    expect(folderIconOf("lib/src/")).toBe(folderIconOf("src"));
  });

  it("大小寫不影響", () => {
    expect(folderIconOf("Android")).toBe("folder-android");
  });

  it("認不得的名字用預設資料夾圖示", () => {
    expect(folderIconOf("images_bgv")).toBe(FALLBACK_FOLDER_ICON);
    expect(folderIconOf("")).toBe(FALLBACK_FOLDER_ICON);
  });

  it("只有沒對照的資料夾分開／關 —— 有專屬圖示的上游只有一種樣子", () => {
    expect(folderIconOf("images_bgv", true)).toBe(FOLDER_OPEN_ICON);
    expect(folderIconOf("src", true)).toBe("folder-src");
  });
});
