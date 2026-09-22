# 跨 repo 工作規則

這個 workspace 同時操作 **km repo（本 repo，私人）** 與 **專案 repo**
（`Orgs/Viewsonic-EDU/*`，團隊共用）。以下規則來自實際踩到的問題。

---

## 0. 動專案 repo 的檔案前，先叫該 repo 的 skill

**專案 repo 的 `.claude/rules/` 與 `CLAUDE.md` 不會跨 repo 自動載入。** 在 km 工作時
它們完全不在 context 裡 —— 不會有任何提示，只會安靜地照 km 的規則做事（已多次發生）。

所以要對任何專案 repo 做事（**改檔、review、commit 都算**）之前：

1. **先呼叫對應的 repo skill**，例如 `mvbf`（= `edu-droid-flutter`）、`mvbf-commit`；
   `cs`（= `ragdoll-cat`，ClassSwift Android，＋ `cs-review`）；`olfparser`（＋ `-review` / `-commit` /
   `-verify`）。skill 裡有該 repo 的個人層慣例，
   以及「該讀哪些團隊 rules」的清單。
   > 動到 **OLF 檔案格式語意**時（不限 repo，mvbf 也算）另外叫 `olf-vnext`。
2. **沒有該 repo 的 skill 時**，自己做最小版本：
   ```bash
   ls <repo>/.claude/rules/ && cat <repo>/CLAUDE.md 2>/dev/null
   ```
   讀完與本次任務相關的再動手；順手把學到的東西補成新的 skill。

> skill 只放**個人層**補充與編排步驟，**不要複製團隊 rules 的內容**進 km ——
> 那些檔由團隊維護、會變，複製一份就會漂移而且不會被發現。

---

## 1. 專案 repo 的程式碼**禁止**引用 km repo 的檔案路徑

**km repo 是 Jay 個人使用的知識庫，不是團隊共用資產。** 團隊成員 clone 專案 repo 後
開不了這些路徑，對他們而言就是死連結。

### ❌ 錯誤

