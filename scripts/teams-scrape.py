#!/usr/bin/env python3
"""
teams-scrape.py
爬取 Teams 指定聊天室的訊息並存入 SQLite（正規化結構）

使用方式:
    python3 scripts/teams-scrape.py                         # 爬 local.workspace.json 設定的 chat
    python3 scripts/teams-scrape.py --chat-id "19:xxx..."  # 指定 chat id
    python3 scripts/teams-scrape.py --list                 # 查看已儲存的資料統計
"""

import argparse
import json
import os
import re
import sqlite3
import sys
from pathlib import Path
from typing import Optional

try:
    import requests
except ImportError:
    print("❌ 需要安裝 requests：pip3 install requests")
    sys.exit(1)

PROJECT_ROOT = Path(__file__).parent.parent
WORKSPACE    = PROJECT_ROOT / "local.workspace.json"
DB_PATH      = PROJECT_ROOT / "data" / "teams.db"


def _load_dotenv():
    env_file = PROJECT_ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

_load_dotenv()

HEADERS_BASE = {
    "x-ms-request-priority": "20",
    "behavioroverride":       "redirectAs404",
    "x-ms-test-user":         "False",
    "x-ms-migration":         "True",
    "clientinfo":             "os=mac; osVer=10.15.7; proc=x86; lcid=en-us; deviceType=1; country=us; clientName=skypeteams; clientVer=1415/26040401718; utcOffset=+08:00; timezone=Asia/Taipei",
    "User-Agent":             "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
    "Origin":                 "https://teams.cloud.microsoft",
    "Referer":                "https://teams.cloud.microsoft/",
}


# ─── Config ─────────────────────────────────────────────────────────────────

def load_config() -> dict:
    with open(WORKSPACE) as f:
        cfg = json.load(f)
    teams = cfg.get("teams", {})
    token = os.environ.get("TEAMS_TOKEN", "") or teams.get("token", "")
    if not token:
        print("❌ 請設定環境變數 TEAMS_TOKEN 或 .env 檔案")
        sys.exit(1)
    teams["token"] = token
    return teams


# ─── SQLite schema ───────────────────────────────────────────────────────────

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    teams_id     TEXT UNIQUE NOT NULL,   -- "8:orgid:xxxxxxxx" 或 "8:live:xxx"
    display_name TEXT
);

CREATE TABLE IF NOT EXISTS chats (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    teams_id            TEXT UNIQUE NOT NULL,     -- "19:xxx@thread.v2"
    topic               TEXT,
    type                TEXT,
    created_at          TEXT,
    last_synced_msg_id  TEXT,                     -- 上次爬到的最新訊息 id（毫秒時間戳）
    last_synced_at      TEXT                      -- 上次執行時間（ISO）
);

CREATE TABLE IF NOT EXISTS messages (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id        INTEGER NOT NULL REFERENCES chats(id),
    teams_msg_id   TEXT UNIQUE NOT NULL, -- Teams 的 timestamp-based id
    user_id        INTEGER REFERENCES users(id),
    content        TEXT,
    content_type   TEXT,                 -- RichText/Html, Text, ThreadActivity/...
    composed_at    TEXT,
    sequence_id    TEXT,
    is_deleted     INTEGER DEFAULT 0,
    raw_json       TEXT                  -- 完整原始 JSON，備查
);

