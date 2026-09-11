import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import { pickTitle, scanTitleRecords, type MetaCacheEntry } from "@/lib/sessions";

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "km-session-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const line = (o: unknown) => JSON.stringify(o) + "\n";
/** 一行很長的對話紀錄，用來把後面的記錄推到 head 視窗之外 */
const filler = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    line({ type: "assistant", message: { content: [{ type: "text", text: "x".repeat(2000) }] }, seq: i })
  ).join("");

async function writeSession(content: string): Promise<string> {
  const file = path.join(dir, "s.jsonl");
  await writeFile(file, content, "utf8");
  return file;
}

describe("scanTitleRecords", () => {
  it("抓得到落在開頭 64KB 之外的 custom-title", async () => {
    // 這就是實際踩到的那個 bug：/rename 是對話進行到一半才寫入的，
    // 真實案例落在 48MB 檔案的第 2.9MB，只讀開頭就會漏掉。
    const file = await writeSession(
      filler(60) + // 約 120KB，遠超過 64KB 的 head 視窗
        line({ type: "custom-title", customTitle: "[km/mvbf] 9208 font fallback" }) +
        filler(5)
    );
    const r = await scanTitleRecords(file);
    expect(r.customTitle).toBe("[km/mvbf] 9208 font fallback");
  });

  it("同一種記錄取最後一筆 —— 最新的改名才是現在的標題", async () => {
    const file = await writeSession(
      line({ type: "custom-title", customTitle: "舊名字" }) +
        filler(3) +
        line({ type: "custom-title", customTitle: "新名字" })
    );
    expect((await scanTitleRecords(file)).customTitle).toBe("新名字");
  });

  it("custom-title 與 agent-name 分開收", async () => {
    const file = await writeSession(
      line({ type: "agent-name", agentName: "某個 agent" }) +
        line({ type: "custom-title", customTitle: "我取的名字" })
    );
    const r = await scanTitleRecords(file);
    expect(r.agentName).toBe("某個 agent");
    expect(r.customTitle).toBe("我取的名字");
  });

  it("壞掉的行不會讓整份掃描失敗", async () => {
    const file = await writeSession(
      "{ 這不是 JSON\n" +
        line({ type: "custom-title", customTitle: "還是找得到" }) +
        '{"type":"custom-title","customTitle":"半行被切斷'
    );
    expect((await scanTitleRecords(file)).customTitle).toBe("還是找得到");
  });

  it("從 fromOffset 之後掃 —— 檔案變長時只掃新增的那段", async () => {
    const head = line({ type: "custom-title", customTitle: "前段的名字" });
    const file = await writeSession(head + line({ type: "custom-title", customTitle: "後段的名字" }));
    const r = await scanTitleRecords(file, Buffer.byteLength(head));
    expect(r.customTitle).toBe("後段的名字"); // 沒有把前段的又讀進來
  });

  it("沒有標題記錄就回 null，且 scannedBytes 等於檔案長度", async () => {
    const body = filler(2);
    const file = await writeSession(body);
    const r = await scanTitleRecords(file);
    expect(r.customTitle).toBeNull();
    expect(r.agentName).toBeNull();
    expect(r.scannedBytes).toBe(Buffer.byteLength(body));
  });
});

describe("pickTitle 的優先序", () => {
  const base: MetaCacheEntry = {
    size: 0, mtimeMs: 0, scannedBytes: 0,
    customTitle: null, agentName: null, promptTitle: "(未命名)",
    cwd: null, gitBranch: null, version: null, createdAt: null,
  };

  it("custom-title 最優先", () => {
    expect(pickTitle({ ...base, customTitle: "自訂", agentName: "agent", promptTitle: "第一句" }))
      .toEqual({ title: "自訂", titleSource: "custom" });
  });

  it("沒有自訂就用 agent 名", () => {
    expect(pickTitle({ ...base, agentName: "agent", promptTitle: "第一句" }))
      .toEqual({ title: "agent", titleSource: "agent" });
  });

  it("都沒有才退回第一句 prompt", () => {
    expect(pickTitle({ ...base, promptTitle: "第一句" }))
      .toEqual({ title: "第一句", titleSource: "prompt" });
  });

  it("全都沒有就是未命名", () => {
    expect(pickTitle(base)).toEqual({ title: "(未命名)", titleSource: "none" });
  });
});
