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

- **repo 內的實作票用 `MT-` 系列**，不是 mvbf/cs 那條線的票號。MT 至今照常收狸貓版的
  spec／功能／bug／test-infra 票（2026-09-09 仍有 `MT-3074`/`MT-3076` mac、`MT-3075` windows）。
  ⏳ **MT 未來會收掉**（2026-09-11 Jay 裁定，最終落點是 VB 一個專案），但那是方向不是
  現況 —— 在 MT 真的停止收票前照舊，不要自己提前搬。翻案條件與細節見 `jira-vb`。
- **狸貓版的產品面票開在 `VB-`。** 2026-08-31 起 VB 上就有狸貓版的票，且明寫平台：
  `VB-1897` Mac Native（Epic）、`VB-1893` App Store Mac 上架、`VB-1793`/`VB-1794` v-next OLF
  發布驗證、`VB-2061` [mVB Windows 狸貓]／`VB-2063` [mVB Mac] MS SSO、`VB-2001`/`VB-2021`/
  `VB-2022`/`VB-2027` VS Account 後端契約（引用 `MT-2757`）。
  **所以「狸貓版一律 MT」是錯的**——分界是層次，不是產品線：
  別的團隊要知道／要接（產品需求、上架、五端共通故事、後端 API 契約）→ `VB-`；
  只在三個 playground repo 內完成 → `MT-`。開 VB 單的欄位與標題慣例見 `jira-vb`。
- 分支：`MT-<n>-<英文 kebab slug>`（例：`MT-2486-renderer-fidelity`）。
- Commit：**Conventional Commits + 尾綴 MT key**，無 gitmoji、無 mvbf 的 `[Type]`：
  - `feat(canvas): present 換頁跳過隱藏頁 (S3, spec 0298) MT-2496`
  - `fix: OLF renderer fidelity for imported decks MT-2486 (#276)`
  - 送 commit 前照 `cross-repo-workflow.md` §3：先看該 repo 既有 `git log`，別套 km 的 gitmoji。
- 每張票對應 `specs/NNNN-*.md`，spec 編號用該 repo 的取號工具原子取得（別手動挑號）。

> 這份 skill 只放 km 這邊的**個人層**索引。流程細節、gate 定義、review 規則
> 全部以各 repo 自己的 `CLAUDE.md` / `.claude/` 為準 —— 不在這裡複製，避免漂移。
