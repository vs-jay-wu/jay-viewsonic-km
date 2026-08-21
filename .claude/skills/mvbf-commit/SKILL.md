---
name: mvbf-commit
description: "Use when committing code or writing a PR description in edu-droid-flutter (mvbf). Enforces the target repo's commit format (NOT km's gitmoji) and the pre-commit checks. Examples: \"幫我 commit\", \"寫 PR 描述\", \"這些改動可以 commit 了\""
---

# mvbf commit / PR

**先讀 `mvbf` skill**（分支確認、不引用 km 路徑）。這裡只放 commit 特有的部分。

---

## ⚠️ 不要套 km 的 gitmoji

km repo 用 `<gitmoji> <type>: <繁中簡述>`。**那只適用於 km。**
mvbf 有自己的格式，**沒有 gitmoji**。這是反覆發生過的錯誤。

## 動手前的固定動作

```bash
cat Orgs/Viewsonic-EDU/edu-droid-flutter/.claude/rules/commit-format.md
```

以那個檔為準（可能已更新）。截至目前的形狀是
`[Type] 標題` ＋ `What:` / `Why:` / `How:` / `Changes:`。

沒有規範檔時（其他 repo）改看既有 commit：

```bash
git log -5 --format='%s%n%b%n---'
```

## 容易連帶弄錯的細節

- **type 標記**要對照 Jira 的 issue type 挑（`[Task VSFT-x]` / `[BUG VSFT-x]` /
  `[User Story VSFT-x]`），不是隨便選一個。
- **一個 commit 動到多張票**：所有 VSFT key 都要列在 subject
  （例：`[User Story VSFT-9941][VSFT-8368] …`）。
- **`Co-Authored-By`**：看該 repo 既有 commit 有沒有這個慣例，不確定就數一下：
  ```bash
  git log --format='%b' -80 | grep -c 'Co-Authored-By'
  ```

## Commit 前的檢查

1. **km 路徑洩漏**（註解、README、PR 描述、commit message 都算）：
   ```bash
   grep -rn "docs/features/\|docs/domains/\|docs/repositories/" lib/ test/
   ```
2. **純 format 噪音**：只改必要行，發現整檔被 formatter 重排就還原重做。
3. **分支**：`git branch --show-current`，確認不是誤在 `master`／`develop` 上。
4. **註解**：有沒有「原本…」這類描述 diff 的句子（見 `mvbf` skill 的註解標準）。

## 不要自動 commit

除非明確被要求，或該行為本身具 commit 意義。這條對所有 repo 適用。
