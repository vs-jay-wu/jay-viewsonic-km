import { describe, expect, it } from "vitest";
import { APP_NAME, NAV, isActiveNav, titleForPath } from "@/lib/navRules";

describe("titleForPath — 分頁標題跟著頁面走", () => {
  it("首頁只有 app 名字", () => {
    expect(titleForPath("/")).toBe(APP_NAME);
  });

  it("側邊欄的頁用側邊欄的字（同一份來源，不會漂移）", () => {
    expect(titleForPath("/docs")).toBe(`文件 · ${APP_NAME}`);
    expect(titleForPath("/changes")).toBe(`未提交的改動 · ${APP_NAME}`);
  });

  it("工作台的兩個視圖各有自己的標題（側邊欄只有一個入口，標題仍要分）", () => {
    expect(titleForPath("/repo/code")).toBe(`程式碼 · ${APP_NAME}`);
    expect(titleForPath("/repo/git")).toBe(`版本 · ${APP_NAME}`);
    expect(titleForPath("/repo")).toBe(`Repositories · ${APP_NAME}`);
  });

  it("不在側邊欄的頁也有自己的標題", () => {
    expect(titleForPath("/my-prs")).toBe(`我的 PR · ${APP_NAME}`);
    expect(titleForPath("/pr-inbox")).toBe(`PR 巡邏 · ${APP_NAME}`);
  });

  /*
   * 這條是這支函式唯一容易寫錯的地方：用「開頭相符」找標題時，`/repos/history`
   * 會同時符合 `/` 與 `/repos`。取最長的那個才對，不然所有子頁都會叫「首頁」。
   */
  it("子頁落到最長的前綴，不是落到首頁", () => {
    expect(titleForPath("/repos/history")).toBe(`Repositories 總覽 · ${APP_NAME}`);
    expect(titleForPath("/chat/19:abc@thread.v2")).toBe(`Teams 歸檔 · ${APP_NAME}`);
  });

  it("相符要以「段」為單位，不是字串開頭", () => {
    // `/repo/codex` 不是 `/repo/code` 的子頁，但它**是** `/repo` 的 —— 落到父層才對
    expect(titleForPath("/repo/codex")).toBe(`Repositories · ${APP_NAME}`);
    // `/repository` 跟 `/repo` 只是字串開頭相同，不該被當成它的子頁
    expect(titleForPath("/repository")).toBe(APP_NAME);
  });

  it("認不得的路徑退回 app 名字，不要亂猜", () => {
    expect(titleForPath("/nope")).toBe(APP_NAME);
  });

  it("每個側邊欄項目都有 label 與 icon（新增時漏填會紅）", () => {
    for (const n of NAV) {
      expect(n.label, n.href).toBeTruthy();
      expect(n.icon, n.href).toBeTruthy();
      // 帶 query 的 href 會讓側邊欄得讀 useSearchParams，那會弄壞整個群組的預渲染
      expect(n.href.includes("?"), n.href).toBe(false);
    }
  });
});

describe("isActiveNav — 側邊欄哪一項該亮", () => {
  const repo = NAV.find((n) => n.label === "Repositories")!;
  const changes = NAV.find((n) => n.label === "未提交的改動")!;

  it("工作台的兩個視圖都算在同一個項目上", () => {
    expect(isActiveNav(repo, "/repo")).toBe(true);
    expect(isActiveNav(repo, "/repo/code")).toBe(true);
    expect(isActiveNav(repo, "/repo/git")).toBe(true);
    expect(isActiveNav(repo, "/repos")).toBe(false); // 「Repo 清單」是另一頁
  });

  it("其他頁不受影響，而且要整段相符", () => {
    expect(isActiveNav(changes, "/changes")).toBe(true);
    expect(isActiveNav(changes, "/changes/x")).toBe(true);
    expect(isActiveNav(changes, "/changesomething")).toBe(false);
  });

  it("首頁只有正好在首頁才亮", () => {
    const home = NAV.find((n) => n.href === "/")!;
    expect(isActiveNav(home, "/")).toBe(true);
    expect(isActiveNav(home, "/repo/code")).toBe(false);
  });
});
