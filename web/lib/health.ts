import { readFile, mkdir, writeFile } from "fs/promises";
import path from "path";
import { repoPath } from "@/lib/repo";
import {
  afterFailure, afterSuccess, classifyError, emptyHealth, healthFromRuns, isUnhealthy,
  FAILURE_ALERT_THRESHOLD, type SourceHealth,
} from "@/lib/healthRules";
import { listRuns } from "@/lib/prInbox";

export type { SourceHealth };
export { FAILURE_ALERT_THRESHOLD, isUnhealthy, classifyError };

const FILE = repoPath("data/local-state/health.json");

/**
 * ## 要接一個新的定時服務進來，做三件事
 *
 * 1. 在 `SOURCE_LABELS` 加一列：顯示名、點過去的頁面、給人的第一句提示
 *    （「多半是 X 過期」這種，讓看到的人知道下一步做什麼）。
 * 2. 在它的 `runOnce()` 成敗處呼叫 `recordSuccess(source)` / `recordFailure(source, err)`。
 * 3. 如果那個服務是 shell detached 跑的、TS 看不到結果（像 PR 巡邏），
 *    就從它自己的紀錄反推，照 `derivedPrInboxHealth()` 的樣子寫一個。
 *
 * 判準統一在 `healthRules.ts`，**不要在各自的頁面另外寫一套**：
 * 認證類（token 過期、未登入）第一次就示警，因為它不會自己好；
 * 其餘連續 3 次才示警，因為 1～2 次多半是網路抖一下。
 */

/** 資料來源的顯示名，給首頁的警告用 */
export const SOURCE_LABELS: Record<string, { label: string; href: string; hint: string }> = {
  "vb-bugs": {
    label: "Jira（VB Bug 總覽）",
    href: "/vb-bugs",
    hint: "多半是 .env 的 ATLASSIAN_API_TOKEN 過期",
  },
  "my-prs": {
    label: "GitHub（我的 PR）",
    href: "/my-prs",
    hint: "多半是 gh 未登入或 token 過期，跑 gh auth status 看看",
  },
  "pr-inbox": {
    label: "GitHub（PR 巡邏）",
    href: "/pr-inbox",
    hint: "同樣走 gh；巡邏連續失敗多半是 gh auth 掉了",
  },
};

/**
 * PR 巡邏沒辦法自己回報 —— 它是 shell 腳本 detached 跑的，TS 這邊看不到結果。
 * 所以從執行紀錄反推，規則見 healthRules.healthFromRuns。
 */
async function derivedPrInboxHealth(): Promise<SourceHealth> {
  const runs = await listRuns(50).catch(() => []);
  return healthFromRuns("pr-inbox", runs);
}

type Store = Record<string, SourceHealth>;

async function read(): Promise<Store> {
  const raw = await readFile(FILE, "utf8").catch(() => null);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Store;
  } catch {
    return {};
  }
}

async function write(store: Store): Promise<void> {
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(store, null, 2) + "\n", "utf8");
}

export async function readHealth(): Promise<SourceHealth[]> {
  const store = await read();
  const derived = await derivedPrInboxHealth();
  return Object.keys(SOURCE_LABELS).map((s) =>
    s === "pr-inbox" ? derived : (store[s] ?? emptyHealth(s))
  );
}

export async function recordSuccess(source: string): Promise<void> {
  const store = await read();
  store[source] = afterSuccess(store[source] ?? emptyHealth(source));
  await write(store).catch(() => undefined);
}

export async function recordFailure(source: string, error: string): Promise<void> {
  const store = await read();
  store[source] = afterFailure(store[source] ?? emptyHealth(source), error);
  await write(store).catch(() => undefined);
}

/** 連續失敗到門檻的來源。首頁只顯示這些 —— 偶爾失敗不吵人。 */
export async function unhealthySources(): Promise<SourceHealth[]> {
  return (await readHealth()).filter((h) => isUnhealthy(h));
}
