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
  hasMore: boolean;
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
 * 從尾巴往前讀 —— 想看的一定是最近的內容，而檔案可能 60MB，不能整份載。
 * `before` 給上一頁回傳的 `from`，就會再往前讀一段。
 */
export async function readTranscript(
  id: string,
  before?: number
): Promise<TranscriptPage | null> {
  const file = await resolveFile(id);
  if (!file) return null;

  const st = await stat(file);
  const end = Math.min(before ?? st.size, st.size);
  const start = Math.max(0, end - CHUNK_BYTES);

  const fh = await open(file, "r");
  let text: string;
  try {
    const len = end - start;
    const buf = Buffer.alloc(len);
    const { bytesRead } = await fh.read(buf, 0, len, start);
    text = buf.subarray(0, bytesRead).toString("utf8");
  } finally {
    await fh.close();
  }

  // 不是從檔頭開始讀的話，第一行多半被切一半，丟掉
  if (start > 0) {
    const nl = text.indexOf("\n");
    text = nl === -1 ? "" : text.slice(nl + 1);
  }

  const messages: TranscriptMessage[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let rec: Record<string, unknown>;
    try {
      rec = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue; // 尾巴那半行（還在寫入中）
    }
    const m = messageFromRecord(rec);
    if (m) messages.push(m);
  }

  return { id, sizeBytes: st.size, from: start, hasMore: start > 0, messages };
}
