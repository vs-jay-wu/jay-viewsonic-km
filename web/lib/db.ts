import Database from "better-sqlite3";
import path from "path";

function dbPath(): string {
  return process.env.DB_PATH
    ? path.resolve(process.cwd(), process.env.DB_PATH)
    : path.resolve(process.cwd(), "../data/teams.db");
}

let _readDb: Database.Database | null = null;
let _writeDb: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_readDb) _readDb = new Database(dbPath(), { readonly: true });
  return _readDb;
}

function getWriteDb(): Database.Database {
  if (!_writeDb) _writeDb = new Database(dbPath());
  return _writeDb;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Chat {
  id: number;
  teams_id: string;
  topic: string | null;
  type: string | null;
  created_at: string | null;
  message_count: number;
}

export interface Message {
  id: number;
  teams_msg_id: string;
  user_id: number | null;
  display_name: string | null;
  content: string | null;
  content_type: string | null;
  composed_at: string | null;
  sequence_id: string | null;
  is_deleted: number;
  reactions: Reaction[];
}

export interface Reaction {
  emoji: string;
  display_name: string | null;
  reacted_at: string | null;
}

export interface User {
  id: number;
  teams_id: string;
  display_name: string | null;
}

export interface KeyMessage {
  teams_msg_id: string;
  label: string; // 一句話說明為何重要
}

export interface Summary {
  id: number;
  chat_id: number;
  title: string;
  period_start: string | null;
  period_end: string | null;
  summary_text: string | null;
  key_messages: KeyMessage[];
  generated_at: string;
}

// ─── Chats ───────────────────────────────────────────────────────────────────

export function listChats(): Chat[] {
  return getDb()
    .prepare(
      `SELECT c.*, COUNT(m.id) as message_count
       FROM chats c
       LEFT JOIN messages m ON m.chat_id = c.id
       GROUP BY c.id
       ORDER BY c.id`
    )
    .all() as Chat[];
}

export function getChat(chatId: number): Chat | null {
  return (
    (getDb()
      .prepare(
        `SELECT c.*, COUNT(m.id) as message_count
         FROM chats c
         LEFT JOIN messages m ON m.chat_id = c.id
         WHERE c.id = ?
         GROUP BY c.id`
      )
      .get(chatId) as Chat | undefined) ?? null
  );
}

// ─── Messages ────────────────────────────────────────────────────────────────

export function getMessages(
  chatId: number,
  limit = 50,
  before?: string
): Message[] {
  const db = getDb();
  const msgs = (
    before
      ? db
          .prepare(
            `SELECT m.*, u.display_name
             FROM messages m
             LEFT JOIN users u ON u.id = m.user_id
             WHERE m.chat_id = ? AND m.composed_at < ?
             ORDER BY m.composed_at DESC
             LIMIT ?`
          )
          .all(chatId, before, limit)
      : db
          .prepare(
            `SELECT m.*, u.display_name
             FROM messages m
             LEFT JOIN users u ON u.id = m.user_id
             WHERE m.chat_id = ?
             ORDER BY m.composed_at DESC
             LIMIT ?`
          )
          .all(chatId, limit)
  ) as (Message & { display_name: string | null })[];

  const stmt = db.prepare(
    `SELECT r.emoji, u.display_name, r.reacted_at
     FROM reactions r
     LEFT JOIN users u ON u.id = r.user_id
     WHERE r.message_id = ?`
  );

  return msgs.map((m) => ({
    ...m,
    reactions: stmt.all(m.id) as Reaction[],
  }));
}

export function getMessage(teamsMsgId: string): Message | null {
  const db = getDb();
  const msg = db
    .prepare(
      `SELECT m.*, u.display_name
       FROM messages m
       LEFT JOIN users u ON u.id = m.user_id
       WHERE m.teams_msg_id = ?`
    )
    .get(teamsMsgId) as (Message & { display_name: string | null }) | undefined;
  if (!msg) return null;
  const reactions = db
    .prepare(
      `SELECT r.emoji, u.display_name, r.reacted_at
       FROM reactions r LEFT JOIN users u ON u.id = r.user_id
       WHERE r.message_id = ?`
    )
    .all(msg.id) as Reaction[];
  return { ...msg, reactions };
}

export function listUsers(chatId: number): User[] {
  return getDb()
    .prepare(
      `SELECT DISTINCT u.id, u.teams_id, u.display_name
       FROM users u
       JOIN messages m ON m.user_id = u.id
       WHERE m.chat_id = ?
       ORDER BY u.display_name`
    )
    .all(chatId) as User[];
}

// ─── Summaries ───────────────────────────────────────────────────────────────

function parseSummary(row: Record<string, unknown>): Summary {
  return {
    ...(row as unknown as Summary),
    key_messages: row.key_messages
      ? JSON.parse(row.key_messages as string)
      : [],
  };
}

export function listSummaries(chatId: number): Summary[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM summaries WHERE chat_id = ? ORDER BY period_start DESC`
    )
    .all(chatId) as Record<string, unknown>[];
  return rows.map(parseSummary);
}

export function getSummary(summaryId: number): Summary | null {
  const row = getDb()
    .prepare(`SELECT * FROM summaries WHERE id = ?`)
    .get(summaryId) as Record<string, unknown> | undefined;
  return row ? parseSummary(row) : null;
}

export interface CreateSummaryInput {
  chat_id: number;
  title: string;
  period_start?: string;
  period_end?: string;
  summary_text: string;
  key_messages: KeyMessage[];
}

export function createSummary(input: CreateSummaryInput): Summary {
  const db = getWriteDb();
  const result = db
    .prepare(
      `INSERT INTO summaries (chat_id, title, period_start, period_end, summary_text, key_messages)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING *`
    )
    .get(
      input.chat_id,
      input.title,
      input.period_start ?? null,
      input.period_end ?? null,
      input.summary_text,
      JSON.stringify(input.key_messages)
    ) as Record<string, unknown>;
  return parseSummary(result);
}

export function deleteSummary(summaryId: number): void {
  getWriteDb()
    .prepare(`DELETE FROM summaries WHERE id = ?`)
    .run(summaryId);
}
