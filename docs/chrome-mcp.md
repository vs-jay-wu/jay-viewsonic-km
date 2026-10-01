# Chrome MCP — 讓 AI 操作 Chrome

讓 Claude Code（或其他 MCP-aware AI agent）透過 Chrome DevTools Protocol 直接操作本機 Chrome：navigate、click、type、screenshot、執行 JS、攔截網路等。

## 為什麼需要

AI agent 預設沒有瀏覽器能力。某些工作必須在瀏覽器內完成：

- 在 web app 上建立測資（例：到 `hub.stage.myviewboard.com` 建一個 OLF 課件供 Android 端測試）
- 跑 E2E 互動驗證、補截圖、貼測試案例
- 「你登入一次 → AI 接手」的協作流程

裝完之後 AI 多出一組 `mcp__chrome-devtools__*` 工具（navigate / click / type / screenshot / evaluate / network 攔截等）。

## 安裝（已完成，紀錄）

**架構：所有 session 共用一個 Chrome。** 先開一個帶遠端除錯 port 的 Chrome，每個 session 的
MCP 用 `--browserUrl` 連上去，自己不開瀏覽器。由 `claude mcp add` 寫進 user scope（`~/.claude.json`），
所有專案共用：

```bash
claude mcp add chrome-devtools -s user -- \
  npx -y chrome-devtools-mcp@latest \
  --browserUrl http://127.0.0.1:9333
```

共用 Chrome 由 `~/development/start-shared-chrome.sh` 啟動（已在跑就什麼都不做）：

```bash
open -na "Google Chrome" --args \
  --user-data-dir="$HOME/development/chrome-shared-profile" \
  --remote-debugging-port=9333 \
  --no-first-run --no-default-browser-check --window-size=1440,900
```

**為什麼不再用 `--userDataDir`（2026-10-01 改）：** 舊寫法是每個 session 的 MCP 各自用
`~/development/chrome-mcp-profile` 開一個 Chrome。同一個 profile 只能被一個 Chrome 打開，所以
第一個開的 session 佔住之後，其他 session 全部報 `The browser is already running for …`；當時
佔著的是 17 天前某個 session 留下的 Chrome，另外還有約 10 隻 chrome-devtools-mcp 同時活著。
舊設定備份在 `~/.claude.json.bak-2026-10-01-chrome`。

**為什麼是 9333 不是 9222：** 9222 留給 adb forward 進來的 Android WebView CDP —
[`oc-portal-picker/features/webview-auth-sync`](repositories/Viewsonic-EDU/oc-portal-picker/features/webview-auth-sync/README.md)
的腳本預設 `SRC_PORT=9222`（桌面 Chrome 用 9224）。共用 Chrome 佔 9222 的話，`adb forward`
會綁不上，或腳本連到共用 Chrome 而不是手機。

驗證：

```bash
claude mcp list | grep chrome
# chrome-devtools: ... ✓ Connected
```

## 共用 profile

- 路徑：`~/development/chrome-shared-profile`（舊的 `~/development/chrome-mcp-profile` 已不使用）
- **所有專案、所有 session 共用** — 登入過的網站 cookie、書籤、自動填入跨 session 保留
- **只登入 agent 需要的網站**（目前：claude.ai，用來讀 Claude Design）
- 與你日常 Chrome 的 `~/Library/Application Support/Google/Chrome` **隔離**，互不影響

## 使用流程

1. 在 Claude Code session 內請 AI 操作瀏覽器，例如：
   - 「幫我打開 hub.stage.myviewboard.com/library 截個圖」
   - 「點 Create Lesson 按鈕」
2. 共用 Chrome 要先開著：`~/development/start-shared-chrome.sh`。**MCP 不會自己開 Chrome** —
   重開機或關掉 Chrome 之後，每個 chrome-devtools 呼叫都會失敗，直到重新跑這支腳本
   - 每個 session 開**自己的分頁**（背景開，不搶焦點），不要操作別的 session 的分頁
3. 遇到登入頁時，**AI 會卡住** → 你手動在那個 Chrome 視窗登入 → AI 繼續
4. 之後同 host 都不用再登入（cookie 留在 profile）

> 註：MCP server 在 Claude Code 啟動時連線。剛裝完或改設定後，**要重啟當前 session** 才會看到 `mcp__chrome-devtools__*` 工具。

## 故障排除

| 症狀 | 處理 |
|---|---|
| AI 說工具沒出現 | 重啟 Claude Code session；確認 `claude mcp list` 顯示 ✓ Connected |
| 工具呼叫連不上 / timeout | 共用 Chrome 沒開：`curl -s http://127.0.0.1:9333/json/version` 沒回應就跑 `~/development/start-shared-chrome.sh` |
| 報 `The browser is already running for …` | 那個 session 還在用舊設定（`--userDataDir`），重開 session 就會改連共用 Chrome |
| Chrome 視窗卡死 | 關掉共用 Chrome 再跑啟動腳本；登入態存在 profile 裡，不會掉 |
| profile 損壞 / 行為怪 | 刪 `~/development/chrome-shared-profile` 重來（會掉所有登入態） |
| 分頁越開越多 | 共用 Chrome 不會自動清，手動關掉沒在用的分頁 |
| 想看 MCP 在做什麼 | 加 `--logFile /tmp/chrome-mcp.log` 並設 `DEBUG=*`，重新註冊 |

## 安全注意

- MCP 跑時等於 AI 有你 Chrome profile 的**完整存取**：cookie、session、自動填入密碼
- **遠端除錯 port（9333）沒有任何驗證** — 本機上任何程式都能透過它用你的登入身分操作這個 Chrome。
  只聽 `127.0.0.1`（Chrome 預設），不要加 `--remote-debugging-address=0.0.0.0`
- profile 目錄含敏感資料，**不要 commit 進 git**（`~/development` 在家目錄通常不會被 push，但仍要小心）
- 對 sensitive site（銀行、admin console、Gmail）不要用這個 profile 登入 — 需要乾淨環境時，`new_page` 帶 `isolatedContext` 開隔離分頁
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
