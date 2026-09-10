import { execFile } from "child_process";

/**
 * 送一則 macOS 通知。
 *
 * 用 osascript 而不是 terminal-notifier：不必額外裝東西。缺點是通知會掛在
 * 「Script Editor」名下，這是 osascript 的限制，不是設定錯了。
 */
export function notifyMac(opts: {
  title: string;
  subtitle?: string;
  message: string;
  sound?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  // AppleScript 字串只需要轉義反斜線與雙引號
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const parts = [`display notification "${esc(opts.message)}"`, `with title "${esc(opts.title)}"`];
  if (opts.subtitle) parts.push(`subtitle "${esc(opts.subtitle)}"`);
  if (opts.sound) parts.push(`sound name "Ping"`);

  return new Promise((resolve) => {
    execFile("osascript", ["-e", parts.join(" ")], { timeout: 10_000 }, (err, _out, stderr) => {
      if (err) resolve({ ok: false, error: stderr?.toString() || err.message });
      else resolve({ ok: true });
    });
  });
}
