---
name: retro
description: "Use when the user wants this session's lessons written down — a reviewer's PR comment, a correction from the user, a trap that cost time, a convention discovered the hard way. Routes each lesson to the right home (km rules / km skills / memory / docs) and writes it as a reusable 判準, not a diary entry. Examples: \"把這次學到的記下來\", \"reviewer 提的這幾點寫進 km\", \"retro\", \"這個坑要記起來\""
---

# 把這次 session 學到的東西記下來

**目標不是「記錄發生過什麼」，是「下次同型情境不會再犯」。**
一條記錄只有在**未來的我／未來的 agent 讀到它會改變行為**時才值得寫。

⚠️ 全程**不要 commit**（見 memory `no-auto-commit`）。做完停在工作區、回報清單，等 Jay review。

---

## 0. 先盤點素材，不要邊想邊寫

從這次 session 掃出候選，**每條先寫成一行**，全部列完再決定去哪。來源優先序：

1. **Jay 的糾正** —— 最高價值。原話要留（措辭本身常是判準）。
2. **Reviewer / 其他 agent 的意見** —— ⚠️ 見 §1，**先查證再記**。
3. **我自己踩到、但沒人抓到的** —— 通常是「回頭看才知道當時的徵兆是什麼」那種，
   徵兆要一起寫（例：字串比對失敗其實是「在錯的分支」的徵兆）。
4. **查證過程中發現「原本以為的不成立」** —— 推翻掉的舊說法要一併處理（見 §5）。
5. **花掉時間的環境／工具坑** —— 指令、旗標、平台差異。

**候選不成立的（直接丟掉，不要為了湊數而記）：**

| 型態 | 為什麼不記 |
|---|---|
| 只在這張票／這次任務成立 | 下次讀到只會誤導 |
| repo 裡已經有的（CLAUDE.md、團隊 rules、程式碼本身） | 複製一份就會漂移，而且不會被發現 |
| git history 查得到的（哪個 commit 改了什麼） | 去查就好 |
| 「這次做了 A、B、C」的流水帳 | 沒有判準就不是教訓 |

---

## 1. Reviewer 的意見不是事實，先查證再記

**照單全收會把別人的誤判寫成永久規則。** mvbf 那輪 5 條意見有 3 條需要修正或撤回。

動筆前對每一條問：

1. **診斷成立嗎？** 追到程式碼／實際輸出確認，不是讀懂他的說法就算。
2. **他提的修法成立嗎？** 「診斷對、修法錯」是常見組合 —— 兩者要分開驗。
3. **這條是通則還是這次的特例？** 只有通則才進 rules／skills；特例最多進該票的 docs。

查證不了的（例如需要對方環境）→ **記成 open question，標明未查證**，不要寫成規則。

Jay 的措辭同樣要過濾：說「所有 X 都要 Y」而我手上有反證時，先回頭確認再記，
並標明「這是當場裁定的工作規則，不是查證過的組織政策」＋翻案條件
（詳見 `.claude/rules/cross-system-claims.md` §1）。

---

## 2. 決定寫到哪 —— 四個落點

**先 grep 有沒有相近的既有條目**，有就**補進去**，不要開新檔：

```bash
cd /Users/jay.wj.wu/ProjectsWork_GitHub/jay-viewsonic-km
grep -rn "<關鍵字>" .claude/rules/ .claude/skills/ docs/
grep -rn "<關鍵字>" ~/.claude/projects/-Users-jay-wj-wu-ProjectsWork-GitHub-jay-viewsonic-km/memory/
```

同一件事散在兩處＝兩處會各自漂移。

| 教訓的性質 | 落點 |
|---|---|
| **跨 repo 的工作方式**（怎麼做事、怎麼查證、怎麼宣稱） | `.claude/rules/<topic>.md`，並在 `CLAUDE.md` 的規則表加一列 |
| **某個 repo／工具特有的慣例與陷阱** | `.claude/skills/<alias>/SKILL.md`（review 類的放 `<alias>-review`，commit 類放 `<alias>-commit`） |
| **一句話的事實、偏好、映射、任務狀態** | memory 目錄一檔一事實 ＋ `MEMORY.md` 加一行指標 |
| **領域／系統怎麼運作的知識** | `docs/`（三軸：`features` 需求／`repositories` 單一 repo／`domains` 技術領域，見 memory `km-docs-structure`） |

### 邊界容易搞混的兩組

- **rules vs skills**：問「不叫這個 skill 的時候也該遵守嗎？」
  是 → rules（會隨 CLAUDE.md 自動載入）；否 → skill。
