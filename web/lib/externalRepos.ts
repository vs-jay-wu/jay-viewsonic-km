import { readFile, readdir, stat } from "fs/promises";
import path from "path";
import { repoPath } from "@/lib/repo";

/**
 * 外接碟上的 repo（＝ offloaded 的那些）。
 *
 * **為什麼不是走 `lib/changes.ts` 的 `workspace()`**：那支刻意只讀 `localPath`，
 * 因為 `/changes` 與 `/git` 會對每個 repo 跑好幾個 git 指令，把 327 個外接的
 * repo 加進去會把全掃拖垮（那條決定寫在它的註解裡，仍然成立）。
 *
 * 這裡是給 `/code` 用的另一條路：**只拿名字、不跑 git**（實測 327 個 74ms，
 * 第二次 1ms，因為只是 `scandir` ＋ 檢查 `.git` 在不在），檔案內容是點了才讀。
 * 所以「列出來」很便宜，貴的是「對每個都問 git」—— 那件事這裡不做。
 */

export interface ExternalRepo {
  name: string;
  dir: string;
  org: string;
}

/** 各 org 的外接根目錄。碟沒掛載時那個路徑會不存在 */
async function externalRoots(): Promise<{ org: string; root: string }[]> {
  const raw = await readFile(repoPath("local.workspace.json"), "utf8").catch(() => null);
  if (!raw) return [];
  try {
    const ws = JSON.parse(raw) as {
      orgs?: Record<string, { externalPath?: string }>;
    };
    return Object.entries(ws.orgs ?? {})
      .filter(([, o]) => o.externalPath)
      .map(([org, o]) => ({ org, root: o.externalPath! }));
  } catch {
    return [];
  }
}

const isRepo = (dir: string) => stat(path.join(dir, ".git")).then(() => true, () => false);

export async function listExternalRepos(): Promise<{
  repos: ExternalRepo[];
  /** 有設外接路徑但讀不到 ＝ 碟沒掛載。畫面要講出來，不然看起來像「外接上沒有東西」 */
  mounted: boolean;
}> {
  const roots = await externalRoots();
  if (!roots.length) return { repos: [], mounted: false };

  let mounted = false;
  const repos: ExternalRepo[] = [];
  for (const { org, root } of roots) {
    const entries = await readdir(root, { withFileTypes: true }).catch(() => null);
    if (!entries) continue; // 這個 org 的碟沒掛
    mounted = true;
    const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith("."));
    /*
     * 這 300 多個 stat **一定要並行**。同一批 stat 序列跑，在純 node 只要 6ms，
     * 但在 Next 的 dev runtime 量到 **1.3 秒**（它替每個非同步 I/O 都加了一層
     * 追蹤，固定成本被乘上幾百倍）。改並行之後整支 API 熱路徑是 24–43ms。
     */
    const ok = await Promise.all(dirs.map((e) => isRepo(path.join(root, e.name))));
    dirs.forEach((e, i) => {
      if (ok[i]) repos.push({ name: e.name, dir: path.join(root, e.name), org });
    });
  }
  repos.sort((a, b) => a.name.localeCompare(b.name));
  return { repos, mounted };
}

/**
 * 這個路徑是不是外接根目錄**正下方**的一個 repo。
 *
 * 只認直接子目錄：外接碟上不掃 worktree（那要跑 git），而且限制得越窄，
 * 「前端傳來的路徑」能碰到的範圍越小。
 */
export async function isExternalRepo(candidate: string): Promise<boolean> {
  const abs = path.resolve(candidate);
  const roots = await externalRoots();
  return (
    roots.some(({ root }) => path.dirname(abs) === path.resolve(root)) && (await isRepo(abs))
  );
}
