---
name: mvb-rewrite
description: "Use when the user says 狸貓版 / 狸貓版 mvb / 狸貓, or when working in edu-mvb-android-playground / edu-mvb-mac-playground / edu-swallow-app — the 2026 native rewrite line of myViewBoard (Android / macOS / Windows). Covers what 狸貓版 means, which repo is which platform, the per-repo default branch trap, and the AI-native flow whose rules live in each repo's own CLAUDE.md. Examples: \"狸貓版的 xxx\", \"改 swallow 的 OLF 讀取\", \"android playground 這個 spec\""
---

# 狸貓版 mvb（2026 原生重寫線）

「**狸貓版**」是團隊對這三個 repo 的口語統稱 —— 2026 年啟動的 myViewBoard **原生重寫**，
一個平台一個 repo：

| 平台 | repo | 技術棧 | 預設分支 |
|---|---|---|---|
| Android | `edu-mvb-android-playground` | Kotlin + Jetpack Compose | `droid-port` |
| macOS | `edu-mvb-mac-playground` | Swift + SwiftUI（macOS 13+） | `mvb-port` |
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

1. **確認分支**（三個 repo 的預設分支各不相同，見上表；`master` 只有 Swallow 是對的）：
   ```bash
   git -C <repo> branch --show-current
   ```
2. **讀該 repo 的 `CLAUDE.md`** —— 它自稱「專案憲法」，且**不會跨 repo 自動載入**。
   連同 `.claude/rules/`（各 repo 有自己的 path-scoped rules，例如
   `compose-implementation` / `swiftui-implementation` / `winui-implementation` / `conversion`）。
3. **看該 repo 的 `.claude/skills/`** —— 這三個 repo 把 AI 流程寫成自家 skill
   （`solve` / `batch` / `feature` / `audit` / `kanban` / 各平台 reviewer…）。
   要跑流程就用它們的，**不要**自己另編一套。
4. 動到 **OLF 檔案格式語意**時另外叫 `olf-vnext`（合約在 `olfparser/docs/olf-vnext/`，
   正典是 C++ `edu-vboard-libolf`；狸貓版走 v-next，不是 Sparrow legacy OLF）。

## Ticket / commit 慣例

- **Jira 用 `MT-` 系列**，不是 mvbf/cs 那條線的票號。
  **狸貓版是「新單一律開 VB」的唯一例外**——其餘產品線 2026-09-09 起從 `VSFT-` 改開 `VB-`，
  狸貓版維持 `MT-`（專案負責人 2026-09-09 裁定的工作規則，非查證過的組織政策；
  依據是 MT 在 2026-09-08 仍有 MT-3048～MT-3059 持續建立）。VB 那邊的開單慣例見 `jira-vb`。
- 分支：`MT-<n>-<英文 kebab slug>`（例：`MT-2486-renderer-fidelity`）。
- Commit：**Conventional Commits + 尾綴 MT key**，無 gitmoji、無 mvbf 的 `[Type]`：
  - `feat(canvas): present 換頁跳過隱藏頁 (S3, spec 0298) MT-2496`
  - `fix: OLF renderer fidelity for imported decks MT-2486 (#276)`
  - 送 commit 前照 `cross-repo-workflow.md` §3：先看該 repo 既有 `git log`，別套 km 的 gitmoji。
- 每張票對應 `specs/NNNN-*.md`，spec 編號用該 repo 的取號工具原子取得（別手動挑號）。

> 這份 skill 只放 km 這邊的**個人層**索引。流程細節、gate 定義、review 規則
> 全部以各 repo 自己的 `CLAUDE.md` / `.claude/` 為準 —— 不在這裡複製，避免漂移。
