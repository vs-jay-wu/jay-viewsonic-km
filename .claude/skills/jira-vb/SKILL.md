---
name: jira-vb
description: 在 VB 專案（EDU - Software）開 Jira 單。2026-09-09 起新單開這裡、不再開 VSFT；狸貓版依層次分流（實作票 MT-、產品面/跨端需求 VB-，見 mvb-rewrite）。含欄位清單、Team uuid、標題慣例與查證方式。
---

# 在 VB 開 Jira 單

**新開的 ticket 建在 `VB`（EDU - Software）。** `VSFT`（myViewBoard Suite）是舊落點，
既有的 VSFT 單留在原地不搬。

| 範圍 | 開哪裡 |
|---|---|
| mvbf / ClassSwift / 學生端 web，以及其餘一切 | **`VB-*`**（取代 `VSFT-*`） |
| 狸貓版三 repo 的**實作票**（spec、功能、bug、test-infra） | **`MT-*`**，見 `mvb-rewrite` skill |
| 狸貓版的**產品面／跨端需求／後端契約** | **`VB-*`**（見下） |

### 狸貓版是分兩層，不是「一律 MT」

2026-09-10 查證（`project = VB AND (summary ~ mac OR native OR 狸貓 …) ORDER BY created ASC`）：
VB 上確實有狸貓版的票，最早 2026-08-31，全部集中在近兩週：

| 票 | 內容 | 建立 |
|---|---|---|
| `VB-1793` / `VB-1794` | [mVB Android] / [mVB Mac] 原生版 v-next OLF 發布與跨平台相容驗證 | 2026-08-31 |
| `VB-1897` | **Mac Native**（Epic） | 2026-09-01 |
| `VB-1893` | [App Store] Mac 版上架 | 2026-09-01 |
| `VB-2001` / `VB-2021` / `VB-2022` / `VB-2027` | VS Account Route B 後端契約，明寫「三平台 native client」、引用 `MT-2757` | 2026-09-07~08 |
| `VB-2061` / `VB-2063` | [MS SSO] Story 1.5 _ **[mVB Windows 狸貓]** / [mVB Mac] | 2026-09-09 |

同期 MT 照常收狸貓版的實作票（2026-09-09 仍有 `MT-3074`/`MT-3076` mac、`MT-3075` windows），
所以兩邊不是取代關係，而是**層次分工**：

- **VB** = PM／跨團隊那一層：產品需求、上架、五端共通故事、後端 API 契約。標題用
  `[mVB Mac]` / `[mVB Windows 狸貓]` 標平台；會反向引用 MT 票號當實作依據。
- **MT** = 狸貓版 repo 內部執行那一層：spec 編號、實作、bug、port parity、test-infra。

> ### ⏳ MT 與 VSFT 都會收掉（2026-09-11 Jay 裁定）
>
> Jay 2026-09-11 說「MT 和 VSFT 未來都會棄用」，最終落點是 VB 一個專案。
>
> **但這是方向，不是現況** —— 2026-09-09 MT 仍在收新票（`MT-3074` / `MT-3075` /
> `MT-3076`）。在實際停用之前照下面的分流做，不要自己提前把實作票搬去 VB。
>
> **翻案條件**：`project = MT AND created >= -14d` 查不到新票，就是真的停了，
> 那時把下面這段分流整個刪掉。

判斷方式：**這件事別的團隊要不要知道／要不要接？** 要 → VB；只在三個 playground repo 內
完成 → MT。拿不準時看它會不會掛在 VB 的產品 Epic（如 `VB-1897` Mac Native）底下。

> ⚠️ **不要用「既有票的分布」推該開在哪個 project。** 那只反映過去，看不出組織換了落點——
> 2026-09-09 就是這樣開錯的（用 fishing-cat 的 commit 票號 221/221 都是 VSFT 推導）。

---

## 固定要填的四個欄位

