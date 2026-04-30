列出 Teams 所有聊天室（含 chat id），使用 local.workspace.json 的 token。

**前置作業：**
在 Teams 網頁版 DevTools → Network → 找任一 `chatsvc` 請求，複製 `Authorization: Bearer` 後面的 token 填入 `local.workspace.json` 的 `teams.token`。

執行：

```bash
bash scripts/teams-list-chats.sh
```
