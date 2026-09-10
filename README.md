# 知識中心專案說明

此專案作為公司 GitHub 組織專案的知識中心入口。

## 本機工作台（web）

```bash
cd web && npm run dev        # http://localhost:3000
```

> `better-sqlite3` 是原生模組。換過 Node 版本後會出現
> `NODE_MODULE_VERSION` 不合而整站 500，跑 `npm rebuild better-sqlite3` 修好。

要讓它常駐（登入自動起、掛掉自動重啟）：

```bash
./scripts/setup-km-web.sh --install     # --status / --restart / --logs / --uninstall
```

常駐與手動 `npm run dev` 會搶同一個 port，兩者只留一個（或用 `--port` 換）。
**PR 巡邏的排程掛在這個 server 裡，server 沒開就不會巡邏。**

| 頁面 | 做什麼 | 背後的東西 |
|---|---|---|
| `/` | 首頁：Teams 歸檔概況與工具入口 | `data/teams.db` |
| `/chat/<id>` | Teams 訊息瀏覽與月摘要 | `/teams-scrape`、`/teams-summarize` |
| `/my-prs` | 我的 PR：open 與近期 merged 的狀態；有人 review／approve 就通知 | `scripts/my-prs.sh`（server 定時抓，開頁面只讀快照） |
| `/memory` | 記憶體／swap 用量、執行 memclean、檢視腳本 | `shell/memclean.py`（終端機的 `memclean` 同源） |
| `/pr-inbox` | PR 巡邏：排程開關、手動觸發、執行紀錄與花費 | `scripts/pr-inbox-watch.sh`（排程本身跑在 web server 裡） |
| `/sessions` | Claude session 檢視、pin、多選刪除 | `~/.claude/projects`、`data/local-state/session-pins.json` |

`data/pr-inbox-runs/` 與 `data/local-state/` 是本機狀態（PR 快照、通知事件、session pin 與
解析快取都在裡面），兩者都 gitignored。
PR 巡邏的執行紀錄會自動清：**沒叫 AI 的留 7 天，派過 AI（或被中斷）的留 30 天**
（`web/lib/prInbox.ts` 的 `RETAIN_DAYS` / `RETAIN_DAYS_AI`），
在 server 啟動、每輪巡邏、每次開 `/pr-inbox` 時各檢查一次。

## 專案同步規則

- 本機根目錄：`/Users/jay.wj.wu/ProjectsWork_GitHub/Orgs`
- 依組織建立子目錄：`/Users/jay.wj.wu/ProjectsWork_GitHub/Orgs/<org>`
- 每次同步時：
  - 尚未存在的 repo 會 `clone`
  - 已存在的 repo 會 `pull --ff-only`

## MCP 設定

### Microsoft Teams MCP

複製範本並在 Claude Code 啟用：

```bash
cp .mcp.example.json .mcp.json
```

首次使用前，執行以下指令進行 OAuth 登入（裝置碼驗證）：

```bash
npx @floriscornel/teams-mcp@latest authenticate
```

驗證是否已登入：

```bash
npx @floriscornel/teams-mcp@latest check
```

> Token 快取存於 `~/.teams-mcp-token-cache.json`，之後重啟 Claude Code 會自動沿用。

> **⚠️ 目前不支援：** `@floriscornel/teams-mcp` 透過 Microsoft Graph API 運作，需要組織管理員核准應用程式權限。ViewSonic 組織目前尚未核准，待 IT 開放後再啟用。

## Cursor Command

已建立 command 檔案：

- `.cursor/commands/sync-org-repos.md`

預設組織為 `Viewsonic-EDU`，也可在執行時傳入其他組織名稱參數。
