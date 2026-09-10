import path from "path";
import { execFile } from "child_process";

/** km repo 根目錄。dev server 的 cwd 是 web/，所以往上一層。 */
export function repoRoot(): string {
  return process.env.KM_REPO_ROOT
    ? path.resolve(process.env.KM_REPO_ROOT)
    : path.resolve(process.cwd(), "..");
}

export function repoPath(...segments: string[]): string {
  return path.join(repoRoot(), ...segments);
}

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * 跑 repo 裡的腳本。用 execFile（不經 shell）以免參數被當成 shell 語法。
 * 不丟例外 —— 非零離開碼由呼叫端決定怎麼處理。
 */
export function run(
  file: string,
  args: string[],
  opts: { timeoutMs?: number; cwd?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      {
        cwd: opts.cwd ?? repoRoot(),
        timeout: opts.timeoutMs ?? 60_000,
        maxBuffer: 32 * 1024 * 1024,
        env: opts.env ?? process.env,
      },
      (err, stdout, stderr) => {
        const code =
          err && typeof (err as NodeJS.ErrnoException & { code?: number }).code === "number"
            ? ((err as unknown as { code: number }).code)
            : err
              ? 1
              : 0;
        resolve({ stdout: stdout.toString(), stderr: stderr.toString(), code });
      }
    );
  });
}
