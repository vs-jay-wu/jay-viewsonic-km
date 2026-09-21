import { describe, expect, it } from "vitest";
import {
  LOG_FORMAT, branchMatchesTicket, fileOrigin, mergeLineFiles, parseLog, parseNameStatus,
  parseSessionTrailer,
} from "@/lib/workChangesRules";
import type { ChangedFile } from "@/lib/changesRules";

describe("parseSessionTrailer — session ↔ commit 唯一精確的那條關聯", () => {
  it("認得完整的 trailer", () => {
    const msg = [
      "✨ feat: 做了什麼",
      "",
      "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>",
      "Claude-Session: https://claude.ai/code/session_01Rnv34yBAUraPhRygfJ5h3f",
    ].join("\n");
    expect(parseSessionTrailer(msg)).toBe("01Rnv34yBAUraPhRygfJ5h3f");
  });

  it("沒有 trailer 就回 null（不要用別的線索猜是誰做的）", () => {
    expect(parseSessionTrailer("🐛 fix: 修一下\n\nCo-Authored-By: 某人 <x@y>")).toBeNull();
    expect(parseSessionTrailer("內文提到 Claude-Session 但不是 trailer 形狀")).toBeNull();
  });
});

describe("parseLog", () => {
  const rec = (sha: string, subject: string, body: string) =>
    [sha, "Jay Wu", "2026-09-14T10:00:00+08:00", subject, body].join("\x1f") + "\x1e";

  it("拆成一筆一筆，順便解 trailer", () => {
    const out = parseLog(
      rec("a".repeat(40), "✨ feat: A", "✨ feat: A\n\nClaude-Session: https://claude.ai/code/session_ABC123") +
        "\n" +
        rec("b".repeat(40), "🐛 fix: B", "🐛 fix: B")
    );
    expect(out).toHaveLength(2);
    expect(out[0].shortSha).toBe("aaaaaaaa");
    expect(out[0].sessionId).toBe("ABC123");
    expect(out[1].sessionId).toBeNull();
    expect(out[1].subject).toBe("🐛 fix: B");
  });

  it("空輸出回空陣列", () => {
    expect(parseLog("")).toEqual([]);
    expect(parseLog("\n")).toEqual([]);
  });

  it("LOG_FORMAT 用的分隔字元不會出現在一般訊息裡", () => {
    expect(LOG_FORMAT).toContain("%x1f");
    expect(LOG_FORMAT).toContain("%x1e");
  });
});

describe("parseNameStatus", () => {
  it("認得增刪改與改名", () => {
    const out = parseNameStatus(
      ["M\tlib/a.ts", "A\tlib/b.ts", "D\tlib/c.ts", "R100\told/x.ts\tnew/x.ts"].join("\n")
    );
    expect(out).toEqual([
      { path: "lib/a.ts", kind: "modified", staged: false, unstaged: false },
      { path: "lib/b.ts", kind: "added", staged: false, unstaged: false },
      { path: "lib/c.ts", kind: "deleted", staged: false, unstaged: false },
      { path: "new/x.ts", kind: "renamed", staged: false, unstaged: false, from: "old/x.ts" },
    ]);
  });
});

describe("mergeLineFiles", () => {
  const f = (path: string, kind: ChangedFile["kind"] = "modified"): ChangedFile => ({
    path, kind, staged: false, unstaged: false,
  });

  it("標出「只在 commit」「只在工作區」「兩邊都有」", () => {
    const out = mergeLineFiles(
      [f("a.ts"), f("b.ts")],
      ["a.ts"],
      [f("b.ts")]
    );
    expect(out.map((x) => [x.path, x.inCommits, x.inWip])).toEqual([
      ["a.ts", true, false],
      ["b.ts", false, true],
    ]);
  });

  it("同一個檔案兩邊都動過只出現一次", () => {
    const out = mergeLineFiles([f("a.ts")], ["a.ts"], [f("a.ts")]);
    expect(out).toHaveLength(1);
    expect(out[0].inCommits && out[0].inWip).toBe(true);
  });

  it("未追蹤的檔案要從 status 補進來（git diff 看不到它們）", () => {
    const out = mergeLineFiles([], [], [f("new.png", "untracked")]);
    expect(out.map((x) => [x.path, x.kind, x.inWip])).toEqual([["new.png", "untracked", true]]);
  });

  it("工作區的一般修改**不會**被當成新項目補進來（它一定已經在整體 diff 裡）", () => {
    // 若 base..工作區 沒有它，代表那個改動把檔案改回 base 的樣子了
    const out = mergeLineFiles([], [], [f("same-as-base.ts")]);
    expect(out).toEqual([]);
  });
});

describe("branchMatchesTicket", () => {
  it("比數字、不管大小寫與前綴", () => {
    expect(branchMatchesTicket("Jay/VSFT-6310", "VSFT-6310")).toBe(true);
    expect(branchMatchesTicket("jay/vb-1945-font", "VB-1945")).toBe(true);
    expect(branchMatchesTicket("feature/1945_fix", "VB-1945")).toBe(true);
    // 跨專案搬號（VSFT-6964 → VB-2158）時分支名還是舊的，比數字才連得起來
    expect(branchMatchesTicket("Jay/VSFT-1945", "VB-1945")).toBe(true);
  });

  it("數字要有邊界，不能被更長的號碼吃到", () => {
    expect(branchMatchesTicket("Jay/VB-19450", "VB-1945")).toBe(false);
    expect(branchMatchesTicket("Jay/VB-11945", "VB-1945")).toBe(false);
  });

  it("沒有分支或沒有票就不成立", () => {
    expect(branchMatchesTicket(null, "VB-1945")).toBe(false);
    expect(branchMatchesTicket("master", null)).toBe(false);
    expect(branchMatchesTicket("master", "PR:km#12")).toBe(false);
  });
});

describe("fileOrigin", () => {
  const base = { path: "a.ts", kind: "modified" as const, staged: false, unstaged: true };
  it("三種狀態各有標示", () => {
    expect(fileOrigin({ ...base, inCommits: true, inWip: true }).label).toBe("C+W");
    expect(fileOrigin({ ...base, inCommits: true, inWip: false }).label).toBe("C");
    expect(fileOrigin({ ...base, inCommits: false, inWip: true }).label).toBe("W");
  });
});
