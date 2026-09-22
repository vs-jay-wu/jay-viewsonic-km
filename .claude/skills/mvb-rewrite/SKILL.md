---
name: mvb-rewrite
description: "Use when the user says 狸貓版 / 狸貓版 mvb / 狸貓, or when working in edu-mvb-android-playground / edu-mvb-mac-playground / edu-swallow-app — the 2026 native rewrite line of myViewBoard (Android / macOS / Windows). Covers what 狸貓版 means, which repo is which platform, the per-repo default branch trap, and the AI-native flow whose rules live in each repo's own CLAUDE.md. Examples: \"狸貓版的 xxx\", \"改 swallow 的 OLF 讀取\", \"android playground 這個 spec\""
---

# 狸貓版 mvb（2026 原生重寫線）

「**狸貓版**」是團隊對這三個 repo 的口語統稱 —— 2026 年啟動的 myViewBoard **原生重寫**，
一個平台一個 repo：

| 平台 | repo | 技術棧 | 預設分支 |
|---|---|---|---|
| Android | `edu-mvb-android-playground` | Kotlin + Jetpack Compose | `main` |
| macOS | `edu-mvb-mac-playground` | Swift + SwiftUI（macOS 13+） | `main` |
| Windows | `edu-swallow-app`（Swallow） | WinUI 3 / Windows App SDK + .NET 10 | `master` |

大家口語一律講中文「**狸貓版**」，沒有通行的英文代號（`mvb-rewrite` 只是 json/skill 需要 ASCII 的佔位名，別拿去跟人溝通）。
產品條目登記在 `data/repos-overview.json` 的 `products.mvb-rewrite`（別名以「狸貓版」為主）。

## 它不是什麼

- **不是** transpile / 移植現有程式碼。既有實作只是**行為的真實來源**，不是實作藍本：
  Android/macOS 對 `edu-droid-flutter`（mvbf），Swallow 對 `edu-sparrow-app`（Sparrow）。
  萃取意圖 → 用各平台慣用法重建，順手丟掉技術債。
- **不是** mvbf / sparrow 的分支。改狸貓版不會動到出貨線，反之亦然。
- Android repo 額外規定：Flutter 與 mac port 衝突時 **Flutter 贏**，差異記到 `docs/parity-log.md`。

## 動手前的固定動作

1. **確認分支**（見上表；`master` 只有 Swallow 是對的）：
   ```bash
   git -C <repo> branch --show-current
   git -C <repo> ls-remote --symref origin HEAD   # 遠端現在的預設分支
   ```
   > 兩個 playground 原本的 `droid-port` / `mvb-port` **已在遠端刪除**，預設分支改成 `main`
   > （2026-09-10 確認）。本機 checkout 若還停在舊分支，`git pull` 會報
   > 「no such ref was fetched」而不是自動跟上——先 `git fetch --prune` 再切 `main`。
2. **讀該 repo 的 `CLAUDE.md`** —— 它自稱「專案憲法」，且**不會跨 repo 自動載入**。
   連同 `.claude/rules/`（各 repo 有自己的 path-scoped rules，例如
   `compose-implementation` / `swiftui-implementation` / `winui-implementation` / `conversion`）。
3. **看該 repo 的 `.claude/skills/`** —— 這三個 repo 把 AI 流程寫成自家 skill
   （`solve` / `batch` / `feature` / `audit` / `kanban` / 各平台 reviewer…）。
   要跑流程就用它們的，**不要**自己另編一套。
4. 動到 **OLF 檔案格式語意**時另外叫 `olf-vnext`（合約在 `olfparser/docs/olf-vnext/`，
   正典是 C++ `edu-vboard-libolf`；狸貓版走 v-next，不是 Sparrow legacy OLF）。

## Ticket / commit 慣例

- **新單一律開 `VB`；`MT` 已停用**（2026-09-16 Jay 裁定，近期完成轉換）——
  產品面與 repo 內的實作票都是，實作票掛在對應的產品單底下（例：`VB-2247` 桌面標註模式）。
  欄位與標題慣例見 `jira-vb`。
  > 轉換期仍會看到新的 MT 票（2026-09-16 當天還有 `MT-3209`～`MT-3218`，含 `mac`／`windows`）——
  > 那是尚未轉換完的殘留，**自己不要跟著開**。既有 MT 單留在原地不搬
  > （`MT → VB` 沒試過；VSFT 已有搬移實例，見 `jira-vb` skill，但不要據此推論 MT 也行）。
- 既有票的分布（歷史）：狸貓版曾經是「實作 MT／產品面 VB」兩層，
  所以 `VB-1897` Mac Native、`VB-1893` App Store 上架、`VB-1793`/`VB-1794` v-next OLF
  與一大批 `MT-` 實作票會並存。**讀既有票時要知道這件事，但不要再照著開新單。**
- 分支與 commit 的票號**跟著你手上那張票走**（現在通常是 `VB-<n>`）：
  分支 `<KEY>-<英文 kebab slug>`、commit 用 **Conventional Commits + 尾綴票號**，
  無 gitmoji、無 mvbf 的 `[Type]`：
  - `feat(canvas): present 換頁跳過隱藏頁 (S3, spec 0298) MT-2496`（既有票的樣子）
  - `fix: OLF renderer fidelity for imported decks MT-2486 (#276)`
  > **未查證**：該 repo 的 AI flow／工具是否把票號格式寫死成 `MT-`。第一次用 VB key 開分支前，
  > 先看該 repo 的 `CLAUDE.md` 與 `.claude/` 有沒有硬性的 `MT-` 檢查。
  - 送 commit 前照 `cross-repo-workflow.md` §3：先看該 repo 既有 `git log`，別套 km 的 gitmoji。
- 每張票對應 `specs/NNNN-*.md`，spec 編號用該 repo 的取號工具原子取得（別手動挑號）。

> 這份 skill 只放 km 這邊的**個人層**索引。流程細節、gate 定義、review 規則
> 全部以各 repo 自己的 `CLAUDE.md` / `.claude/` 為準 —— 不在這裡複製，避免漂移。
