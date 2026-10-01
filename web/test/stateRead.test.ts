import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, writeFile, mkdir } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

const cfg = vi.hoisted(() => ({ value: null as unknown }));
const root = vi.hoisted(() => ({ dir: "" }));
vi.mock("@/lib/kmRole", () => ({ kmConfig: () => cfg.value }));
vi.mock("@/lib/repo", () => ({ repoPath: (...s: string[]) => path.join(root.dir, ...s) }));

import { readStateFile } from "@/lib/stateRead";
import { statePath, cachePath } from "@/lib/statePaths";

const SAT = { role: "satellite", hubUrl: "http://hub:9487", machine: { id: "i", name: "B" } };
const HUB = { role: "hub", machine: { id: "i", name: "A" } };

beforeEach(async () => {
  root.dir = await mkdtemp(path.join(tmpdir(), "km-stateread-"));
  cfg.value = null;
  // memo 掛在 globalThis，不清的話下一條測試會拿到上一條的結果
  delete (globalThis as { __kmStateMemo?: unknown }).__kmStateMemo;
  delete (globalThis as { __kmHubStatus?: unknown }).__kmHubStatus;
  await mkdir(path.join(root.dir, "data", "hub"), { recursive: true });
  await mkdir(path.join(root.dir, "data", "cache"), { recursive: true });
  await mkdir(path.join(root.dir, "data", "machine"), { recursive: true });
});
afterEach(() => vi.unstubAllGlobals());

const F = () => statePath("my-prs.json");

describe("hub 擁有的狀態要去哪裡讀", () => {
  it("hub 自己讀磁碟", async () => {
    cfg.value = HUB;
    await writeFile(F(), '{"from":"disk"}', "utf8");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await readStateFile(F())).toBe('{"from":"disk"}');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("satellite 去跟 hub 要，並把結果存進快取", async () => {
    cfg.value = SAT;
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"from":"hub"}', { status: 200 })));
    expect(await readStateFile(F())).toBe('{"from":"hub"}');
    expect(await readFile(cachePath("my-prs.json"), "utf8")).toBe('{"from":"hub"}');
  });

  it("hub 連不上時回快取 —— 這就是「顯示上次的資料」", async () => {
    cfg.value = SAT;
    await writeFile(cachePath("my-prs.json"), '{"from":"cache"}', "utf8");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    expect(await readStateFile(F())).toBe('{"from":"cache"}');
  });

  it("連不上又沒有快取就是 null，不是丟例外", async () => {
    // 第一次用的那台機器就是這個情況，整頁不該因此 500
    cfg.value = SAT;
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    expect(await readStateFile(F())).toBeNull();
  });

  it("hub 回 404 ＝「還沒有這個檔」，不算失敗，也不要蓋掉快取", async () => {
    // 「hub 上還沒抓過」跟「hub 掛了」要分得開，否則警告列會一直說連不上
    cfg.value = SAT;
    await writeFile(cachePath("my-prs.json"), '{"old":true}', "utf8");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    expect(await readStateFile(F())).toBeNull();
    expect(await readFile(cachePath("my-prs.json"), "utf8")).toBe('{"old":true}');
  });

  it("machine 擁有的檔不管角色都讀磁碟", async () => {
    cfg.value = SAT;
    const local = statePath("ui-settings.json");
    await writeFile(local, '{"theme":"dark"}', "utf8");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await readStateFile(local)).toBe('{"theme":"dark"}');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("同一份狀態短時間內只打一次 hub", async () => {
    cfg.value = SAT;
    const f = vi.fn(async () => new Response('{"x":1}', { status: 200 }));
    vi.stubGlobal("fetch", f);
    await readStateFile(F());
    await readStateFile(F());
    await readStateFile(F());
    expect(f).toHaveBeenCalledTimes(1);
  });
});
