爬取 Teams 聊天室訊息並存入 SQLite。

支援增量同步（自動從上次爬到的位置繼續）。

**前置作業（token 過期時）：**
執行 `/teams-update-token` 自動更新 `.env` 的 `TEAMS_TOKEN`。

**用法：**
- `/teams-scrape` → 爬預設聊天室（星期六浩克）
- `/teams-scrape --list` → 查看已儲存的統計資料
- `/teams-scrape --chat-id "19:xxx@thread.v2"` → 爬指定聊天室

執行：

```bash
pip3 install requests -q 2>/dev/null
python3 scripts/teams-scrape.py $ARGUMENTS
```
