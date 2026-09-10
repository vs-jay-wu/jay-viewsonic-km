import { open, readdir, readFile, rm, stat, mkdir, writeFile } from "fs/promises";
import path from "path";
import os from "os";
import { repoPath } from "@/lib/repo";

const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");
const PINS_FILE = repoPath("data/local-state/session-pins.json");
const HEAD_BYTES = 64 * 1024;

/** session id 是 uuid；只認這個形狀，避免拿到奇怪的路徑。 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SessionInfo {
  id: string;
  /** ~/.claude/projects 底下的目錄名（路徑編碼過的 cwd） */
  projectDir: string;
  /** 從 session 內容讀到的實際 cwd（讀不到就用目錄名還原） */
  cwd: string;
  title: string;
  /** 標題是哪來的：自訂標題／agent 名／第一句 prompt */
  titleSource: "custom" | "agent" | "prompt" | "none";
  gitBranch: string | null;
  version: string | null;
  sizeBytes: number;
  /** sidecar 目錄（tool-results、子 agent 的 transcript）佔的大小 */
  sidecarBytes: number;
  modifiedAt: string;
  createdAt: string | null;
  /** 有沒有 sibling 目錄（tool-results 之類），刪除時要一起清 */
  hasSidecar: boolean;
  pinned: boolean;
  pinnedAt: string | null;
}

interface PinsFile {
  pinned: Record<string, { pinnedAt: string }>;
}

async function readPins(): Promise<PinsFile> {
  const raw = await readFile(PINS_FILE, "utf8").catch(() => null);
  if (!raw) return { pinned: {} };
  try {
    const parsed = JSON.parse(raw) as PinsFile;
    return { pinned: parsed.pinned ?? {} };
  } catch {
    return { pinned: {} };
  }
}

async function writePins(pins: PinsFile): Promise<void> {
  await mkdir(path.dirname(PINS_FILE), { recursive: true });
  await writeFile(PINS_FILE, JSON.stringify(pins, null, 2) + "\n", "utf8");
}

export async function setPinned(id: string, pinned: boolean): Promise<boolean> {
  if (!UUID_RE.test(id)) return false;
  const pins = await readPins();
  if (pinned) pins.pinned[id] = { pinnedAt: new Date().toISOString() };
  else delete pins.pinned[id];
  await writePins(pins);
  return true;
}

/** 讀檔案開頭一段就好 —— 有的 session 檔 60MB，不能整份讀。 */
async function readHead(file: string, bytes = HEAD_BYTES): Promise<string> {
  const fh = await open(file, "r");
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await fh.read(buf, 0, bytes, 0);
    return buf.subarray(0, bytesRead).toString("utf8");
  } finally {
    await fh.close();
  }
}

function firstPromptText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const part of value) {
      if (part && typeof part === "object" && (part as { type?: string }).type === "text") {
        const t = (part as { text?: string }).text;
        if (t) return t;
      }
    }
  }
  return null;
}

