# Chrome MCP — 讓 AI 操作 Chrome

讓 Claude Code（或其他 MCP-aware AI agent）透過 Chrome DevTools Protocol 直接操作本機 Chrome：navigate、click、type、screenshot、執行 JS、攔截網路等。

## 為什麼需要

AI agent 預設沒有瀏覽器能力。某些工作必須在瀏覽器內完成：

- 在 web app 上建立測資（例：到 `hub.stage.myviewboard.com` 建一個 OLF 課件供 Android 端測試）
- 跑 E2E 互動驗證、補截圖、貼測試案例
- 「你登入一次 → AI 接手」的協作流程

裝完之後 AI 多出一組 `mcp__chrome-devtools__*` 工具（navigate / click / type / screenshot / evaluate / network 攔截等）。

## 安裝（已完成，紀錄）

由 `claude mcp add` 寫進 user scope（`~/.claude.json`），所有專案共用：

```bash
claude mcp add chrome-devtools -s user -- \
  npx -y chrome-devtools-mcp@latest \
  --userDataDir /Users/jay.wj.wu/development/chrome-mcp-profile \
  --viewport 1440x900
```

驗證：

```bash
claude mcp list | grep chrome
# chrome-devtools: ... ✓ Connected
```

## 共用 profile

- 路徑：`~/development/chrome-mcp-profile`
- **所有專案共用** — 登入過的網站 cookie、書籤、自動填入跨 session 保留
- 與你日常 Chrome 的 `~/Library/Application Support/Google/Chrome` **隔離**，互不影響

## 使用流程

1. 在 Claude Code session 內請 AI 操作瀏覽器，例如：
   - 「幫我打開 hub.stage.myviewboard.com/library 截個圖」
   - 「點 Create Lesson 按鈕」
2. AI 第一次呼叫工具時，MCP server 會 spawn 一個 Chrome 視窗（用上面那個 profile）
3. 遇到登入頁時，**AI 會卡住** → 你手動在那個 Chrome 視窗登入 → AI 繼續
4. 之後同 host 都不用再登入（cookie 留在 profile）

> 註：MCP server 在 Claude Code 啟動時連線。剛裝完或改設定後，**要重啟當前 session** 才會看到 `mcp__chrome-devtools__*` 工具。

## 故障排除

| 症狀 | 處理 |
|---|---|
| AI 說工具沒出現 | 重啟 Claude Code session；確認 `claude mcp list` 顯示 ✓ Connected |
| Chrome 視窗卡死 / MCP timeout | `pkill -f chrome-devtools-mcp` 然後重新請 AI 操作（會自動重啟 Chrome） |
| profile 損壞 / 行為怪 | 刪 `~/development/chrome-mcp-profile` 重來（會掉所有登入態） |
| 想看 MCP 在做什麼 | 加 `--logFile /tmp/chrome-mcp.log` 並設 `DEBUG=*`，重新註冊 |

## 安全注意

- MCP 跑時等於 AI 有你 Chrome profile 的**完整存取**：cookie、session、自動填入密碼
- profile 目錄含敏感資料，**不要 commit 進 git**（`~/development` 在家目錄通常不會被 push，但仍要小心）
- 對 sensitive site（銀行、admin console）不建議用這個 profile 登入 — 另開隔離 profile 或用 `--isolated`（臨時 profile，關閉即刪）
- 平時不用時可移除：`claude mcp remove chrome-devtools -s user`

## 替代方案

| 工具 | 何時改用 |
|---|---|
| `@playwright/mcp` (Microsoft) | 需要更豐富的 selector、auto-wait、trace 錄製；不介意每次另開乾淨 Chromium |
| `puppeteer-mcp` | 已有 Puppeteer 經驗、想客製化 |
| 手動 + 截圖貼給 AI | 一次性任務，不值得開 MCP |

## 參考

- 官方 repo：<https://github.com/ChromeDevTools/chrome-devtools-mcp>
- 完整 CLI 旗標：`npx chrome-devtools-mcp@latest --help`
- Claude Code MCP 文件：<https://docs.claude.com/en/docs/claude-code/mcp>
