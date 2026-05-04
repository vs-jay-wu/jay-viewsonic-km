讀取指定聊天室的 Teams 訊息，由 Claude 直接生成摘要，並透過 API 寫入資料庫。

**前置條件：** `http://localhost:3000` 必須在執行中（`cd web && npm run dev`）

**用法：**
- `/teams-summarize` → 總結星期六浩克的最近訊息
- `/teams-summarize <時間範圍>` → 例如「2026年4月」「最近一週」

執行步驟：

1. 從資料庫讀取訊息：

```bash
sqlite3 /Users/jay.wj.wu/ProjectsWork_GitHub/jay-viewsonic-km/data/teams.db \
  "SELECT m.composed_at, u.display_name, m.content, m.teams_msg_id
   FROM messages m
   LEFT JOIN users u ON u.id = m.user_id
   WHERE m.chat_id = 1
     AND m.is_deleted = 0
     AND m.content != ''
     AND m.content_type LIKE '%RichText%' OR m.content_type LIKE '%Text%'
   ORDER BY m.composed_at ASC" 2>/dev/null | head -500
```

2. 閱讀訊息後，生成包含以下項目的摘要：
   - 重要討論主題與結論
   - 待辦事項或決策
   - 關鍵訊息（附 teams_msg_id）

3. 透過 API 寫入（將 `TITLE`、`SUMMARY`、`KEY_MESSAGES` 替換為實際內容）：

```bash
curl -s -X POST "http://localhost:3000/api/chats/1/summaries" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "TITLE",
    "period_start": "YYYY-MM-DD",
    "period_end": "YYYY-MM-DD",
    "summary_text": "SUMMARY",
    "key_messages": KEY_MESSAGES
  }'
```
