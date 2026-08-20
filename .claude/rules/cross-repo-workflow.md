# 跨 repo 工作規則

這個 workspace 同時操作 **km repo（本 repo，私人）** 與 **專案 repo**
（`Orgs/Viewsonic-EDU/*`，團隊共用）。以下規則來自實際踩到的問題。

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
