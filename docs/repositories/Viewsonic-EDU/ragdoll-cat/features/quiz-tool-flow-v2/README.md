# Quiz Tool 啟動流程改版（`feature/quiz-tool-flow-v2`）

ragdoll-cat（ClassSwift Android）上一條長期 feature branch 的全覽。
Lydia、Jacky、Jay 三人共同開發與 review，**尚未合併回 develop**。

## 入口

| 檔案 | 內容 |
|---|---|
| [`overview.html`](overview.html) | 流程改版前後、六張票的分工、架構增刪、PR 一覽、待決事項、**在這條分支上工作的注意事項** |
| [`defects.html`](defects.html) | review 期間抓到的缺陷（含「為什麼沒被擋下來」）、測試自身的五種假綠、可帶走的判準 |
| [`verify.html`](verify.html) | **實機驗證清單** —— 52 項，含操作步驟／期望結果／陷阱；勾選存 localStorage，可一鍵清空 |
| [`jira/`](jira/) | 八張票的本機 clone，**含留言** —— Android 線五張（10065 / 10067 / 10069 / 10047 / 10049）＋ **Windows 線三張**（10064 / 10066 / 10068，皆已 STAGE READY，可作行為對照） |
| [`confluence/myViewboar/`](confluence/myViewboar/) | spec 總覽 ＋ 子頁 2／3／4 的本機 clone |

用瀏覽器開 `overview.html`。

**票與 spec 都在本機** —— 查證 AC、決策編號、未決問題不必連 Jira / Confluence，
也不需要動用 MCP。票的 clone **含留言**：這條線上不少決策的唯一落點是留言而不是票面
（`13` 的缺陷分析、實機驗證紀錄、PM 裁決）。重新抓取：

```bash
python3 scripts/clone-atlassian.py jira docs/.../quiz-tool-flow-v2/jira VSFT-10065 VSFT-10067 …
python3 scripts/clone-atlassian.py conf docs/.../quiz-tool-flow-v2/confluence/myViewboar 606797937 …
```

> clone 是鏡像，**不要直接改內容**；本機結論寫在 `defects.html` 或 `overview.html`。
> 重抓前先 `git diff` 確認沒有未上游的補充，並同步更新各檔的 `cloned_version` / `cloned_at`。

## 一句話

出題流程從「截圖 → Setting 頁 → 派題」改成
**「截圖（含設定）→ pre-start 作答窗 → Start question 才派題」**。
六個 MVB Setting 頁全部消失，設定搬進截圖遮罩上的 Question Panel。

## 這份文件的角度

**不分誰做的。** 這條分支上多數缺陷的形式是
「A 改了流程 → B 的模組在它底下失效 → C 在 review 抓到」，
記錄的是缺陷的形狀與修法，不是責任歸屬。

`defects.html` 每則都寫了「**為什麼沒被擋下來**」—— 每一個缺陷都通過了編譯、
通過了當時的測試、通過了至少一次 review 才留下來，那部分才是後來的人用得上的。

## 文件基準

| | |
|---|---|
| 分支 tip | `004c7300` — `fix[VSFT-10067]: release the capture session at the window a capture now opens`（2026-09-03 09:12） |
| 基準點 | `a9438387`（撰寫當下的 `origin/develop` tip） |
| 當時規模 | 194 commits · 417 檔 · +29,320 −10,618 |

檢查落後多少：

```bash
git fetch origin
git log --oneline 004c7300..origin/feature/quiz-tool-flow-v2
```

> ⚠️ 這條分支**被 force-push 過**。若上面噴 `unknown revision`，代表 `004c7300`
> 已被 rebase 掉、歷史整條重寫，改用 `--since=2026-09-03` 並重新核對 overview §1 的規模數字。

**維護規則：任何一次在更新的 base 上修改這些文件，就一併換掉上表的戳記**
（三個檔案都有：`README.md`、`overview.html`、`defects.html`）。只改內容不換戳記，
等於讓下一個人拿舊 SHA 去比對新內容 —— 比沒有戳記更糟。
若只是換戳記、內容未重新查證，commit message 要講明白。

```bash
git rev-parse --short origin/feature/quiz-tool-flow-v2
git rev-list --count $(git merge-base origin/develop origin/feature/quiz-tool-flow-v2)..origin/feature/quiz-tool-flow-v2
git diff --shortstat $(git merge-base origin/develop origin/feature/quiz-tool-flow-v2)..origin/feature/quiz-tool-flow-v2
```

## 現況（截至上述基準）

- 18 支 PR，17 merged、1 open（#1144 繪圖題編輯窗刪除）
- **CI gate 從未在這條分支跑過** —— `ci.yml` 只涵蓋 `develop` 與 `release/**`
- Windows 線的對應票（VSFT-10064 / 10066 / 10068）已 STAGE READY，可作行為對照 ——
  `VSFT-10066` 與 `VSFT-10067` 的驗收條件**逐字相同**，所以那邊是同一份 AC 的已完成實作。
  但票面相同不代表實作路徑相同（10066 通篇沒提繪圖題），**當 AC 對照可以，當實作解法的依據不行**

## 相關

- 需求 spec：Confluence「Quiz Tool 啟動流程改版」子頁 2（截圖遮罩）／3（出題與派送）／4（作答頁）
- repo 內測試策略：`docs/testing-strategy/features/` 下的 `mvb-quiz-mask.md`、
  `pre-start-empty-state.md`、`pre-start-discard.md` 等
- IPC 契約：該 repo 的 `docs/mvb-ipc-spec.md`
