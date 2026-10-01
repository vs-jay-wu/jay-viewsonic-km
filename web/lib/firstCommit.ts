import { mkdir, readFile } from "fs/promises";
import path from "path";
import { run } from "@/lib/repo";
import { mapLimit } from "@/lib/changes";
import { statePath } from "@/lib/statePaths";
import { writeStateFile } from "@/lib/stateWrite";
import { readStateFile } from "@/lib/stateRead";

/**
 * 每個 repo 的第一顆 commit（＝專案何時開始）。
 *
 * **算一次就存起來**：第一顆 commit 只有改寫歷史（`rebase --root`、`filter-branch`）
 * 才會變，那是罕見到可以忽略的事。實測每個 repo 要 22–35ms，475 個全算大約
 * 7–11 秒 —— 每次開清單都算不可行，但一輩子算一次很划算（Jay 2026-09-23）。
 *
 * 存 `data/hub/`（repo 的事實，每台機器看到的都一樣）。key 是路徑：worktree 與
 * 主 repo 的第一顆 commit 相同，但路徑不同，各存一份沒有壞處。
 */

const FILE = statePath("repo-first-commit.json");
const CONCURRENCY = 8;

interface Entry {
  /** root commit 的 sha —— 存著是為了將來想驗「是不是同一段歷史」時有東西可比 */
  sha: string;
  /** ISO 日期。算不出來（空 repo、壞掉的 repo）就是 null，也要存，否則每次都重算 */
  at: string | null;
}

type Cache = Record<string, Entry>;

async function read(): Promise<Cache> {
  const raw = await readStateFile(FILE);
  if (!raw) return {};
  try {
    const d = JSON.parse(raw) as Cache;
    return d && typeof d === "object" ? d : {};
  } catch {
    return {};
  }
}

async function write(cache: Cache): Promise<void> {
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeStateFile(FILE, JSON.stringify(cache, null, 2) + "\n");
}

/**
 * `--max-parents=0` ＝ 沒有父節點的 commit。
 *
 * ⚠️ **可能有很多顆**（合併過兩段獨立歷史的 repo 就會）。要的是最早的那一顆，
 * 所以排序後取第一個，不是 `--max-count=1` 拿到的隨便一顆。
 */
async function firstCommitOf(dir: string): Promise<Entry> {
  const r = await run("git", ["-C", dir, "log", "--max-parents=0", "--format=%H %aI"], {
    timeoutMs: 60_000,
  });
  const rows = r.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [sha, ...rest] = l.split(" ");
      return { sha, at: rest.join(" ") };
    })
    .filter((x) => x.at);
  if (!rows.length) return { sha: "", at: null };
  rows.sort((a, b) => a.at.localeCompare(b.at));
  return { sha: rows[0].sha, at: rows[0].at };
}

/**
 * 這些 repo 的第一顆 commit。**只算快取裡沒有的**。
 *
 * 回傳 `dir → ISO 日期`；算不出來的是 null（畫面上排到最後）。
 */
export async function firstCommitMap(dirs: string[]): Promise<Record<string, string | null>> {
  const cache = await read();
  const missing = dirs.filter((d) => !(d in cache));

  if (missing.length) {
    const got = await mapLimit(missing, CONCURRENCY, async (d) => [d, await firstCommitOf(d)] as const);
    for (const [d, e] of got) cache[d] = e;
    await write(cache);
  }

  const out: Record<string, string | null> = {};
  for (const d of dirs) out[d] = cache[d]?.at ?? null;
  return out;
}

/** 忘掉存過的結果（歷史被改寫過時用）。沒有 UI，需要時手動刪那個檔也行 */
export async function forgetFirstCommits(): Promise<void> {
  await write({});
}
