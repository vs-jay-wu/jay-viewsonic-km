import Database from "better-sqlite3";
import path from "path";

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    const dbPath = process.env.DB_PATH
      ? path.resolve(process.cwd(), process.env.DB_PATH)
      : path.resolve(process.cwd(), "../data/teams.db");
    _db = new Database(dbPath, { readonly: true });
  }
  return _db;
}

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

export function getMessages(
  chatId: number,
  limit = 50,
  before?: string // composed_at cursor
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

  // 附加 reactions
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