/** 把 slash command 的包裝標籤與 system-reminder 剝掉，只留人看得懂的部分。 */
function cleanTitle(s: string): string {
  return s
    .replace(/<command-[^>]*>|<\/command-[^>]*>/g, " ")
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface HeadMeta {
  title: string;
  titleSource: SessionInfo["titleSource"];
  cwd: string | null;
  gitBranch: string | null;
  version: string | null;
  createdAt: string | null;
}

function parseHead(head: string): HeadMeta {
  const meta: HeadMeta = {
    title: "", titleSource: "none", cwd: null,
    gitBranch: null, version: null, createdAt: null,
  };
  let customTitle: string | null = null;
  let agentName: string | null = null;
  let prompt: string | null = null;

  const lines = head.split("\n");
  // 最後一行可能被 HEAD_BYTES 切斷，丟掉
  for (const line of lines.slice(0, -1)) {
    if (!line.trim()) continue;
    let rec: Record<string, unknown>;
    try {
      rec = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (typeof rec.customTitle === "string" && !customTitle) customTitle = rec.customTitle;
    if (typeof rec.agentName === "string" && !agentName) agentName = rec.agentName;
    if (typeof rec.cwd === "string" && !meta.cwd) meta.cwd = rec.cwd;
    if (typeof rec.gitBranch === "string" && !meta.gitBranch) meta.gitBranch = rec.gitBranch;
    if (typeof rec.version === "string" && !meta.version) meta.version = rec.version;
    if (typeof rec.timestamp === "string" && !meta.createdAt) meta.createdAt = rec.timestamp;

    if (!prompt && rec.type === "user" && rec.isSidechain !== true) {
      const msg = rec.message as { role?: string; content?: unknown } | undefined;
      const text = firstPromptText(msg?.content);
      if (text) {
        const cleaned = cleanTitle(text);
        if (cleaned) prompt = cleaned.slice(0, 120);
      }
    }
  }

  if (customTitle) { meta.title = customTitle; meta.titleSource = "custom"; }
  else if (agentName) { meta.title = agentName; meta.titleSource = "agent"; }
  else if (prompt) { meta.title = prompt; meta.titleSource = "prompt"; }
  else { meta.title = "(未命名)"; meta.titleSource = "none"; }
  return meta;
}

/** 目錄名是把 cwd 的 / 換成 - 編碼的，還原不回原樣，只能當顯示用的後備。 */
function decodeProjectDir(dir: string): string {
  return dir.replace(/^-/, "/").replace(/-/g, "/");
}

export async function listSessions(): Promise<SessionInfo[]> {
  const pins = await readPins();
  const projectDirs = await readdir(PROJECTS_DIR, { withFileTypes: true }).catch(() => []);

  const perProject = await Promise.all(
    projectDirs
      .filter((d) => d.isDirectory())
      .map(async (d) => {
        const dirPath = path.join(PROJECTS_DIR, d.name);
        const entries = await readdir(dirPath).catch(() => [] as string[]);
        const ids = entries
          .filter((f) => f.endsWith(".jsonl"))
          .map((f) => f.slice(0, -".jsonl".length))
          .filter((id) => UUID_RE.test(id));

        return Promise.all(
          ids.map(async (id): Promise<SessionInfo | null> => {
            const file = path.join(dirPath, `${id}.jsonl`);
            const st = await stat(file).catch(() => null);
            if (!st) return null;
            const head = await readHead(file).catch(() => "");
            const meta = parseHead(head);
            const sidecarPath = path.join(dirPath, id);
            const hasSidecar = await stat(sidecarPath).then(
              (s) => s.isDirectory(),
              () => false
            );
            const sidecarBytes = hasSidecar ? await dirSize(sidecarPath) : 0;
            return {
              id,
              projectDir: d.name,
              cwd: meta.cwd ?? decodeProjectDir(d.name),
              title: meta.title,
              titleSource: meta.titleSource,
              gitBranch: meta.gitBranch,
              version: meta.version,
              sizeBytes: st.size,
              sidecarBytes,
              modifiedAt: st.mtime.toISOString(),
              createdAt: meta.createdAt,
              hasSidecar,
              pinned: !!pins.pinned[id],
              pinnedAt: pins.pinned[id]?.pinnedAt ?? null,
            };
          })
        );
      })
  );

  return perProject
    .flat()
    .filter((s): s is SessionInfo => s !== null)
    .sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1));
}

export interface DeleteResult {
  id: string;
  ok: boolean;
  freedBytes: number;
  error?: string;
}

/**
 * 刪掉 session 的 .jsonl 與它的 sidecar 目錄。
 * pin 住的一律拒絕 —— pin 在這裡的意思就是「別刪」。
 */
export async function deleteSessions(ids: string[]): Promise<DeleteResult[]> {
  const pins = await readPins();
  const all = await listSessions();
  const byId = new Map(all.map((s) => [s.id, s]));

  return Promise.all(
    ids.map(async (id): Promise<DeleteResult> => {
      if (!UUID_RE.test(id)) return { id, ok: false, freedBytes: 0, error: "id 格式不對" };
      if (pins.pinned[id]) return { id, ok: false, freedBytes: 0, error: "已 pin 住，先取消 pin" };
      const info = byId.get(id);
      if (!info) return { id, ok: false, freedBytes: 0, error: "找不到這個 session" };

      const dirPath = path.join(PROJECTS_DIR, info.projectDir);
      const file = path.join(dirPath, `${id}.jsonl`);
      // 再確認一次算出來的路徑真的在 ~/.claude/projects 底下
      if (!file.startsWith(PROJECTS_DIR + path.sep)) {
        return { id, ok: false, freedBytes: 0, error: "路徑不在 ~/.claude/projects 底下" };
      }

      const freed = info.sizeBytes + info.sidecarBytes;
      try {
        if (info.hasSidecar) {
          await rm(path.join(dirPath, id), { recursive: true, force: true });
        }
        await rm(file, { force: true });
        return { id, ok: true, freedBytes: freed };
      } catch (e) {
        return { id, ok: false, freedBytes: 0, error: (e as Error).message };
      }
    })
  );
}

async function dirSize(dir: string): Promise<number> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const sizes = await Promise.all(
    entries.map(async (e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return dirSize(p);
      const st = await stat(p).catch(() => null);
      return st?.size ?? 0;
    })
  );
  return sizes.reduce((a, b) => a + b, 0);
}
