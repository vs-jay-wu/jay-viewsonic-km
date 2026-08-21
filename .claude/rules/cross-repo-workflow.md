# 跨 repo 工作規則

這個 workspace 同時操作 **km repo（本 repo，私人）** 與 **專案 repo**
（`Orgs/Viewsonic-EDU/*`，團隊共用）。以下規則來自實際踩到的問題。

---

## 0. 動專案 repo 的檔案前，先叫該 repo 的 skill

**專案 repo 的 `.claude/rules/` 與 `CLAUDE.md` 不會跨 repo 自動載入。** 在 km 工作時
它們完全不在 context 裡 —— 不會有任何提示，只會安靜地照 km 的規則做事（已多次發生）。

所以要對任何專案 repo 做事（**改檔、review、commit 都算**）之前：

1. **先呼叫對應的 repo skill**，例如 `mvbf`（= `edu-droid-flutter`）、`mvbf-commit`。
   skill 裡有該 repo 的個人層慣例，以及「該讀哪些團隊 rules」的清單。
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
