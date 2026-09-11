import { describe, expect, it } from "vitest";
import {
  canonicalRepo, defaultSessionTitleForPr, defaultSessionTitleForTicket,
  formatSessionTitle, keyNumber, matchKnownKey,
  parsePrTicketKey, parseSessionTitle, ticketUrl, workKeyOf,
} from "@/lib/workItemRules";

// 下面的標題全部逐字取自 Jay 本機的 session 清單（2026-09-11 實際跑過一次）
describe("parseSessionTitle — 明確寫出 key 的", () => {
  it("[km/mvbf] VB-1945", () => {
    const r = parseSessionTitle("[km/mvbf] VB-1945");
    expect(r).toMatchObject({ ticketKey: "VB-1945", ticketGuessed: false, scope: "km/mvbf", repo: "mvbf", desc: "" });
  });

  it("舊的 VSFT／MT 單也要認得（既有 session 還在用）", () => {
    expect(parseSessionTitle("[km/cs] VSFT-10092 resize").ticketKey).toBe("VSFT-10092");
    expect(parseSessionTitle("[km/mvb-mac] MT-3074 spec").ticketKey).toBe("MT-3074");
  });

  it("沒有 bracket 也能從內文抓 key", () => {
    const r = parseSessionTitle("幫我 review Jay/VSFT-9727-question-menu-style 這條分支");
    expect(r.ticketKey).toBe("VSFT-9727");
    expect(r.scope).toBeNull();
  });
});

describe("parseSessionTitle — 裸數字", () => {
  it("補成 VB 並標記成猜的（Jay 2026-09-11 裁定一律當 VB）", () => {
    const r = parseSessionTitle("[km/mvbf] 9208 font fallback");
    expect(r).toMatchObject({ ticketKey: "VB-9208", ticketGuessed: true, desc: "font fallback" });
  });

  it("明確的 key 優先於裸數字", () => {
    const r = parseSessionTitle("[km/mvbf] VSFT-9739 region cache 2");
    expect(r.ticketKey).toBe("VSFT-9739");
    expect(r.ticketGuessed).toBe(false);
  });

  it("拿掉 key 之後留下的連接符號要清掉", () => {
    expect(parseSessionTitle("[km/mvbf] 10002 - pptx parser 圖片跑版").desc)
      .toBe("pptx parser 圖片跑版");
  });

  it("一位數與七位數不當成單號（太容易誤判）", () => {
    expect(parseSessionTitle("[km] 3 個問題").ticketKey).toBeNull();
    expect(parseSessionTitle("[km] 1234567 筆").ticketKey).toBeNull();
  });
});

describe("parseSessionTitle — PR 寫法", () => {
  it("PR#237 / #237 都認得", () => {
    expect(parseSessionTitle("[km/mvbf] PR#237 review 意見").prNumber).toBe(237);
    expect(parseSessionTitle("[km/mvbf] #578 修 KB").prNumber).toBe(578);
  });

  it("PR 編號不會被當成裸數字單號", () => {
    const r = parseSessionTitle("[km/mvbf] PR#237 review");
    expect(r.prNumber).toBe(237);
    expect(r.ticketKey).toBeNull();
  });

  it("單號與 PR 可以並存", () => {
    const r = parseSessionTitle("[km/cs] VB-1992 PR#12 quiz");
    expect(r).toMatchObject({ ticketKey: "VB-1992", prNumber: 12, desc: "quiz" });
  });
});

describe("parseSessionTitle — 不符合規則的就不要硬湊", () => {
  it.each([
    "handle-pr-inbox /handle-pr-inbox",
    "[km/cs] ms room",
    "我們有哪些 repo 有使用到 SYSTEM_ALERT_WINDOW？",
    "",
  ])("%s → 沒有關聯", (t) => {
    const r = parseSessionTitle(t);
    expect(r.ticketKey).toBeNull();
    expect(r.prNumber).toBeNull();
  });

  it("scope 只有一段時 repo 就是它", () => {
    expect(parseSessionTitle("[cs] review").repo).toBe("cs");
    expect(parseSessionTitle("[~] 記憶體研究").repo).toBe("~");
  });
});

describe("parsePrTicketKey", () => {
  it("從分支名抓", () => {
    expect(parsePrTicketKey({ title: "修字體", headRefName: "Jay/VSFT-9208-font" })).toBe("VSFT-9208");
  });

  it("從標題抓（mvbf 的格式）", () => {
    expect(parsePrTicketKey({ title: "[User Story VSFT-9941] 埋點", headRefName: "Jay/tracking" }))
      .toBe("VSFT-9941");
  });

  it("**不猜裸數字** —— 分支名裡的數字太常是別的東西", () => {
    expect(parsePrTicketKey({ title: "bump to 1.2.3", headRefName: "Jay/9208-ish" })).toBeNull();
  });
});

