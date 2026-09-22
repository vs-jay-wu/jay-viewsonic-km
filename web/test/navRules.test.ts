import { describe, expect, it } from "vitest";
import { APP_NAME, NAV, titleForPath } from "@/lib/navRules";

describe("titleForPath — 分頁標題跟著頁面走", () => {
  it("首頁只有 app 名字", () => {
    expect(titleForPath("/")).toBe(APP_NAME);
  });

  it("側邊欄的頁用側邊欄的字（同一份來源，不會漂移）", () => {
    expect(titleForPath("/git")).toBe(`Repo 檢視 · ${APP_NAME}`);
    expect(titleForPath("/changes")).toBe(`未提交的改動 · ${APP_NAME}`);
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
    expect(titleForPath("/repos/history")).toBe(`Repo 清單 · ${APP_NAME}`);
    expect(titleForPath("/chat/19:abc@thread.v2")).toBe(`Teams 歸檔 · ${APP_NAME}`);
  });

  it("`/gitsomething` 不算 `/git` 的子頁（要整段相符）", () => {
    expect(titleForPath("/gitsomething")).toBe(APP_NAME);
  });

  it("認不得的路徑退回 app 名字，不要亂猜", () => {
    expect(titleForPath("/nope")).toBe(APP_NAME);
  });

  it("每個側邊欄項目都有 label 與 icon（新增時漏填會紅）", () => {
    for (const n of NAV) {
      expect(n.label, n.href).toBeTruthy();
      expect(n.icon, n.href).toBeTruthy();
    }
  });
});
