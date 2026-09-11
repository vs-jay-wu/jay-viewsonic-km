import { readFile, mkdir, writeFile } from "fs/promises";
import path from "path";
import { repoPath } from "@/lib/repo";
import {
  afterFailure, afterSuccess, emptyHealth, isUnhealthy,
  FAILURE_ALERT_THRESHOLD, type SourceHealth,
} from "@/lib/healthRules";

export type { SourceHealth };
export { FAILURE_ALERT_THRESHOLD, isUnhealthy };

const FILE = repoPath("data/local-state/health.json");

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
};

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
  return Object.keys(SOURCE_LABELS).map((s) => store[s] ?? emptyHealth(s));
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
