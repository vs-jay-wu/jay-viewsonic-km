---
name: jira-vb
description: 在 VB 專案（EDU - Software）開 Jira 單。所有新單都開這裡——VSFT 與 MT 都已退場（MT 2026-09-16 起停用、轉換中），狸貓版的產品面與實作票一律 VB。含欄位清單、Team uuid、標題慣例與查證方式。
---

# 在 VB 開 Jira 單

**新開的 ticket 建在 `VB`（EDU - Software）。** `VSFT`（myViewBoard Suite）是舊落點，
既有的 VSFT 單留在原地不搬。

| 範圍 | 開哪裡 |
|---|---|
| **全部**——mvbf / ClassSwift / 學生端 web / 狸貓版的產品面與實作票 | **`VB-*`** |

> 2026-09-16 起連狸貓版的實作票也開 VB（見下方紅框）。`VSFT` 與 `MT` 都不再是我們的落點，
> 既有單留在原地。

### 〔歷史，2026-09-16 已作廢〕狸貓版曾經分兩層

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
當時兩邊不是取代關係，而是層次分工（**這段保留只為了讀懂既有票的分布**，不要再照著開單）：

- **VB** = PM／跨團隊那一層：產品需求、上架、五端共通故事、後端 API 契約。標題用
  `[mVB Mac]` / `[mVB Windows 狸貓]` 標平台；會反向引用 MT 票號當實作依據。
- **MT** = 狸貓版 repo 內部執行那一層：spec 編號、實作、bug、port parity、test-infra。

> ### 🛑 MT 已停用（2026-09-16）——新單一律開 VB
>
> Jay 2026-09-16：「MT-* 停用了，近期就會轉換，請維持開在 VB-*，就是以 VB-* 為主。」
> **產品面與實作票都開 VB**，實作票掛在對應的產品單底下（例：`VB-2247` 桌面標註模式）。
> 上面那張分層表的「狸貓版實作票開 MT」**已作廢**。
>
> **轉換期還會看到新的 MT 票**——2026-09-16 當天 MT 仍有 `MT-3209`～`MT-3218`
> （含 `mac` / `windows` label，reporter 是團隊其他人）。那是**尚未轉換完的殘留**，
> 不是規則有例外：看到別人開 MT 不用糾正，但**自己不要跟著開**。
> 既有 MT 單留在原地，不搬。
>
> **翻案條件**：Jay 說要改回。

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

### `Project` 欄位的值與 bug 狀態（2026-09-11 實測，242 張未完成的 VB bug）

`customfield_12435` 實際出現過的值，以及各自的量：

```
110 Manager    59 myViewBoard   22 (未填)    20 AirSync   11 Quiz Tool
  6 Finch       5 Hub            4 VS Account  3 vLauncher  2 Data-ECP
```

兩件事值得記：**它是多選**（一張票可能掛兩個產品），而且**約 9% 沒填**——
做任何以產品分群的統計都要先決定這兩者怎麼處理，不然那 22 張會從報表上消失。

**VB 沒有「平台」維度。** VSFT 的 `Platform` 分得出 mVB Windows / mVB Flutter /
CS Windows / CS Android，VB 只有一個 `myViewBoard`。想照平台切要另外想辦法。

bug 的狀態（**不要沿用 VSFT 的拼法**，逐字不同）：

| VSFT | VB |
|---|---|
| `Open` | **不存在** |
| `In Progress` | `進行中`（中文） |
| `STAGE READY (READY FOR QA)` | `STAGE READY(READY FOR QA)`（括號前**沒有空格**） |
| `PENDING` | `Pending` |

VB 實際查到的全部：`BACKLOG`、`待辦事項`、`READY FOR DEV`、`DISCOVERY/REFINEMENT`、
`進行中`、`IN CODE REVIEW`、`PR MERGED`、`STAGE READY(READY FOR QA)`、`TRACKING BY QA`、
`VERIFYING`、`QA REJECT`、`PRODUCTION READY`、`Pending`、`Blocked`。

km web 的「VB Bug 總覽」就是靠這份表分組（`web/lib/vbBugsRules.ts`），
碰到沒歸類的狀態它會在頁面上示警，不會靜靜吞掉。

### 用 REST API 查 VB（不經 MCP）

`.env` 的 `ATLASSIAN_API_TOKEN` **加** `ATLASSIAN_EMAIL` 兩個都要 ——
token 不自帶身分，Basic auth 的帳號欄位就是 email。實測 `Bearer <token>` 回 403、
拿 token 當帳號回 401。**最麻煩的是未認證時 Jira 回「0 筆」而不是 401**，
看起來像沒資料，所以查詢前先打一次 `/rest/api/3/myself` 驗身分。
現成的做法見 `scripts/vb-bugs.py`。

---

### ⚠️ `Acceptance Criteria` 不能在建立時一起填

`customfield_12203`（textarea）在 `jira_create_issue` 的 `additional_fields` 裡帶字串會讓
**整張單建不出來**，錯誤訊息是「欄位值不是有效的 Atlassian 文件格式 (ADF) 內容」
（2026-09-14 實測，VB-2213）。改成 ADF 物件也沒用 —— `jira_update_issue` 那邊反而會回
「作業值必須是字串」，兩支工具對同一個欄位期待相反。

**可行的順序**：先建單（不含 AC）→ 再用 `jira_update_issue` 把 AC 當**純字串**送，
換行用 `\n`。這樣會成功。

**徵兆**：建單失敗但錯誤訊息完全沒提是哪個欄位 —— 先把自訂 textarea 欄位拿掉再試一次，
不要從必填欄位那邊找。

## 開完之後

1. **回頭 verify 一次欄位**（尤其 Team），用 `jira_get_issue` 讀回來看，不要相信建立時的回傳。
2. 有相關單就建連結（`jira_create_issue_link`，`Relates`）。
3. **VSFT 沒有刪除權限**——開錯專案時只能留作廢留言＋轉 CLOSED，並記得清掉舊單的 issue link
   與其他地方（PR 描述、其他單的留言）的引用。
