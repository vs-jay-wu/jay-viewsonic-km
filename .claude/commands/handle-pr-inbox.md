列出「球在我這裡」的 GitHub PR，逐筆判斷並處理。

收件匣的意思是「等我處理的」，不是「我開的」—— 作者多半是別人。

## 說明

腳本 `scripts/handle-pr-inbox.sh` 負責**找出**待處理的 PR，你負責**處理**。

範圍不是 org 底下所有 repo（那有上百筆不干我的），而是兩個來源的聯集：

1. **我負責的 repo 底下所有開著的 PR** —— 不需要被指派，我就該看
2. GitHub 認定與我有關的關係：`review-requested` / `reviewed-by` / `mentions` / `assignee`
   （＋ `--include-mine` 時加上 `author`），用來涵蓋負責清單以外的 repo

負責的 repo 清單在 `local.workspace.json` 的 `.prReview.repos`。
所有查詢都帶 `is:open`，已 merge／已關閉的 PR 不會進來。

判斷邏輯（比較「我最後一次動作」與「別人最後一次動作」）：

| 分級 | 情境 |
|---|---|
| 高 | 我動過之後又有新 commit／新留言 —— 球明確回到我手上 |
| 中 | 我還沒 review 過（不論有沒有被指派）；或我的 PR 還有未解決討論 |
| 低 | 仍掛在我名下但無新活動；或只是被 mention／assign |

已自動略過：我自己開的 PR（`--include-mine` 可納入）、draft、我動作後無任何新活動。

## 範例

- `/handle-pr-inbox` → 只列待處理並開始處理
- `/handle-pr-inbox --include-mine` → 一併檢查我自己的 PR 有沒有人留意見待回
- `/handle-pr-inbox --all` → 連略過的也列出（附略過原因，用來檢查判斷有沒有漏）
- `/handle-pr-inbox --repo ragdoll-cat` → 只看單一 repo
- `/handle-pr-inbox --json` → 只要資料、先不處理

## 執行

```bash
./scripts/handle-pr-inbox.sh ${ARGUMENTS:---json}
```

## 拿到清單之後

### 0. 這個 command 只需要 Jay 確認一件事

**清單超過 3 筆時，問要處理哪幾筆。** 除此之外整條流程自己跑完 ——
包含**張貼留言，不需要再問**（Jay 2026-09-10 明確授權，適用範圍僅限這個 command）。

仍然不自動做的：`git commit`、修改任何專案 repo 的程式碼、送出 approve /
request changes（`gh pr review`）。這三件要另外問。

### 1. 先報清單

把待處理清單（含分級與理由）列給 Jay 看。超過 3 筆就問要處理哪幾筆，不要一口氣全做。

### 2. 每一筆都交給 `scripts/review-pr.sh`，不要自己讀 diff

```bash
./scripts/review-pr.sh <owner/repo> <number> --save-body /tmp/pr-<n>.md
./scripts/review-pr.sh <owner/repo> <number> --role author --save-body /tmp/pr-<n>.md
```

**一定要帶 `--save-body`。** 暫存目錄跑完就刪，不存的話草稿只剩終端輸出，
要貼還得反解。多筆可以同時在背景跑。

它會開一個**拋棄式、無寫入能力**的 claude 子程序去讀 diff：

- `--restricted --tools "Read,Grep,Glob"` —— Bash / Edit / Write **根本不存在**，
  不是靠 allowlist 擋。（`Bash(gh:*)` 這種寫法不是安全邊界：`gh api -X PATCH` 能改任何
  repo、`gh repo clone` 會寫本地、`gh extension install` 直接執行程式碼。）
- PR 的 diff 與既有留言由腳本預先抓好放進暫存目錄，子程序不需要網路工具。
- `--no-session-persistence` ＋ 收尾 `rm -f`，對話不留在本機。
- 子程序**貼不了留言**，只輸出 JSON；要不要貼由腳本決定。

**為什麼不自己讀 diff**：幾千行 diff 進到你的 context 之後，後面幾筆 PR 的判斷品質會下降。
讓它待在拋棄式子程序裡，你只收摘要與草稿。

repo → 該讀哪些 km skill 的對應已寫在腳本裡（`ragdoll-cat`→`cs`/`cs-review`，
`edu-droid-flutter`→`mvbf`/`mvbf-review`），子程序會自己 Read。
**你自己**若要動任何專案 repo 的檔案，仍要照 `cross-repo-workflow.md` §0 先叫該 repo 的 skill。

### 3. 先驗 finding，再貼

**不要用 `--post`。** 它會重跑一次子程序（無狀態），貼出去的東西不保證是你驗過的那份。
驗完之後貼 `--save-body` 存下來的檔案：

```bash
gh pr comment <n> --repo <owner/repo> --body-file /tmp/pr-<n>.md
```

貼之前自己 grep 一次（`review-pr.sh` 只在 `--post` 路徑上守門，手動貼沒有）：

```bash
grep -nE 'jay-viewsonic-km|docs/(features|domains|repositories)/|\.claude/(rules|skills)/|/Users/[a-z.]+/|/private/tmp|scratchpad' /tmp/pr-<n>.md
```

有命中就改掉再貼 —— 團隊開不了那些路徑（`cross-repo-workflow.md` §1）。
另外在結尾補一行說明這是 Claude 產的草稿、由 Jay 送出。

### 4. 結果要驗，不要照抄

子程序給的 finding **是待驗證的宣稱，不是結論**：

- 每條 finding 追到 diff 或程式碼確認一次，特別是標 MUST 的。
- 「安全性」類的直覺主張最容易錯 —— 問「洩漏給誰」「對方本來就知道嗎」
  「這條路前面有沒有守衛」。
- 驗不過的就**直接改掉存下來的草稿檔**再貼，並在回報裡說明改了什麼。
- 算式與數字要自己重算一次。實際踩過：子程序寫 `78.33 / 33 = 2.70`（正解 2.37，
  2.70 是另一個模組數的值）。結論沒錯，但照貼會被 reviewer 一眼抓到，
  整段反駁的可信度跟著垮。
- 子程序若**推翻了 reviewer 的意見**，那條一定要驗到底才貼 —— 說別人錯而自己錯，代價最高。

### 5. 回報

```
待處理 N 筆（掃描範圍：<repos>）
已貼：
  <repo>#<n>  verdict=<x>  <一句話>  （驗證結果／我改了什麼）  <留言連結>
未處理：
  <repo>#<n>  <理由>
```

**不要自動 commit。** 貼留言不用問，commit 要問。

---

## 排程執行（不用手動叫）

`scripts/pr-inbox-watch.sh` 會定期做**偵測**（就是上面那支 `--json`，不用 AI、不花錢），
只有真的有待處理的 PR 才啟動 `claude -p /handle-pr-inbox`。

- 開關排程：km web 的「PR 巡邏」頁（排程掛在 web server 裡，設定存
  `data/local-state/pr-inbox-watch.json`）。要讓 web 常駐：`./scripts/setup-km-web.sh --install`
- 執行紀錄與花費：`data/pr-inbox-runs/`（gitignored），web 的「PR 巡邏」頁可看可刪
- **AI 執行期間會上鎖**，排程碰到鎖直接跳過 —— 同一批 PR 不會被 review 兩次
- 排程啟動的那個 claude 會多收到一段系統提示：非互動、不要提問、超過 3 筆自己挑
  優先度最高的 3 筆
