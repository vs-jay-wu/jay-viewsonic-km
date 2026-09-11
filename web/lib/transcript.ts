import { open, readdir, stat } from "fs/promises";
import path from "path";
import os from "os";

const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 一次讀這麼多 byte。session 檔可以到 60MB，只能分段從尾巴往前讀。 */
const CHUNK_BYTES = 512 * 1024;
/** 單一區塊的文字上限 —— tool result 動輒好幾萬字，全塞給瀏覽器沒意義 */
const BLOCK_CHARS = 4000;

export type BlockKind = "text" | "thinking" | "tool_use" | "tool_result" | "image";

export interface TranscriptBlock {
  kind: BlockKind;
  text: string;
  /** tool_use 時是工具名 */
  name?: string;
  truncated?: boolean;
}

export interface TranscriptMessage {
  role: "user" | "assistant" | "system";
  at: string | null;
  blocks: TranscriptBlock[];
  /** 側鏈＝subagent 的對話 */
  isSidechain: boolean;
  /** 系統插入的（system-reminder、hook 輸出之類），預設收起來 */
  isMeta: boolean;
}

export interface TranscriptPage {
  id: string;
  sizeBytes: number;
  /** 這一頁是從哪個 byte 開始讀的；當作「再往前」的游標 */
  from: number;
  /** 這一頁最後一行完整結束在哪個 byte；當作「再往後」的游標 */
  to: number;
  /** 前面還有更早的內容 */
  hasMore: boolean;
  /** 後面還有更新的內容 */
  hasNewer: boolean;
  messages: TranscriptMessage[];
}

function clip(s: string): { text: string; truncated: boolean } {
  if (s.length <= BLOCK_CHARS) return { text: s, truncated: false };
  return { text: s.slice(0, BLOCK_CHARS), truncated: true };
}

function summariseToolInput(input: unknown): string {
  if (input == null) return "";
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

function blocksFromContent(content: unknown): TranscriptBlock[] {
  if (typeof content === "string") {
    const { text, truncated } = clip(content);
    return text.trim() ? [{ kind: "text", text, truncated }] : [];
  }
  if (!Array.isArray(content)) return [];

  const out: TranscriptBlock[] = [];
  for (const raw of content) {
    if (!raw || typeof raw !== "object") continue;
    const b = raw as Record<string, unknown>;
    switch (b.type) {
      case "text": {
        const { text, truncated } = clip(String(b.text ?? ""));
        if (text.trim()) out.push({ kind: "text", text, truncated });
        break;
      }
      case "thinking": {
        const { text, truncated } = clip(String(b.thinking ?? ""));
        // 空的 thinking（只有 signature）不值得佔一格
        if (text.trim()) out.push({ kind: "thinking", text, truncated });
        break;
      }
      case "tool_use": {
        const { text, truncated } = clip(summariseToolInput(b.input));
        out.push({ kind: "tool_use", name: String(b.name ?? "tool"), text, truncated });
        break;
      }
      case "tool_result": {
        const c = b.content;
        let text = "";
        if (typeof c === "string") text = c;
        else if (Array.isArray(c)) {
          text = c
            .map((p) =>
              p && typeof p === "object" && (p as { type?: string }).type === "text"
                ? String((p as { text?: string }).text ?? "")
                : `[${(p as { type?: string } | null)?.type ?? "?"}]`
            )
            .join("\n");
        }
        const clipped = clip(text);
        out.push({ kind: "tool_result", text: clipped.text, truncated: clipped.truncated });
        break;
      }
      case "image":
        out.push({ kind: "image", text: "（圖片）" });
        break;
      default:
        break;
    }
  }
  return out;
}

function messageFromRecord(rec: Record<string, unknown>): TranscriptMessage | null {
  const type = rec.type;
  if (type !== "user" && type !== "assistant" && type !== "system") return null;

  const at = typeof rec.timestamp === "string" ? rec.timestamp : null;
  const isSidechain = rec.isSidechain === true;

  if (type === "system") {
    const content = typeof rec.content === "string" ? rec.content : "";
    const { text, truncated } = clip(content);
    if (!text.trim()) return null;
    return {
      role: "system", at, isSidechain, isMeta: true,
      blocks: [{ kind: "text", text, truncated }],
    };
  }

  const msg = rec.message as { content?: unknown } | undefined;
  const blocks = blocksFromContent(msg?.content);
  if (blocks.length === 0) return null;

  // system-reminder 只是塞給模型看的，不是人打的話
  const onlyReminder =
    type === "user" &&
    blocks.every((b) => b.kind === "text" && b.text.trimStart().startsWith("<system-reminder>"));

  return {
    role: type,
    at,
    blocks,
    isSidechain,
    isMeta: rec.isMeta === true || onlyReminder,
  };
}

async function resolveFile(id: string): Promise<string | null> {
  if (!UUID_RE.test(id)) return null;
  const dirs = await readdir(PROJECTS_DIR, { withFileTypes: true }).catch(() => []);
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const file = path.join(PROJECTS_DIR, d.name, `${id}.jsonl`);
    const ok = await stat(file).then(() => true, () => false);
    if (ok) return file;
  }
  return null;
}

/**
 * 讀一頁對話紀錄。
 *
 * 預設從尾巴往前讀 —— 想看的通常是最近的內容，而檔案可能 60MB，不能整份載。
 * `before` 給上一頁回傳的 `from` 會再往前讀一段；`after` 給上一頁的 `to` 則往後讀
 * （「跳至首筆」是 `after: 0`，之後要能一路往後看回來）。
 */
export async function readTranscript(
  id: string,
  opts: { before?: number; after?: number } = {}
): Promise<TranscriptPage | null> {
  const file = await resolveFile(id);
  if (!file) return null;

  const st = await stat(file);
  let start: number;
  let end: number;
  if (opts.after !== undefined) {
    start = Math.max(0, Math.min(opts.after, st.size));
    end = Math.min(start + CHUNK_BYTES, st.size);
  } else {
    end = Math.min(opts.before ?? st.size, st.size);
    start = Math.max(0, end - CHUNK_BYTES);
  }

  const fh = await open(file, "r");
  let buf: Buffer;
  try {
    const len = Math.max(0, end - start);
    const b = Buffer.alloc(len);
    const { bytesRead } = await fh.read(b, 0, len, start);
    buf = b.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }

  // 兩端被切一半的行都丟掉。位移要在 **byte** 上算，不能先轉字串 ——
  // 中文是 3 bytes，用字元索引回推 byte 游標會對不準。
  let lo = 0;
  if (start > 0) {
    const nl = buf.indexOf(0x0a);
    lo = nl === -1 ? buf.length : nl + 1;
  }
  let hi = buf.length;
  if (end < st.size) {
    const nl = buf.lastIndexOf(0x0a);
    hi = nl === -1 ? lo : nl + 1;
  }
  // 單行大於一個 chunk 時上面會算出空範圍；往後讀要照樣前進，否則會原地打轉
  const to = hi > lo ? start + hi : end;
  const text = buf.subarray(lo, Math.max(lo, hi)).toString("utf8");

  const messages: TranscriptMessage[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let rec: Record<string, unknown>;
    try {
      rec = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue; // 還在寫入中的半行
    }
    const m = messageFromRecord(rec);
    if (m) messages.push(m);
  }

  return {
    id,
    sizeBytes: st.size,
    from: start,
    to,
    hasMore: start > 0,
    hasNewer: to < st.size,
    messages,
  };
}
