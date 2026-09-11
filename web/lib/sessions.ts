import { open, readdir, readFile, rm, stat, mkdir, writeFile } from "fs/promises";
import path from "path";
import os from "os";
import { repoPath } from "@/lib/repo";

// 純規則放隔壁（客戶端也要用，不能帶到 fs/promises）
export { isStale, STALE_DAYS } from "@/lib/sessionRules";

const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");
const PINS_FILE = repoPath("data/local-state/session-pins.json");
const META_CACHE_FILE = repoPath("data/local-state/session-meta-cache.json");
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

  if (prompt) { meta.title = prompt; meta.titleSource = "prompt"; }
  else { meta.title = "(未命名)"; meta.titleSource = "none"; }
  return meta;
}

/**
 * 掃 custom-title / agent-name 記錄。
 *
 * **不能只讀開頭。** `/rename` 是對話進行到一半才寫入的，實際看過的例子落在
 * 48MB 檔案的第 2.9MB —— 只讀 64KB 的話標題會退回「第一句 prompt」，
 * 用真標題搜尋就找不到那個 session（Jay 2026-09-10 回報）。
 *
 * 整份掃，但用 4MB 分塊讀 + 先做字串比對再 JSON.parse；並且只掃
 * `fromOffset` 之後的部分（檔案只會往後長，掃過的結果由呼叫端快取）。
 * 同一種記錄取**最後一筆** —— 最新的改名才是現在的標題。
 */
export async function scanTitleRecords(
  file: string,
  fromOffset = 0,
  fileSize?: number
): Promise<{ customTitle: string | null; agentName: string | null; scannedBytes: number }> {
  const CHUNK = 4 * 1024 * 1024;
  const fh = await open(file, "r");
  let customTitle: string | null = null;
  let agentName: string | null = null;
  let pos = Math.max(0, fromOffset);
  try {
    const size = fileSize ?? (await fh.stat()).size;
    let carry = "";
    const buf = Buffer.alloc(CHUNK);
    while (pos < size) {
      const { bytesRead } = await fh.read(buf, 0, CHUNK, pos);
      if (bytesRead <= 0) break;
      pos += bytesRead;
      const text = carry + buf.subarray(0, bytesRead).toString("utf8");
      const lastNl = text.lastIndexOf("\n");
      // 尾巴那半行留給下一塊，不然 JSON 被切斷
      carry = lastNl === -1 ? text : text.slice(lastNl + 1);
      const complete = lastNl === -1 ? "" : text.slice(0, lastNl);
      if (!complete) continue;
      for (const line of complete.split("\n")) {
        if (!line.includes('"custom-title"') && !line.includes('"agent-name"')) continue;
        try {
          const rec = JSON.parse(line) as {
            type?: string; customTitle?: string; agentName?: string;
          };
          if (rec.type === "custom-title" && typeof rec.customTitle === "string") {
            customTitle = rec.customTitle;
          } else if (rec.type === "agent-name" && typeof rec.agentName === "string") {
            agentName = rec.agentName;
          }
        } catch {
          // 壞行／半行，跳過
        }
      }
    }
    return { customTitle, agentName, scannedBytes: pos };
  } finally {
    await fh.close();
  }
}

/** 目錄名是把 cwd 的 / 換成 - 編碼的，還原不回原樣，只能當顯示用的後備。 */
function decodeProjectDir(dir: string): string {
  return dir.replace(/^-/, "/").replace(/-/g, "/");
}

/**
 * 每個 session 檔的解析結果快取。
 *
 * 標題要掃全檔（見 scanTitleRecords），430MB 每次列清單都重掃太慢。
 * 用 size + mtime 當有效性判斷；檔案只是變長（正在進行的 session）就只掃
 * 新增的那一段，標題沿用上次掃到的。
 */
export interface MetaCacheEntry {
  size: number;
  mtimeMs: number;
  scannedBytes: number;
  customTitle: string | null;
  agentName: string | null;
  promptTitle: string;
  cwd: string | null;
  gitBranch: string | null;
  version: string | null;
  createdAt: string | null;
}
type MetaCache = Record<string, MetaCacheEntry>;

async function readMetaCache(): Promise<MetaCache> {
  const raw = await readFile(META_CACHE_FILE, "utf8").catch(() => null);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as MetaCache;
  } catch {
    return {};
  }
}

async function writeMetaCache(cache: MetaCache): Promise<void> {
  await mkdir(path.dirname(META_CACHE_FILE), { recursive: true });
  await writeFile(META_CACHE_FILE, JSON.stringify(cache), "utf8");
}

/** custom-title 優先，其次 agent 名，最後才退回第一句 prompt。 */
export function pickTitle(e: MetaCacheEntry): {
  title: string;
  titleSource: SessionInfo["titleSource"];
} {
  if (e.customTitle) return { title: e.customTitle, titleSource: "custom" };
  if (e.agentName) return { title: e.agentName, titleSource: "agent" };
  if (e.promptTitle && e.promptTitle !== "(未命名)") {
    return { title: e.promptTitle, titleSource: "prompt" };
  }
  return { title: "(未命名)", titleSource: "none" };
}

async function buildMeta(
  file: string,
  size: number,
  mtimeMs: number,
  cached: MetaCacheEntry | undefined
): Promise<MetaCacheEntry> {
  // 快取仍然有效
  if (cached && cached.size === size && cached.mtimeMs === mtimeMs) return cached;

  // 檔案只是變長（session 還在進行）→ 只掃新增的那段
  if (cached && size > cached.scannedBytes) {
    const scan = await scanTitleRecords(file, cached.scannedBytes, size);
    return {
      ...cached,
      size,
      mtimeMs,
      scannedBytes: scan.scannedBytes,
      customTitle: scan.customTitle ?? cached.customTitle,
      agentName: scan.agentName ?? cached.agentName,
    };
  }

  // 全新或被截短過 → 完整解析
  const head = await readHead(file).catch(() => "");
  const headMeta = parseHead(head);
  const scan = await scanTitleRecords(file, 0, size);
  return {
    size,
    mtimeMs,
    scannedBytes: scan.scannedBytes,
    customTitle: scan.customTitle,
    agentName: scan.agentName,
    promptTitle: headMeta.title,
    cwd: headMeta.cwd,
    gitBranch: headMeta.gitBranch,
    version: headMeta.version,
    createdAt: headMeta.createdAt,
  };
}

export async function listSessions(): Promise<SessionInfo[]> {
  const pins = await readPins();
  const cache = await readMetaCache();
  const nextCache: MetaCache = {};
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
            const meta = await buildMeta(file, st.size, st.mtimeMs, cache[id]);
            nextCache[id] = meta;
            const { title, titleSource } = pickTitle(meta);
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
              title,
              titleSource,
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

  const sessions = perProject
    .flat()
    .filter((s): s is SessionInfo => s !== null)
    .sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1));

  // 只留這次真的看到的 session，順便把刪掉的清出快取
  await writeMetaCache(nextCache).catch(() => undefined);
  return sessions;
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
