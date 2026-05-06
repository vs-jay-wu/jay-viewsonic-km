更新 Teams Bearer token 並寫入 `.env`。

**流程：**
1. 用 Playwright 開啟 Teams（帶入 `.browser-profile` 已儲存的登入狀態）
2. 若未登入，瀏覽器會停在登入頁，等使用者手動登入
3. 點任一聊天室觸發 `chatsvc` 請求後，自動擷取 Bearer token
4. 寫入 `.env` 的 `TEAMS_TOKEN`，視窗自動關閉

**前置作業（首次）：**
```bash
pip3 install playwright -q && playwright install chromium
```

執行：

```bash
pip3 install playwright -q 2>/dev/null
python3 scripts/teams-update-token.py
```
