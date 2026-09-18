import { access, constants } from "fs/promises";
import path from "path";

/**
 * km 依賴的外部 CLI 在不在。
 *
 * **不用 `which`／`command -v` 起 shell**：web server 的 PATH 跟終端機不一樣
 * （launchd 起的 process 拿到的是很短的 PATH），用 shell 去問只會問到自己的環境，
 * 答案跟「Jay 在終端機打得到嗎」無關。改成直接檢查幾個實際會裝的位置。
 */

export interface CliTool {
  name: string;
  /** 沒裝的話，這是做什麼用的 —— 警示要講清楚「少了它會怎樣」 */
  usedFor: string;
  installHint: string;
  found: string | null;
}

/** 常見安裝位置 ＋ PATH。`~/.local/bin` 是 codex 的預設落點 */
function candidateDirs(): string[] {
  const home = process.env.HOME ?? "";
  return [
    ...(process.env.PATH ?? "").split(":").filter(Boolean),
    `${home}/.local/bin`,
    `${home}/.claude/local`,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
  ];
}

async function locate(bin: string): Promise<string | null> {
  for (const dir of candidateDirs()) {
    const p = path.join(dir, bin);
    try {
      await access(p, constants.X_OK);
      return p;
    } catch {
      /* 下一個 */
    }
  }
  return null;
}

/** 檢查 review 用的兩個 CLI —— 哪個沒裝就警示哪個（Jay 2026-09-18） */
export async function reviewClis(): Promise<CliTool[]> {
  const defs: Omit<CliTool, "found">[] = [
    {
      name: "codex",
      usedFor: "`/review-local` 的預設引擎（設定頁可切換）",
      installHint: "裝好之後它會在 ~/.local/bin/codex",
    },
    {
      name: "claude",
      usedFor: "`/review-local` 的另一個引擎，以及 PR 巡邏（排程會直接叫它）",
      installHint: "Claude Code 的 CLI",
    },
  ];
  return Promise.all(defs.map(async (d) => ({ ...d, found: await locate(d.name) })));
}
