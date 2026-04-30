# 知識中心專案說明

此專案作為公司 GitHub 組織專案的知識中心入口。

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
