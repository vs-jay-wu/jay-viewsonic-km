import { describe, expect, it } from "vitest";
import {
  formatDuration, matchesHistoryFilter, matchesHistoryQuery, parseHistory,
  summarize, throughput,
  type MoveRecord,
} from "@/lib/repoMoveHistoryRules";

function rec(over: Partial<MoveRecord> = {}): MoveRecord {
  return {
    startedAt: "2026-09-11T13:00:00+0800",
    finishedAt: "2026-09-11T13:00:10+0800",
    durationSec: 10,
    repo: "ocelot",
    org: "Viewsonic-EDU",
    action: "offload",
    status: "done",
    source: "web",
    sourcePath: "/local/ocelot",
    destination: "/ext/ocelot",
    bytes: 1024 * 1024,
    fileCount: 42,
    note: "",
    ...over,
  };
}

describe("parseHistory", () => {
  const line = (o: object) => JSON.stringify(o);

  it("最新的排在最前面（檔案是依時間 append 的）", () => {
    const text = [
      line({ startedAt: "a", repo: "first", action: "offload" }),
      line({ startedAt: "b", repo: "second", action: "restore" }),
    ].join("\n");
    expect(parseHistory(text).map((r) => r.repo)).toEqual(["second", "first"]);
  });

  it("壞掉的行跳過，不讓整頁掛掉", () => {
    // append-only 的檔案，最後一行可能是寫到一半被中斷的
    const text = [
      line({ startedAt: "a", repo: "good", action: "offload" }),
      '{"startedAt": "b", "repo": "trunc',
      "",
      "   ",
    ].join("\n");
    expect(parseHistory(text).map((r) => r.repo)).toEqual(["good"]);
  });

  it("少了必要欄位的行不算一筆", () => {
    expect(parseHistory(line({ startedAt: "a", action: "offload" }))).toEqual([]);
    expect(parseHistory(line({ repo: "x", action: "offload" }))).toEqual([]);
  });

  it("缺的選填欄位補預設值，status 只認 done／error", () => {
    const [r] = parseHistory(line({ startedAt: "a", repo: "x", action: "offload" }));
    expect(r).toMatchObject({ status: "done", source: "cli", bytes: 0, fileCount: 0, note: "" });
    const [bad] = parseHistory(line({ startedAt: "a", repo: "x", action: "offload", status: "???" }));
    expect(bad.status).toBe("done");
  });
});

describe("matchesHistoryFilter", () => {
  it("「只看搬出」不包含失敗的那些 —— 它們沒有真的搬動", () => {
    expect(matchesHistoryFilter(rec({ action: "offload" }), "offload")).toBe(true);
    expect(matchesHistoryFilter(rec({ action: "offload", status: "error" }), "offload")).toBe(false);
  });

  it("「只看失敗」不分方向", () => {
    expect(matchesHistoryFilter(rec({ action: "restore", status: "error" }), "error")).toBe(true);
    expect(matchesHistoryFilter(rec({ status: "done" }), "error")).toBe(false);
  });

  it("全部就是全過", () => {
    expect(matchesHistoryFilter(rec({ status: "error" }), "all")).toBe(true);
  });
});

describe("matchesHistoryQuery", () => {
  it("repo 名與備註都搜得到，多個詞要全中", () => {
    const r = rec({ repo: "fishing-cat", note: "權限依 manifest 還原" });
    expect(matchesHistoryQuery(r, "fishing")).toBe(true);
    expect(matchesHistoryQuery(r, "manifest")).toBe(true);
    expect(matchesHistoryQuery(r, "fishing manifest")).toBe(true);
    expect(matchesHistoryQuery(r, "fishing 找不到")).toBe(false);
  });

  it("空字串不篩", () => {
    expect(matchesHistoryQuery(rec(), "   ")).toBe(true);
  });
});

describe("summarize", () => {
  it("失敗的只計次，不計入搬動量（它們最後原地還原）", () => {
    const s = summarize([
      rec({ action: "offload", bytes: 100 }),
      rec({ action: "offload", bytes: 200, status: "error" }),
      rec({ action: "restore", bytes: 50 }),
    ]);
    expect(s).toEqual({
      total: 3,
      offloaded: 1,
      restored: 1,
      failed: 1,
      bytesOffloaded: 100,
      bytesRestored: 50,
    });
  });

  it("沒有紀錄時全是 0", () => {
    expect(summarize([])).toMatchObject({ total: 0, failed: 0, bytesOffloaded: 0 });
  });
});

describe("throughput", () => {
  it("秒數太短就不給速度（小檔案會算出天文數字）", () => {
    expect(throughput(rec({ durationSec: 0.4 }))).toBeNull();
  });

  it("失敗的不給速度", () => {
    expect(throughput(rec({ status: "error" }))).toBeNull();
  });

  it("正常算 bytes/秒", () => {
    expect(throughput(rec({ bytes: 1000, durationSec: 4 }))).toBe(250);
  });
});

describe("formatDuration", () => {
  it("各級距", () => {
    expect(formatDuration(0.3)).toBe("不到 1 秒");
    expect(formatDuration(45)).toBe("45 秒");
    expect(formatDuration(125)).toBe("2 分 5 秒");
    expect(formatDuration(120)).toBe("2 分");
  });
});
