# Manager 讀取 myViewBoard Instance ID（ContentProvider）

Manager（Software Instance 管理頁）需要知道「instance ID ↔ 裝置」的對應關係，
由 Android myViewBoard 透過 ContentProvider 提供 **instance ID + entity name** 給同裝置的 Manager agent 讀取，並限制 signed key。

## Jira

| Ticket | 團隊 | 摘要 | 狀態（2026-07-30） |
|---|---|---|---|
| [VSFT-9654](https://viewsonic-vsi.atlassian.net/browse/VSFT-9654) | 星期六浩克（MVB） | [Manager integration] 提供 Manager 讀取得到 myViewBoard instance ID | ANALYSIS，未指派，Sprint 25（7/30–8/10） |
| [VB-1399](https://viewsonic-vsi.atlassian.net/browse/VB-1399) | Manager（SW Mgmt） | Story 7: myViewBoard Settings - 與 mvb 串接以取得 software instance id | 進行中，未指派 |

## Scope

- **只做 Android myViewBoard**（Windows 不需要）
- 技術方向（Stephen Yang 2026-07-29 comment 定調）：
  - MVB 透過 ContentProvider 提供 instance id、entity name 給 Manager agent
  - ContentProvider 限制 signed key

## 文件索引

| 檔案 | 內容 |
|---|---|
| [overview.html](overview.html) | 總覽：兩票分工、資料流圖、現況摘要 |
| [investigation.md](investigation.md) | 調查問題清單與查證狀態 |
| [findings.html](findings.html) | 程式碼調查結果（instance ID / entity 現況、ContentProvider 先例、簽章陷阱、本機實驗、POC） |
| [open-questions.html](open-questions.html) | 需要 PM / Manager team 決策的疑問 |
| [contract-proposal.html](contract-proposal.html) | Provider contract 草案：key-value 形狀、v1 最小集、保留欄位、機敏排除、版本策略、空值處理 |
