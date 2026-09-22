# mvbf — 交付與 Jira 狀態

**先讀 [`SKILL.md`](SKILL.md)**（步驟 0–2、註解標準、引號）。這裡只放「真的在做這件事時才需要」的部分，從 SKILL.md 拆出來的，內容未改。

> 什麼時候讀：照抄 transition id 把票**關掉**了／`jira_assign_sprint.sh` 印 ✅ 但票進了已經結束的 sprint／`jira_get_transitions` 拿不到 `to`

---

## `/dev-deliver`：Jira transition 要用「目標狀態」挑，不能照抄 id 或名稱

`dev-deliver` 是 **mvbf repo 自己的 command**（`.claude/commands/dev-deliver.md`），
km 沒有同名 skill。它原本把 transition id 寫死（`progressing`(19)、`task done`(8)）。

### 跑這個流程時，另外兩個 skill 也要叫

command 本身不會提醒，但這兩步都踩過坑：

| 時機 | 先叫 |
|---|---|
| Phase 1 開分支前 | 確認基底夠新 —— `cross-repo-workflow.md` §2 的「分支的**基底**也要夠新」 |
| Phase 6／7 寫 PR 描述與 Jira 留言 | `handoff-docs` —— 它 §6 就寫了 `jira_add_comment` 的**回傳值是有損的**，不要據此重貼 |

VB-2193 那輪沒叫 `handoff-docs`，看到 Jira 回傳值裡底線變成 `*` 就連改三次留言，
實際儲存的 ADF 從頭到尾是好的（用 `responseContentFormat: "adf"` 讀回來確認）。

### 唯一該記的判準

**挑 `to.name` 等於目標狀態名稱的那條**（要「進行中」就挑 `to.name == "進行中"`，
要 code review 就挑 `to.name == "IN CODE REVIEW"`）。

三個都不可以當判準：

| 不要用 | 為什麼 |
|---|---|
| **id** | 每張票都可能不同，而且照填不會失敗，會**成功地做錯事** |
| **transition 名稱** | 同一個目標狀態，不同 workflow 的 transition 叫法不同 |
| **`statusCategory`** | 幾乎所有工作中的狀態其 category 都是「進行中」，篩了等於沒篩 |

### ⚠️ 粒度是「每張票的 workflow」，不是「每個專案」

這點我記錯過一次：2026-09-10 寫成「依專案而異」，隔天被 reviewer 用實查推翻。
**同一個 Jira 專案內，不同 issue type 走不同 workflow，id 就已經對不起來**
（2026-09-11 實查 VB 的故事 vs 漏洞：同一個 id 在兩邊是相反方向的動作）。

所以**任何「某某專案的 X 是 id N」的句型都不成立**，包括我自己寫過的。這裡刻意不列
任何 id 對照表——列了就會被下一個人照抄，而那正是這條要防的事。

### ⚠️ 工具選擇：預設那支拿不到 `to`

`jira_get_transitions` **只回 `id` 與 `name`，沒有 `to`** —— 用它無法執行上面的判準。
要拿目標狀態得用 `getTransitionsForJiraIssue`（可加 `includeUnavailableTransitions=true`）。
照新判準做卻沿用舊工具會直接卡住，這點很容易漏，因為兩支工具名字很像。

### 清單會隨「單子當下的狀態」變動

每個 transition 前都要**重查**，Phase 1 查到的結果在 Phase 7 不適用。
`includeUnavailableTransitions=true` 可以看到全集，用來確認「是真的沒有這條」
還是「只是現在還不能走」。

### 已知的兩個沉默陷阱（現況，非永久事實）

- **`19` 在 VB 是 `Closed`**（故事與漏洞 workflow 都是），在 VSFT 卻是 `progressing`。
  照舊值填會直接把票關掉，API 回報成功。
- **VSFT 的 `Code reviewed` 通往 `PR MERGED`**，不是 code review 中；PR 還沒合就按會跳錯狀態。
  （另見 memory 的 `vsft-bug-workflow-states.md`。）

> ⚠️ **VB / VSFT 的分工目前本身就是混亂的，Jay 表示之後會整理**（2026-09-11 當場說明）。
> 上面兩條是當天實查的現況，不是穩定契約 —— 看到與實際不符時，**相信現查的結果**，
> 並回頭把這段改掉。

### ⚠️ `scripts/jira_assign_sprint.sh` 的 board 預設值還停在 VSFT 時代

Phase 1 最後一步 `bash scripts/jira_assign_sprint.sh {ISSUE_KEY}` 會**回報成功**，
但可能把票放進**錯的 sprint**：腳本裡 `BOARD_ID="360"` 是寫死的，那是 VSFT 的 board。
VB 用的是 **board 1754**，sprint 名為 `VB Sprint N`（不帶隊名）。

**徵兆**：它印出的 sprint 名字**帶隊名**（例如 `星期六浩克-sprint 27`），而且 `End:`
的日期**已經過去了** —— 但它照樣印 `✅ Successfully moved`。

2026-09-17（VB-2267）實際踩到：票被放進 board 360 一個 2026-09-07 就結束的 sprint。

**現在怎麼做**（腳本本身有旗標，不必改檔）：

```bash
bash scripts/jira_assign_sprint.sh <KEY> --board-id 1754 --sprint-prefix "VB Sprint" --dry-run
bash scripts/jira_assign_sprint.sh <KEY> --board-id 1754 --sprint-prefix "VB Sprint"
```

**查證放對了沒 —— 不要只看腳本的成功訊息。** 先看大家在哪個 sprint：

```
jira_search: project = VB AND sprint is not EMPTY AND updated >= -14d
             fields: key,customfield_10020    use_display_names: true
```

再 `jira_get_issue` 讀回自己那張，確認「衝刺」欄**只剩**新的那個
（重跑是取代、不是並存 —— 已實測）。

> 腳本要讀 repo 根的 `config.json`（gitignored，含 Jira 憑證）。新開的 worktree 沒有這個檔，
> 會停在 `❌ Jira URL not found`；從主 checkout 複製一份即可。

**這條應該上游到 `edu-droid-flutter`**：把預設值改成 VB 的 board，或讓腳本依 issue key 的
專案前綴自動選 board（別再寫死）。**待與 Jay 確認後交給其他 agent 處理** ——
在那之前，跑 dev-deliver 時自己補上面那兩個旗標。

### 由來

- **VSFT-6704**（漏洞）：Phase 7 的 id 8 在「開放」狀態查不到，差點誤用 `Code reviewed`(16)。
- **VB-1945**（故事）：照 command 填 Phase 1 的 19 會把票關掉。
- **mvbf PR #268**：修 `dev-deliver.md`。第一版只把寫死的 *id* 換成寫死的**名稱**
  （`progressing`），被 reviewer 指為「同一個坑換個外衣」——因為 VB 的漏洞 workflow
  裡根本沒有叫 `progressing` 的 transition，會讓 Phase 1 直接中斷。第二版才改成比對
  `to.name`。**教訓：把一個寫死的東西換成另一個寫死的東西，不算修好。**

---
