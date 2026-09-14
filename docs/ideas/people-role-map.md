# 備案：人員 ↔ 職位／帳號對應表

**狀態：不做（2026-09-14 討論後決定），留著當備案。**
未來如果下面的「翻案條件」成立，再回來看這份。

## 想做什麼

一個 `/people` 頁，把 Jira 上的人列出來，手動標成 RD / PM / QA / UI-UX，
存成一份資料讓 AI 之後查得到。

## 討論出來的東西（這才是這份文件的價值）

### 1. 真正值錢的不是職位，是**身分對應**

同一個人在三個系統是三個名字，**AI 永遠推不出來，只能猜，而且會猜錯**：

```
Jira:   Jacky Yang
GitHub: vs-jacky-yang     ← PR review 裡看到的是這個
Teams:  （又是另一個顯示名）
```

職位反而是附帶的。有了對應表之後可以接上的地方：

- 我的 PR：`approved by Jacky Yang（RD）`，而不是一串 GitHub 帳號
- 單追蹤：`指派給 Peja（PM）` —— 指給 PM 的 bug 通常是**等決策**不是等 code，
  這個判斷會直接改變要不要去催
- `handoff-docs` skill：寫交接時知道對象是 PM 還是 RD（那個 skill 本來就在講這件事）
- 開單時不會把實作票指給 QA

### 2. 不要「列出所有人」（2026-09-14 實際數過）

| 範圍 | 人數 |
|---|---|
| Jira 全站真人（`/rest/api/3/user/assignable/search?project=VB`） | 165 |
| VB 可指派 | 111（真人 106） |
| **實際出現在 Jay 資料裡**（my-tickets 的 assignee/reporter ＋ my-prs 的 reviewer/留言者） | **74** |
| 其中只出現 1～2 次 | 23 |

前 20 位就覆蓋絕大多數情境（Peja 199、Sunny Chuang 90、zoe.ay.yeh 80、
Mandy Luo 79、Evis Cheng 75、vs-jacky-yang 56…）。
列 165 列的表只會標前 20 個然後再也不回來，剩下的變成過期資料。

### 3. 要放進版控，不能放 `data/local-state/`

`data/people.json`（**進版控**）：

```json
{ "people": [
  { "jira": "Jacky Yang", "github": "vs-jacky-yang", "role": "RD",
    "note": "mvbf 的主要 reviewer", "updatedAt": "2026-09-14" }
]}
```

理由：這是**知識**不是本機狀態。放 `local-state/` 會被 gitignore，
別的 session 的 AI 讀不到也 grep 不到，等於白做。

**而且一定要在 `.claude/rules/` 加一條指標**（「要知道某人是 RD/PM/QA、
或某個 GitHub 帳號是誰，查 `data/people.json`」）——沒有指標的話 AI 不會想到去找它，
這是這件事能不能被用到的關鍵。

### 4. 為什麼決定先不做

**沒有消費端的資料會腐爛。** 目前沒有任何功能非它不可，做出來就是一份
三個月後過期的名單。人會換組、會離職，而沒有人會為了維護而維護。

## 翻案條件（任一成立就值得回來做）

- 真的出現一個**需要角色才能做對**的功能，例如：AI 要自動決定 PR review 要不要
  找 QA、或交接文件要依對象換寫法，而不是每次由 Jay 口頭講
- 開始經常需要「某個 GitHub 帳號是誰」的反查（現在只有 `vs-jacky-yang` 一個常客，
  多到五、六個就值得建表）
- 要做跨系統的人員維度統計（例如「我的單多半卡在誰身上」）

## 如果之後要做，範圍是

做：`/people` 頁（候選只列出現過的 74 位、四個角色、GitHub 帳號欄、備註、
`updatedAt` 並把超過半年沒更新的標出來）、`data/people.json`、rules 指標、
**同時接上兩個消費端**（單追蹤的角色 chip、我的 PR 的 reviewer 姓名＋角色）。

不做：全站 165 人列表、頭像、Team 對應（票上已經有 `customfield_10001`）、
組織圖、自動猜職位。

## 附：查人的 Jira API（2026-09-14 在 viewsonic-vsi 實測）

| 要什麼 | Endpoint | 結果 |
|---|---|---|
| 某專案可指派的人 | `/rest/api/3/user/assignable/search?project=VB` | ✅ 111 筆 |
| 站上所有使用者 | `/rest/api/3/users/search`、`/rest/api/3/user/search?query=` | ✅ 單次上限 200，要自己分頁 |
| 某張票上的人 | issue 的 `assignee`／`reporter`、`/issue/{key}/watchers`、`/issue/{key}/comment` | ✅ |
| 專案角色成員 | `/rest/api/3/project/VB/role` | ❌ 401（管理員 API） |
| Atlassian Team 的成員 | 不在 Jira REST，要另一組 Teams API | 票上只拿得到 team uuid 與名稱 |