CREATE TABLE IF NOT EXISTS reactions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id  INTEGER NOT NULL REFERENCES messages(id),
    user_id     INTEGER REFERENCES users(id),
    emoji       TEXT,
    reacted_at  TEXT,
    UNIQUE(message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_messages_chat     ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_user     ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_composed ON messages(composed_at);
CREATE INDEX IF NOT EXISTS idx_reactions_message ON reactions(message_id);
"""

def init_db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    migrate_chats_table(conn)
    return conn


# ─── DB helpers ─────────────────────────────────────────────────────────────

def upsert_user(conn: sqlite3.Connection, teams_id: str, display_name: str) -> int:
    conn.execute("""
        INSERT INTO users (teams_id, display_name)
        VALUES (?, ?)
        ON CONFLICT(teams_id) DO UPDATE SET
            display_name = CASE WHEN excluded.display_name != '' THEN excluded.display_name ELSE display_name END
    """, (teams_id, display_name or ""))
    return conn.execute("SELECT id FROM users WHERE teams_id = ?", (teams_id,)).fetchone()[0]


def upsert_chat(conn: sqlite3.Connection, teams_id: str, topic: str, type_: str, created_at: str) -> int:
    conn.execute("""
        INSERT INTO chats (teams_id, topic, type, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(teams_id) DO NOTHING
    """, (teams_id, topic, type_, created_at))
    return conn.execute("SELECT id FROM chats WHERE teams_id = ?", (teams_id,)).fetchone()[0]


def migrate_chats_table(conn: sqlite3.Connection):
    """為既有 DB 補上新欄位（idempotent）"""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(chats)").fetchall()}
    if "last_synced_msg_id" not in cols:
        conn.execute("ALTER TABLE chats ADD COLUMN last_synced_msg_id TEXT")
    if "last_synced_at" not in cols:
        conn.execute("ALTER TABLE chats ADD COLUMN last_synced_at TEXT")
    conn.commit()


def get_last_synced_msg_id(conn: sqlite3.Connection, db_chat_id: int) -> Optional[str]:
    row = conn.execute(
        "SELECT last_synced_msg_id FROM chats WHERE id = ?", (db_chat_id,)
    ).fetchone()
    return row[0] if row and row[0] else None


def update_sync_cursor(conn: sqlite3.Connection, db_chat_id: int, latest_msg_id: str):
    from datetime import datetime, timezone
    conn.execute("""
        UPDATE chats
        SET last_synced_msg_id = ?, last_synced_at = ?
        WHERE id = ?
    """, (latest_msg_id, datetime.now(timezone.utc).isoformat(), db_chat_id))
    conn.commit()


def insert_message(conn: sqlite3.Connection, chat_id: int, user_id: int, msg: dict) -> Optional[int]:
    try:
        conn.execute("""
            INSERT OR IGNORE INTO messages
                (chat_id, teams_msg_id, user_id, content, content_type, composed_at, sequence_id, is_deleted, raw_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            chat_id,
            msg["id"],
            user_id,
            msg.get("content", ""),
            msg.get("messagetype", ""),
            msg.get("composetime", ""),
            msg.get("sequenceid", ""),
            1 if msg.get("deletetime") else 0,
            json.dumps(msg, ensure_ascii=False),
        ))
        row = conn.execute("SELECT id FROM messages WHERE teams_msg_id = ?", (msg["id"],)).fetchone()
        return row[0] if row else None
    except Exception as e:
        print(f"  ⚠️  insert message {msg.get('id')} 失敗: {e}")
        return None


def insert_reactions(conn: sqlite3.Connection, message_id: int, reactions: list):
    for r in reactions:
        # from: "8:orgid:xxx" or URL
        from_raw = r.get("from", "") or ""
        user_id = extract_user_id_from_raw(conn, from_raw, "")
        conn.execute("""
            INSERT OR IGNORE INTO reactions (message_id, user_id, emoji, reacted_at)
            VALUES (?, ?, ?, ?)
        """, (message_id, user_id, r.get("value", ""), r.get("reactiontime", "")))


# ─── Parsers ─────────────────────────────────────────────────────────────────

def extract_teams_id_from_url(url: str) -> str:
    """從 contact URL 或原始值取出 Teams user id。
    e.g. ".../contacts/8:orgid:aba841ea-..." → "8:orgid:aba841ea-..."
    """
    m = re.search(r'contacts/([^/?\s]+)', url)
    if m:
        return m.group(1)
    # 若本身就是 id 格式
    if url.startswith("8:"):
        return url
    return url


def extract_user_id_from_raw(conn: sqlite3.Connection, from_raw: str, display_name: str) -> Optional[int]:
    if not from_raw:
        return None
    teams_id = extract_teams_id_from_url(from_raw)
    return upsert_user(conn, teams_id, display_name)


# ─── API ─────────────────────────────────────────────────────────────────────

def make_headers(token: str) -> dict:
    return {**HEADERS_BASE, "authorization": f"Bearer {token}"}


def fetch_messages_page(url: str, token: str) -> dict:
    r = requests.get(url, headers=make_headers(token), timeout=30)
    r.raise_for_status()
    return r.json()


def scrape_chat(chat_id: str, token: str, region: str, conn: sqlite3.Connection):
    base = f"https://teams.cloud.microsoft/api/chatsvc/{region}/v1"

    # 建立 chat 記錄
    db_chat_id = upsert_chat(conn, chat_id, "星期六浩克", "chat", "")

    # 增量同步：從上次最新訊息繼續
    cursor = get_last_synced_msg_id(conn, db_chat_id)
    if cursor:
        start_time = cursor
        print(f"  🔄 增量同步，從 msg_id={cursor} 之後開始")
    else:
        start_time = "1"
        print(f"  🆕 首次全量爬取")

    url = (
        f"{base}/users/ME/conversations/{chat_id}/messages"
        f"?view=msnp24Equivalent|supportsMessageProperties&pageSize=200&startTime={start_time}"
    )

    total = 0
    page  = 0
    latest_msg_id: Optional[str] = None

    while url:
        page += 1
        print(f"  📄 第 {page} 頁...", end=" ", flush=True)

        data = fetch_messages_page(url, token)
        msgs = data.get("messages") or data.get("value") or []
        print(f"{len(msgs)} 則", flush=True)

        for msg in msgs:
            from_raw     = msg.get("from", "") or ""
            display_name = msg.get("imdisplayname", "") or ""
            user_id      = extract_user_id_from_raw(conn, from_raw, display_name)

            msg_db_id = insert_message(conn, db_chat_id, user_id, msg)

            if msg_db_id and msg.get("reactions"):
                insert_reactions(conn, msg_db_id, msg["reactions"])

            # 追蹤最新的 msg id（id 是毫秒時間戳字串，數值越大越新）
            msg_id = msg.get("id", "")
            if msg_id and (latest_msg_id is None or msg_id > latest_msg_id):
                latest_msg_id = msg_id

        total += len(msgs)

        metadata = data.get("_metadata", {})
        next_url = (
            data.get("nextLink")
            or data.get("@odata.nextLink")
            or metadata.get("nextLink")
            or metadata.get("backwardLink")
        )

        if not next_url or next_url == url:
            break
        url = next_url

    # 更新 cursor
    if latest_msg_id:
        update_sync_cursor(conn, db_chat_id, latest_msg_id)
        print(f"  💾 cursor 已更新：{latest_msg_id}")

    conn.commit()
    print(f"\n  ✅ 共新增 {total} 則訊息")


# ─── Stats ───────────────────────────────────────────────────────────────────

def show_stats(conn: sqlite3.Connection):
    print(f"\n{'─'*55}")
    print(f"📊 資料庫統計：{DB_PATH}")
    print(f"{'─'*55}")

    chats = conn.execute("SELECT id, teams_id, topic FROM chats").fetchall()
    for ch in chats:
        msg_count  = conn.execute("SELECT COUNT(*) FROM messages WHERE chat_id = ?", (ch["id"],)).fetchone()[0]
        user_count = conn.execute(
            "SELECT COUNT(DISTINCT user_id) FROM messages WHERE chat_id = ?", (ch["id"],)
        ).fetchone()[0]
        print(f"  聊天室：{ch['topic'] or ch['teams_id']}")
        print(f"  訊息數：{msg_count}　　參與人數：{user_count}")

    total_users = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    print(f"\n  使用者總數：{total_users}")

    print(f"\n  最近 5 則訊息：")
    rows = conn.execute("""
        SELECT u.display_name, m.content, m.composed_at
        FROM messages m
        LEFT JOIN users u ON u.id = m.user_id
        WHERE m.content != '' AND m.is_deleted = 0
        ORDER BY m.composed_at DESC
        LIMIT 5
    """).fetchall()
    for r in rows:
        ts = r["composed_at"][:16] if r["composed_at"] else "?"
        name = (r["display_name"] or "?")[:12]
        content = (r["content"] or "")[:50].replace("\n", " ")
        # strip HTML tags
        content = re.sub(r"<[^>]+>", "", content)
        print(f"    [{ts}] {name}: {content}")
    print()


# ─── CLI ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Teams 聊天室訊息爬蟲")
    parser.add_argument("--chat-id", help="Teams chat id（預設用 local.workspace.json 設定）")
    parser.add_argument("--list", action="store_true", help="查看已儲存的資料統計")
    args = parser.parse_args()

    conn = init_db()

    if args.list:
        show_stats(conn)
        conn.close()
        return

    cfg    = load_config()
    token  = cfg["token"]
    region = cfg.get("region", "amer")
    chat_id = args.chat_id or cfg.get("chat_id", "19:bca770f2eb18442ead393a0683e08755@thread.v2")

    print(f"🚀 開始爬取聊天室：{chat_id}")
    print(f"   資料庫：{DB_PATH}")
    print(f"{'─'*55}")

    scrape_chat(chat_id, token, region, conn)
    show_stats(conn)
    conn.close()


if __name__ == "__main__":
    main()