```dart
/// 詳見 `docs/features/mvbf-data-tracking/open-questions.md#Q17`。
/// 這是後端結構限制（詳見 `docs/features/.../user-properties-sources.md` §4）。
```

### ✅ 正確

**把結論寫進註解本身，指標指向團隊開得了的地方**（Jira ticket、Confluence 頁面、
同 repo 內的檔案）：

```dart
/// 包含暫停後再按 Play 的續跑（是否該計入待 spec owner 確認，VSFT-9941）。
/// 這是後端結構限制（VSFT-8368 調查結論）。
```

### 適用範圍

- 專案 repo 的**所有**檔案：原始碼註解、README、PR 描述、commit message、Jira 留言
- km repo 內部互相引用不受限制
- km repo 引用專案 repo 的 `檔案:行號` **可以**（方向相反，是本機查證紀錄）

### 檢查方式

送 PR 前對專案 repo 跑：

```bash
grep -rn "docs/features/\|docs/domains/\|docs/repositories/" lib/ test/
```

### 由來

VSFT-9941 的 PR #237 被 reviewer 抓到三處新引用；追查後發現 VSFT-8368 還留了三處，
一併清掉。當時誤判成「既有慣例，不該由這張 PR 改」—— 但既有慣例本身就是錯的。

---

## 2. 動專案 repo 的程式碼前，先確認在哪條分支

各 repo 的分支狀態是**獨立且會變動**的：km 常態待在 `master`，專案 repo 可能停在
上一張票的 feature branch，也可能剛被切回 `master`。

**每次要開始改專案 repo 的程式碼前，先跑 `git branch --show-current`。**

特別容易出錯的時機：

- 交付完一張票、切回 `master` 之後，又回頭處理同一張票的 review 意見
- 使用者中途插話換任務，注意力從「在哪個 repo、哪條分支」移開
- 連續操作兩個 repo，把 A repo 的分支狀態誤記成 B repo 的

若已經誤改在 `master`：`git checkout -- <file>` 還原，切到正確分支後重做。
**不要**用 `git stash` 搬移 —— 使用者自己的 WIP 可能也在 stash 裡，容易混淆。

### 由來

VSFT-9941 交付完切回 `master`，接著處理 PR review 時忘了切回 feature branch，
在 `master` 上改了 `participate_mode_screen.dart`（由使用者發現）。
當下幾個字串比對失敗其實就是徵兆 —— `master` 沒有該票的 commit，所以對不上。
**比對失敗時先懷疑「是不是在錯的分支」，而不是急著調整比對字串。**

### 「在對的分支」還不夠，分支的**基底**也要夠新

對的分支若切在幾十個 commit 前的 `master` 上，讀到的是**過去的程式碼**。
在上面做的分析、修改、測試全都成立，只是描述的不是會出貨的那份 —— 而且
`git status` 乾淨、測試全綠、analyze 沒告警，**沒有任何一個訊號會提醒你**。

**開新分支前，以及回頭接續一條舊分支前，先跑：**

```bash
git -C <repo> fetch origin <base>
git -C <repo> rev-list --count HEAD..origin/<base>   # 0 才安全
```

不是 0 就先 rebase／重開分支，再開始讀程式碼。**順序很重要**：先 rebase 再分析，
不要分析完才發現要 rebase —— 那時已經照舊程式碼寫完，沉沒成本會誘使你「解衝突就好」，
而**照舊的那邊解衝突會把新的改動靜默改回去**。

**徵兆**（任一個出現就先去量落後幾個 commit）：

- 單子描述的症狀，在程式碼裡看起來「還沒修」，但票是幾天前開的
- 想改的函式，signature 或呼叫端跟票裡寫的不一樣
- 打算「順手修掉」一整批呼叫端 —— 批量往往代表那批早就被集中重構過了

### 由來（基底那條）

VB-2193（mvbf PR #276）：分支切在 29 個 commit 前的 `master`，我在
`incoming_document_handler.dart` 重寫了一個 **master 上早就修好、而且修得更完整**
的函式。reviewer 指出照我那邊解衝突會把 Android / iOS / macOS 的 IWB 開檔路徑
從 olfparser FFI 退回舊的 Dart ZIP/XML parser，還原邏輯也比 master 的不安全
（我刪 `currentDocument`，master 抓住當初新增的那個物件再用 `contains` 守衛）。
最後整份還原成 master、只留另一個檔的修正。

當時的徵兆我全部看到了卻沒解讀：單子寫的三個症狀在程式碼裡都「還沒修」，
而且我以為自己「順帶修掉 6 個呼叫端」—— 那 6 個其實早就改走別的函式了。

---

## 3. Commit 規範跟著「你正在 commit 的那個 repo」走

**每個 repo 有自己的 commit 慣例，不會共用。** 最常犯的錯是把本 km repo 的 gitmoji
格式套到專案 repo 上。

| Repo | 格式 | 規範位置 |
|---|---|---|
| 本 km repo | `<gitmoji> <type>: <繁體中文簡述>` | [`gitmoji-zh-tw.md`](gitmoji-zh-tw.md) |
| `edu-droid-flutter`（mvbf） | `[Type] 標題` + `What:` / `Why:` / `How:` / `Changes:`，**無 gitmoji** | 該 repo 的 `.claude/rules/commit-format.md` |
| 其他專案 repo | 先找該 repo 的 `.claude/rules/` 或 `CLAUDE.md` | 同上 |

### 動手前的固定動作

要對任何**專案 repo** 下 commit 之前：

1. `ls <repo>/.claude/rules/` 看有沒有 commit 相關規範，有就讀完再寫
2. 沒有規範檔就 `git log -5 --format='%s%n%b%n---'` 看既有 commit 長什麼樣，照著寫
3. **不要**預設套用 km 的 gitmoji

### 容易連帶弄錯的細節

- **type 標記**：mvbf 用 `[Task VSFT-x]` / `[BUG VSFT-x]` / `[User Story VSFT-x]`，
  要對照 Jira 的 issue type 挑，不是隨便選一個
- **一個 commit 動到多張票**：mvbf 要求所有 VSFT key 都列在 subject
  （例：`[User Story VSFT-9941][VSFT-8368] ...`）
- **`Co-Authored-By`**：看該 repo 既有 commit 有沒有這個慣例（mvbf 有），
  不確定就 `git log --format='%b' -80 | grep -c 'Co-Authored-By'` 數一下

### 由來

反覆發生：對專案 repo commit 時套用 km 的 gitmoji 格式。根因是 km 的
`gitmoji-zh-tw.md` 與 `CLAUDE.md` 原本把規則寫得像全域適用、沒有標範圍，
現已在兩處加上「僅限本 repo」的但書。

---

## 4. 未 commit 的東西不要留在 session 綁的 worktree 裡

`.claude/worktrees/<name>` 底下的 worktree 是**跟著 session 走**的：session 結束時會被
問要保留還是移除，被移除就整個目錄消失。**分支 ref 會留下，工作區的未 commit 改動不會。**

### 由來

2026-09-11：在 `.claude/worktrees/` 的 worktree 裡改好 mvbf 的 `dev-deliver.md`、
還沒 commit 就換任務。下一段 session 回頭要給 Jay 看時，目錄已不存在；
分支 `Jay/dev-deliver-no-hardcoded-transition-ids` 還在，但停在 `origin/master`、
零 commit —— 改動整份重做。同一輪交付的另一條分支因為已經 commit + push，毫髮無傷。

### 做法

| 情境 | 放哪 |
|---|---|
| 一次做完、當場 commit + push | `.claude/worktrees/`（用完即丟，正是它的用途） |
| 要跨 session、或要請 Jay 先看過才送 | **同層目錄**：`<repo>-<topic>`，例如 `edu-droid-flutter-dev-deliver` |

同層那種用 `git worktree add` 手動建，不會被 session 清掉。Jay 自己既有的
`edu-droid-flutter-vsft-6310` 就是這個放法，跟著它做即可。

⚠️ `git -C <repo> worktree add ./<name>` 的**相對路徑是相對於 `-C` 的目標**，
會建在 repo 裡面而不是同層（踩過）。用絕對路徑，或建完 `git worktree move` 搬走。

### 徵兆

「我記得改過這個檔，但 `git status` 是乾淨的」「分支在，但 `git log` 沒有我的 commit」
—— 先想這條，不要懷疑自己記錯。