describe("workKeyOf / ticketUrl / formatSessionTitle", () => {
  it("有單就用單號當主鍵", () => {
    expect(workKeyOf({ ticketKey: "VB-1", repo: "mvbf", prNumber: 9 })).toBe("VB-1");
  });

  it("沒單就用 repo#PR", () => {
    expect(workKeyOf({ ticketKey: null, repo: "mvbf", prNumber: 237 })).toBe("PR:mvbf#237");
  });

  it("兩者都沒有就沒有主鍵", () => {
    expect(workKeyOf({ ticketKey: null, repo: "mvbf", prNumber: null })).toBeNull();
  });

  it("ticket 連結指向 VSI 的站台", () => {
    expect(ticketUrl("VB-1945")).toBe("https://viewsonic-vsi.atlassian.net/browse/VB-1945");
  });

  it("產生的標題吃得回自己的解析（round-trip）", () => {
    const title = formatSessionTitle({ scope: "km/mvbf", ticketKey: "VB-1945", desc: "字體 fallback" });
    expect(title).toBe("[km/mvbf] VB-1945 字體 fallback");
    expect(parseSessionTitle(title)).toMatchObject({
      ticketKey: "VB-1945", scope: "km/mvbf", desc: "字體 fallback",
    });
  });
});

describe("matchKnownKey — 裸數字先比對已知的明確 key", () => {
  // 由來：[km/cs] 9904 i18n 照預設會變 VB-9904，但 PR 分支明寫 VSFT-9904
  const known = ["VSFT-9904", "VSFT-9718", "VB-1945"];

  it("同號只有一個候選就採用它", () => {
    expect(matchKnownKey("9904", known)).toBe("VSFT-9904");
    expect(matchKnownKey("1945", known)).toBe("VB-1945");
  });

  it("同號撞到兩個 project 就不猜（交給呼叫端退回預設）", () => {
    expect(matchKnownKey("9904", [...known, "VB-9904"])).toBeNull();
  });

  it("沒有同號的就回 null", () => {
    expect(matchKnownKey("9208", known)).toBeNull();
    expect(matchKnownKey("", known)).toBeNull();
  });

  it("不會把 9904 當成 19904 的同號", () => {
    expect(matchKnownKey("904", known)).toBeNull();
  });
});

describe("keyNumber", () => {
  it.each([["VB-1945", "1945"], ["VSFT-10092", "10092"]])("%s → %s", (k, n) => {
    expect(keyNumber(k)).toBe(n);
  });

  it.each([null, undefined, "PR:mvbf#237", "亂寫"])("%s → null", (k) => {
    expect(keyNumber(k as string | null)).toBeNull();
  });
});

describe("canonicalRepo", () => {
  it("文件裡寫死的兩條別名", () => {
    expect(canonicalRepo("mvbf")).toBe("edu-droid-flutter");
    expect(canonicalRepo("cs")).toBe("ragdoll-cat");
  });

  it("動態別名（來自 repos-overview.json）優先於內建", () => {
    expect(canonicalRepo("cs backend", { "cs backend": "ocelot" })).toBe("ocelot");
  });

  it("owner/repo 只取 repo 那一段", () => {
    expect(canonicalRepo("Viewsonic-EDU/edu-droid-flutter")).toBe("edu-droid-flutter");
  });

  it("認不得就原樣（小寫）", () => {
    expect(canonicalRepo("Some-New-Repo")).toBe("some-new-repo");
    expect(canonicalRepo(null)).toBeNull();
  });
});

describe("defaultSessionTitleForPr", () => {
  it("用口語別名，並去掉標題開頭的票號 bracket（不然單號會出現兩次）", () => {
    expect(defaultSessionTitleForPr({
      repo: "Viewsonic-EDU/edu-droid-flutter", number: 237,
      title: "[User Story VSFT-9941] 工具埋點", headRefName: "Jay/VSFT-9941-tracking",
    })).toBe("[km/mvbf] VSFT-9941 工具埋點");
  });

  it("沒有票號就用 PR 編號當關聯", () => {
    expect(defaultSessionTitleForPr({
      repo: "Viewsonic-EDU/ragdoll-cat", number: 12, title: "chore: bump deps",
    })).toBe("[km/cs] PR#12 chore: bump deps");
  });

  it("認不得的 repo 就用 repo 名", () => {
    expect(defaultSessionTitleForPr({
      repo: "Viewsonic-EDU/ocelot", number: 5, title: "fix latex",
    })).toBe("[km/ocelot] PR#5 fix latex");
  });

  it("產生的標題吃得回自己的解析", () => {
    const t = defaultSessionTitleForPr({
      repo: "Viewsonic-EDU/edu-droid-flutter", number: 237,
      title: "[Task VB-1945] 字體", headRefName: "Jay/VB-1945",
    });
    expect(parseSessionTitle(t)).toMatchObject({ ticketKey: "VB-1945", scope: "km/mvbf" });
  });
});

describe("defaultSessionTitleForTicket", () => {
  it("知道 repo 就用別名", () => {
    expect(defaultSessionTitleForTicket({
      key: "VB-2158", summary: "[Droid-100655] [MVBFv3] text size is not absolute",
      repo: "Viewsonic-EDU/edu-droid-flutter",
    })).toBe("[km/mvbf] VB-2158 text size is not absolute");
  });

  it("不知道 repo 就只寫 [km]，**不從 summary 的產品前綴猜**", () => {
    expect(defaultSessionTitleForTicket({
      key: "VB-2158", summary: "[MVBFv3] text size is not absolute",
    })).toBe("[km] VB-2158 text size is not absolute");
  });

  it("產生的標題吃得回自己的解析", () => {
    const t = defaultSessionTitleForTicket({ key: "VB-2158", summary: "文字大小" });
    expect(parseSessionTitle(t)).toMatchObject({ ticketKey: "VB-2158", scope: "km" });
  });
});
