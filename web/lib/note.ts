import { mkdir, readFile } from "fs/promises";
import path from "path";
import { SCRATCH_ID, emptyNote, type Note, type NoteFile } from "@/lib/noteRules";
import { statePath } from "@/lib/statePaths";
import { writeStateFile } from "@/lib/stateWrite";

export type { Note };

const FILE = statePath("note.json");

/**
 * 快速筆記的儲存與推播。
 *
 * 只有一則、隨打隨存、**以最後寫入為準**（Jay 2026-09-14：不做衝突處理）。
 * 多分頁同步走 SSE：每個分頁訂一條，誰存檔就推給其他分頁。
 *
 * 為什麼是 SSE 不是 WebSocket：需要的只有「server → 分頁」這個方向，
 * 往上寫本來就是一般的 POST；而 Next 的 route handler 沒辦法直接把連線升級成
 * WebSocket（要另外包一個自訂 server），SSE 用一個 streaming Response 就成立。
 */

// ─── 檔案 ────────────────────────────────────────────────────────────────────

export async function readNote(): Promise<Note> {
  const raw = await readFile(FILE, "utf8").catch(() => null);
  if (!raw) return emptyNote();
  try {
    const parsed = JSON.parse(raw) as Partial<NoteFile>;
    const note = parsed.notes?.find((n) => n?.id === SCRATCH_ID) ?? parsed.notes?.[0];
    if (!note || typeof note.text !== "string") return emptyNote();
    return { id: note.id || SCRATCH_ID, text: note.text, updatedAt: note.updatedAt || "" };
  } catch {
    return emptyNote();
  }
}

export async function writeNote(text: string): Promise<Note> {
  const note: Note = { id: SCRATCH_ID, text, updatedAt: new Date().toISOString() };
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeStateFile(FILE, JSON.stringify({ notes: [note] } satisfies NoteFile, null, 2) + "\n");
  return note;
}

// ─── 推播 ────────────────────────────────────────────────────────────────────

export interface Subscriber {
  /** 送出這次存檔的分頁；它自己不需要收回自己的內容 */
  clientId: string;
  send: (note: Note, from: string) => void;
}

/** 訂閱者存在 globalThis —— 否則 dev 的 HMR 會留下一堆收不到人的舊清單 */
const KEY = Symbol.for("km.noteSubscribers");
const g = globalThis as unknown as Record<symbol, Set<Subscriber> | undefined>;

function subscribers(): Set<Subscriber> {
  if (!g[KEY]) g[KEY] = new Set<Subscriber>();
  return g[KEY]!;
}

export function subscribe(sub: Subscriber): () => void {
  subscribers().add(sub);
  return () => subscribers().delete(sub);
}

/** 推給**除了送出者以外**的所有分頁 */
function broadcast(note: Note, from = ""): void {
  for (const sub of subscribers()) {
    if (sub.clientId && sub.clientId === from) continue;
    try {
      sub.send(note, from);
    } catch {
      subscribers().delete(sub);
    }
  }
}

/** 存檔並推給其他分頁。這是唯一的寫入入口 —— 推播只在這裡發生一次。 */
export async function saveAndBroadcast(text: string, from: string): Promise<Note> {
  const note = await writeNote(text);
  broadcast(note, from);
  return note;
}

export function subscriberCount(): number {
  return subscribers().size;
}
