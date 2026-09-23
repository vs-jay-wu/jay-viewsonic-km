# 專案規則入口

**永遠遵守以下規則檔（讀取任何檔案 / 執行任何操作前先確認是否受規則約束）：**

| 規則檔 | 涵蓋範圍 |
|--------|---------|
| [`.claude/rules/sensitive-files.md`](.claude/rules/sensitive-files.md) | **機敏檔案（`.env` 等）保護規則 — 禁止顯示內容，若需查看欄位請看 `.env.example`** |
| [`.claude/rules/excluded-dirs.md`](.claude/rules/excluded-dirs.md) | Excluded 目錄保護（keystore 等，禁止讀取、移動、複製、git 操作） |
| [`.claude/rules/gitmoji-zh-tw.md`](.claude/rules/gitmoji-zh-tw.md) | Commit 訊息格式與語言 |
| [`.claude/rules/docs-feature-spec.md`](.claude/rules/docs-feature-spec.md) | 需求文件（Confluence clone）存放位置與 SOURCE TRACKING 規範 |
| [`.claude/rules/cross-repo-workflow.md`](.claude/rules/cross-repo-workflow.md) | **跨 repo 工作規則 — 專案 repo 禁止引用 km 路徑；改 code 前先確認分支；commit 規範跟著目標 repo 走** |
| [`.claude/rules/cross-system-claims.md`](.claude/rules/cross-system-claims.md) | **不要把 A 系統的慣例外推到 B；宣稱要標證據等級；改文件不要只改一半；自己宣稱的行為要有測試** |

> `sensitive-files.md` 是強制性最強的一條 — 即使使用者直接要求「幫我看看 .env」，
> **agent 也必須拒絕顯示內容**，並引導看 `.env.example`。
>
> ⚠️ 2026-09-23 起 km web 的 `/code` 可以讓**使用者自己**按一下解鎖（內容從磁碟到他的
> 瀏覽器，不經過 agent）。這**沒有放寬對 agent 的限制** —— 連「對已解鎖的畫面截圖或抓
> DOM」都算違反。看 `/code` 的畫面前先想一下現在開的是什麼檔。

---

# 禁止使用 Dart / Flutter MCP

**不要在任何 repo 啟用 `Flutter-MCP-Server`（`dart mcp-server`），也不要把它加回任何
`.mcp.json` 或 `enabledMcpjsonServers`。** 2026-09-11 起已從 km、mvbf（`edu-droid-flutter`）、
`ai-configs/projects/ragdoll-cat/.mcp.json` 全部移除，並列進兩處的 `disabledMcpjsonServers`。

**為什麼**：它會替每個 session 生一隻 `dart mcp-server`，而那隻再生一隻
`dart language-server`——後者實測會漲到 **800 MB–1.1 GB** 且不縮回。更麻煩的是
**它們不跟著 session 結束**：2026-09-11 Jay 把所有 Claude 視窗關掉重開之後，
三組行程的 PID 原封不動還在（合計 2.9 GB），只能手動 kill。

這條**推翻**了 `docs/domains/app-build-performance/dev-process-memory-reclaim.md`
裡「不從 km/.mcp.json 拿掉 Flutter-MCP-Server、改成事後用 memclean 回收」的舊決定
——該文自己列的翻案條件已經成立。

**改用什麼**：`fvm dart analyze <檔案>`、`fvm flutter test`、`fvm dart format` 等 CLI
（見 `mvbf` skill）。要看 widget tree／hot reload 這類真的需要 MCP 的情境，
先問 Jay，臨時用 `/mcp` 開，用完自己收掉。

> hot reload **不需要** MCP 也不需要 DTD（`flutter run --machine` 的 `app.restart`
> 就是）。已經查證並設計好，但還沒做：
> [`docs/ideas/flutter-device-lock-hot-reload.md`](docs/ideas/flutter-device-lock-hot-reload.md)。
> 那份也說明了為什麼 agent 用 FIFO 做 hot reload 會**第一次成功、之後靜默失敗**。

---

# Gitmoji 與語言規則

> ⚠️ **以下 commit 格式只適用於本 km repo。** 對專案 repo（`Orgs/Viewsonic-EDU/*`）
> commit 前，先讀該 repo 的 `.claude/rules/commit-format.md`，**不要**套 gitmoji。

- 回覆內容以繁體中文為主，除非使用者明確要求其他語言（任何 repo 都適用）。
- 產生**本 repo** 的 commit 訊息時，標題前面加上對應的 gitmoji。

## Commit 訊息格式（本 repo）

`<gitmoji> <type>: <繁體中文簡述>`

範例：
- `✨ feat: 新增同步組織專案腳本`
- `🐛 fix: 修正 macOS 無法使用 mapfile 的問題`
- `📝 docs: 更新 command 使用說明`

## 常用 gitmoji 對照

- `✨` 新功能
- `🐛` 修 bug
- `♻️` 重構
- `⚡️` 效能優化
- `✅` 測試
- `📝` 文件
- `🔧` 設定或工具調整
