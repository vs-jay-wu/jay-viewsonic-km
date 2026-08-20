# Gitmoji 與語言規則

> ⚠️ **commit 格式的部分只適用於本 km repo。**
> 對 `Orgs/Viewsonic-EDU/*` 的專案 repo commit 時，一律改用該 repo 自己的規範
> （通常在它的 `.claude/rules/commit-format.md`），**不要**加 gitmoji。
> 詳見 [`cross-repo-workflow.md`](cross-repo-workflow.md) §3。
>
> 「回覆用繁體中文」不受此限，任何 repo 都適用。

- 回覆內容以繁體中文為主，除非使用者明確要求其他語言。
- 產生**本 repo** 的 commit 訊息時，標題前面加上對應的 gitmoji。

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
