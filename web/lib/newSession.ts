import { access } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { repoPath, repoRoot, run } from "@/lib/repo";

/**
 * 建一個**空的、已命名**的 Claude session，回傳它的 id。
 *
 * 做法（2026-09-11 實測）：`claude -p "/rename <標題>" --session-id <uuid>`。
 * slash command 當第一個 prompt 會直接執行，`num_turns` 是 0、`total_cost_usd`
 * 是 0 —— 不會叫模型，只是建檔並寫入 `custom-title` 記錄。之後用
 * `claude --resume <uuid>` 接上（也實測過）。
 *
 * 這是唯一能預設 session 名稱的做法：Orca 的 `terminal create --title` 會被
 * 執行中的程式蓋掉（見 orca skill），所以名稱只能由 Claude 自己的 /rename 決定。
 */

/** 工作區根目錄 —— 只允許在這底下開 session */
function workspaceRoot(): string {
  return path.resolve(repoRoot(), "..");
}

export interface CreateSessionInput {
  title: string;
  /** 預設在 km repo（Jay 的 `[km/xxx]` 慣例就是在 km 開，處理別的 repo） */
  cwd?: string;
}

export type CreateSessionResult =
  | { ok: true; sessionId: string; cwd: string }
  | { ok: false; error: string };

export async function createNamedSession(
  input: CreateSessionInput
): Promise<CreateSessionResult> {
  const title = (input.title ?? "").replace(/\s+/g, " ").trim();
  if (!title) return { ok: false, error: "標題不能是空的" };
  if (title.length > 200) return { ok: false, error: "標題太長" };

  const cwd = path.resolve(input.cwd || repoRoot());
  // 路徑會被拿去開終端，只能在工作區底下（避免前端傳來任意路徑）
  const root = workspaceRoot();
  if (cwd !== root && !cwd.startsWith(root + path.sep)) {
    return { ok: false, error: `不在工作區底下：${cwd}` };
  }
  if (!(await access(cwd).then(() => true, () => false))) {
    return { ok: false, error: `目錄不存在：${cwd}` };
  }

  const sessionId = randomUUID();
  const { stdout, stderr, code } = await run(
    "claude",
    ["-p", `/rename ${title}`, "--session-id", sessionId, "--output-format", "json"],
    { cwd, timeoutMs: 120_000 }
  );
  if (code !== 0) {
    return { ok: false, error: (stderr || stdout || `claude exit ${code}`).trim().slice(0, 500) };
  }
  return { ok: true, sessionId, cwd };
}

/** km repo 本身的路徑（前端的預設 cwd） */
export function defaultSessionCwd(): string {
  return repoPath();
}