| 欄位 | field id | 值 | 怎麼決定 |
|---|---|---|---|
| **Project** | `customfield_12435`（多選） | 見下方對照 | 跟著**產品面**走，可從既有票推導 |
| **Team** | `customfield_10001`（Atlassian Team，吃 **uuid**） | Jay ＝ `6f9a9340-9236-4cdf-8ce4-f65469b81da9`（星期六浩克 scrum team - EDU） | 跟著**誰接這件事**走，見 [[repo-team-mapping-is-many-to-many]] |
| **衝刺** | `customfield_10020` | 當期 `VB Sprint N` 的數字 id | VB 是**全專案共用一個 sprint**，不分隊 |
| 議題類型 | — | `任務` / `漏洞` / `故事` / `Spike` / `Ops Task` | |

**`Team` 有預設值會自動帶入，而且不一定是你的隊。** 2026-09-09 建 VB-2055 時被帶成
`Say My Name scrum team - EDU`，我沒設過那欄。**建完一定要回頭確認這格。**

### Team uuid（用 JQL 查證，不要背）

```bash
# 列出 VB 近期各單的 Team 與 uuid
jira_search: project = VB AND "Team" is not EMPTY ORDER BY updated DESC
             fields: key,customfield_10001   use_display_names: true
```

已知：星期六浩克 `6f9a9340-…` ／ 買房子 `f16d92ef-…` ／ Say My Name `6f22aff0-…` ／
Scale JK `eca8b62a-…`（`- EDU` 後綴是名稱的一部分）。

### Project 欄位對照

| 產品面 | 值 |
|---|---|
| 學生端 web（fishing-cat 與 edu-participant-web 都算） | `Student Web` |
| Hub | `Hub` |
| Manager | `Manager` |
| Finch | `Finch` |
| myViewBoard 客戶端 | `myViewBoard` |

---

## 標題慣例

**`[區域][子區域] 描述`** —— 兩層 bracket 後直接接描述，中間只有一個空格。
**沒有 conventional-commit 的 type**（那是 fishing-cat PR 的規則，不是 Jira 的）。

第二層 bracket 放**子模組／平台／目標 client／需求代號**：

```
[Hub][Canvas] 同步時，組織有包含課程狀態為 "concluded" 的課程會顯示同步錯誤訊息
[Canvas][Flutter] App 支援 Canvas My Library
[Backend][VS Account Route B] mvb-api POST /application/login/ws 以 VS access token 登入…
[Student][R1] 後端 GET /lessons 新增 join_flow_type 欄位，提供六分類教室屬性
[vSweeper][UI] CDP11550 開啟 PBP 模式時 vSweeper UI 無法完整顯示（上邊框被裁切）
```

- 學生端一律 `[Student]` 開頭；**兩份實作用第二層 bracket 分**（`[Student][edu-participant-web]`），
  同 `[Canvas][Flutter]` / `[Canvas][Windows]` 的作法
- 要接第二個子句用**破折號 `—`**：`… 看不到 Canvas child org — 加等待提示引導重整`

> ⚠️ **全形冒號 `：` 不要用。** 45 張近期 VB 標題裡零出現。2026-09-09 我寫過
> `[Student] edu-participant-web：…`——那是把 VSFT-9961 的「repo 名寫進標題文字」搬過來的，
> **VB 不是那樣寫**。查證方式：`project = VB AND created >= -45d`，看 summary 欄。

---

## VB 與 VSFT 的欄位差異（不要沿用 customfield id）

| | VSFT | VB |
|---|---|---|
| 產品面分類 | `Platform`（`customfield_12437`，單選） | `Project`（`customfield_12435`，多選） |
| 團隊 | `Scrum Team`（`customfield_12443`，下拉字串） | `Team`（`customfield_10001`，Atlassian Team uuid） |
| Sprint | 各隊各自的 sprint（board 360） | 全專案共用 `VB Sprint N`（board 1754） |
| 其他 | — | 多 `Acceptance Criteria`、`Figma`；**reporter 必填** |

開單前照樣跑一次 `jira_get_project_issue_types` 與 `jira_get_create_fields`，欄位會變。

---

## 開完之後

1. **回頭 verify 一次欄位**（尤其 Team），用 `jira_get_issue` 讀回來看，不要相信建立時的回傳。
2. 有相關單就建連結（`jira_create_issue_link`，`Relates`）。
3. **VSFT 沒有刪除權限**——開錯專案時只能留作廢留言＋轉 CLOSED，並記得清掉舊單的 issue link
   與其他地方（PR 描述、其他單的留言）的引用。
