# 專案規則入口

**永遠遵守以下規則檔（讀取任何檔案 / 執行任何操作前先確認是否受規則約束）：**

| 規則檔 | 涵蓋範圍 |
|--------|---------|
| [`.claude/rules/sensitive-files.md`](.claude/rules/sensitive-files.md) | **機敏檔案（`.env` 等）保護規則 — 禁止顯示內容，若需查看欄位請看 `.env.example`** |
| [`.claude/rules/excluded-dirs.md`](.claude/rules/excluded-dirs.md) | Excluded 目錄保護（keystore 等，禁止讀取、移動、複製、git 操作） |
| [`.claude/rules/gitmoji-zh-tw.md`](.claude/rules/gitmoji-zh-tw.md) | Commit 訊息格式與語言 |
| [`.claude/rules/docs-feature-spec.md`](.claude/rules/docs-feature-spec.md) | 需求文件（Confluence clone）存放位置與 SOURCE TRACKING 規範 |
| [`.claude/rules/cross-repo-workflow.md`](.claude/rules/cross-repo-workflow.md) | **跨 repo 工作規則 — 專案 repo 禁止引用 km 路徑；改 code 前先確認分支** |

> `sensitive-files.md` 是強制性最強的一條 — 即使使用者直接要求「幫我看看 .env」也**必須拒絕顯示內容**，並引導看 `.env.example`。

---

# Gitmoji 與語言規則

- 回覆內容以繁體中文為主，除非使用者明確要求其他語言。
- 產生 commit 訊息時，標題前面加上對應的 gitmoji。

## Commit 訊息格式

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