- **skills vs 專案 repo**：**km 的 skill 只放個人層補充與編排步驟**，
  團隊 rules 的內容一律用「去讀 `<repo>/.claude/rules/xxx.md`」指過去，不要複製
  （見 `.claude/rules/cross-repo-workflow.md` §0）。

### 教訓屬於專案 repo 怎麼辦

若這條教訓其實該進**專案 repo 的**團隊 rules（別人也需要），**不要**自己去改那個 repo。
寫進 km 的 skill 並標註「這條應該上游到 `<repo>`，待與團隊確認」，由 Jay 決定。

---

## 3. 每條記錄的最小要件

不管落在哪，一條記錄要能回答三件事：

1. **判準** —— 下次遇到什麼情境、要怎麼做／不要怎麼做。寫成可執行的動作，
   有指令就附指令。
2. **由來** —— 實際踩到的那次，具體到可辨識（票號、PR 編號、檔名、對方的原話）。
   *沒有由來的規則會在幾個月後被自己推翻，因為想不起來為什麼。*
3. **證據等級** —— **實測過**（附指令與逐字輸出）／**讀碼看到**（附檔案與行）／**推論**。
   推論級不要寫成事實，要標明（`.claude/rules/cross-system-claims.md` §2）。

**能附「徵兆」就附**：出事當下看到的第一個異常訊號是什麼。那才是下次能提早停下來的東西。

### 不要記會漂移的指標

`stash@{0}`、`HEAD~3`、「目前在 X 分支」、裸的 `檔案:行號` 一律不用 —— 壞掉時沒有錯誤訊息。
改法見 `.claude/rules/docs-feature-spec.md`「不要記會漂移的指標」（stash 記訊息、commit 記 SHA、
行號要連同那一行的內容一起貼）。

### memory 的格式

一檔一事實，frontmatter `type: user | feedback | project | reference`；
`feedback` / `project` 的內文要有 **Why:** 與 **How to apply:**；相對日期一律換成絕對日期；
相關條目用 `[[name]]` 互連。寫完**一定要**在 `MEMORY.md` 加一行 `- [標題](file.md) — 鉤子`
（只放指標，不放內容）。

---

## 4. 「使用者糾正」這一類要多記一層

被糾正時，記的不只是「以後要做 X」，還要記**當時我為什麼會做錯**。
根因通常是這幾種之一，而根因決定該補在哪：

| 根因 | 對策落點 |
|---|---|
| 規則寫得像全域適用、沒標範圍 | 回去在**原規則檔**加但書（不是另開一條） |
| 該讀的檔沒被載入（跨 repo 不會自動載入） | 補進「動手前的固定動作」清單 |
| 把 A 系統的慣例外推到 B | `cross-system-claims.md` §1 加一列對照 |
| 注意力轉移（換任務、換 repo）造成的狀態誤記 | 補一條「開始前先跑什麼指令確認」 |

實例：反覆把 km 的 gitmoji 套到專案 repo，根因是 km 的規則沒標範圍 ——
所以修法是回去兩個檔各加一段「僅限本 repo」，而不是新增一條「不要套 gitmoji」。

---

## 5. 改完之後：整份 grep 被推翻的說法

**半改比不改更糟** —— 讀的人會看到兩種說法，而且新的那段看起來像特例。

```bash
grep -rn "<被推翻的舊說法關鍵字>" .claude/ docs/ ~/.claude/projects/-Users-jay-wj-wu-ProjectsWork-GitHub-jay-viewsonic-km/memory/
```

搜尋根目錄要涵蓋全部落點（rules / skills / docs / memory / CLAUDE.md），
漏掃一個目錄就會留下自相矛盾的一半。

**發現舊記錄是錯的 → 刪掉或改掉，不要並存。** memory 尤其如此：
memory 反映的是「寫下當時為真」，過期的比沒有更危險。

---

## 6. 收尾回報

不 commit。回報成這個形狀，讓 Jay 一眼能 review：

```
新增：
  .claude/rules/xxx.md          <一句話：這條規則說什麼>
  memory/yyy.md (+MEMORY.md)    <一句話>
修改：
  .claude/skills/mvbf/SKILL.md  §3 新增一段 <一句話>
未記錄（附理由）：
  reviewer 的第 2 點            查證後不成立：<理由>
  「先切分支」                  已在 cross-repo-workflow.md §2，無新資訊
待確認：
  <這條該上游到專案 repo 的團隊 rules，還是留在 km？>
```

最後跑一次 `git status --porcelain`，確認動到的檔跟上面列的一致
（`??` 的新檔不會出現在 `git diff` 裡，容易漏報）。
