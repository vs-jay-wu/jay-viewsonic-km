import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, readdir, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import {
  isValidRunId, listRuns, pruneRuns, RETAIN_DAYS, RETAIN_DAYS_AI, RUNS_DIR,
} from "@/lib/prInbox";

// repoPath() 每次呼叫都讀 KM_REPO_ROOT，所以指到暫存目錄就能測真正的檔案操作
let root = "";
const origRoot = process.env.KM_REPO_ROOT;

const NOW = Date.parse("2026-09-11T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

/** 寫一筆假紀錄（連同 .prs.json 與 .log），回傳 id */
async function writeRun(opts: {
  id: string;
  startedAt: string;
  status: string;
  withClaude?: boolean;
  withLog?: boolean;
}): Promise<string> {
  const dir = path.join(root, RUNS_DIR);
  const rec = {
    id: opts.id,
    startedAt: opts.startedAt,
    finishedAt: opts.startedAt,
    status: opts.status,
    note: "測試用",
    trigger: "scheduled",
    prCount: 0,
    prs: [],
    claude: opts.withClaude
      ? { exitCode: 0, sessionId: "s", costUsd: 1, durationMs: 1,
          apiDurationMs: 1, numTurns: 1, isError: false, resultText: "" }
      : null,
  };
  await writeFile(path.join(dir, `${opts.id}.json`), JSON.stringify(rec), "utf8");
  await writeFile(path.join(dir, `${opts.id}.prs.json`), "[]", "utf8");
  if (opts.withLog) await writeFile(path.join(dir, `${opts.id}.log`), "log", "utf8");
  return opts.id;
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "km-prune-"));
  process.env.KM_REPO_ROOT = root;
  await mkdir(path.join(root, RUNS_DIR), { recursive: true });
});

afterEach(async () => {
  if (origRoot === undefined) delete process.env.KM_REPO_ROOT;
  else process.env.KM_REPO_ROOT = origRoot;
  await rm(root, { recursive: true, force: true });
});

describe("isValidRunId", () => {
  it("只認 YYYYMMDD-HHMMSS，擋掉路徑穿越", () => {
    expect(isValidRunId("20260911-080000")).toBe(true);
    expect(isValidRunId("../../etc/passwd")).toBe(false);
    expect(isValidRunId("20260911")).toBe(false);
    expect(isValidRunId("")).toBe(false);
  });
});

describe("pruneRuns 的保留政策", () => {
  it(`沒叫 AI 的留 ${RETAIN_DAYS} 天，派過 AI 的留 ${RETAIN_DAYS_AI} 天`, async () => {
    await writeRun({ id: "20260903-100000", startedAt: daysAgo(8), status: "detected" });
    await writeRun({ id: "20260903-110000", startedAt: daysAgo(8), status: "handled", withClaude: true });
    await writeRun({ id: "20260812-090000", startedAt: daysAgo(31), status: "handled", withClaude: true });
    await writeRun({ id: "20260910-090000", startedAt: daysAgo(1), status: "clean" });

    const res = await pruneRuns(NOW);

    expect(res.deleted.sort()).toEqual(["20260812-090000", "20260903-100000"]);
    const left = (await listRuns()).map((r) => r.id).sort();
    expect(left).toEqual(["20260903-110000", "20260910-090000"]);
  });

  it("aborted 當成 AI 那組 —— 被中斷的最需要事後追", async () => {
    // claude 是 null（被 kill 時還沒有 metadata），但不能因此只留 7 天
    await writeRun({ id: "20260903-120000", startedAt: daysAgo(8), status: "aborted" });
    const res = await pruneRuns(NOW);
    expect(res.deleted).toEqual([]);
    expect(res.keptAi).toBe(1);
  });

  it("刪除時連 .prs.json 與 .log 一起清掉", async () => {
    await writeRun({ id: "20260903-130000", startedAt: daysAgo(8), status: "detected", withLog: true });
    await pruneRuns(NOW);
    const files = await readdir(path.join(root, RUNS_DIR));
    expect(files).toEqual([]);
  });

  it("startedAt 壞掉時退回檔名的時間戳", async () => {
    const dir = path.join(root, RUNS_DIR);
    await writeFile(
      path.join(dir, "20260101-000000.json"),
      JSON.stringify({ id: "20260101-000000", startedAt: "", status: "detected", claude: null, prs: [] }),
      "utf8"
    );
    const res = await pruneRuns(NOW);
    expect(res.deleted).toEqual(["20260101-000000"]);
  });

  it("兩個時間都拿不到就不動它 —— 寧可留著也不要誤刪", async () => {
    const dir = path.join(root, RUNS_DIR);
    // 檔名合法（才會被 listRuns 撿到）但 startedAt 是無法解析的字串，
    // 而檔名的時間戳在這裡是可解析的 —— 所以改用 runIdToMs 也算不出來的情境：
    // 直接把紀錄寫成 startedAt 壞、id 也不是時間的形狀是不可能的（listRuns 會濾掉），
    // 因此這條守的是「startedAt 壞 → 用檔名」那條後路本身不能拋例外。
    await writeFile(
      path.join(dir, "20260911-000000.json"),
      JSON.stringify({ id: "20260911-000000", startedAt: "not-a-date", status: "clean", claude: null, prs: [] }),
      "utf8"
    );
    const res = await pruneRuns(NOW);
    expect(res.deleted).toEqual([]);
  });
});
