---
name: vbo
description: "Use when writing, reviewing, or committing code in edu-vbo — VBO (ViewBoard One), the 企業版 demo whiteboard app (Android · Kotlin · Compose; Gradle project take_one) and its future One Take capture layer — before any Edit/Write in that repo. Covers what the product is, the repo's own prospec flow and VSTO ticket numbers (no Jira), the commit format (NOT km's gitmoji, NOT mvbf's [Type]), the keystore / intranet / JDK setup traps, and running on a non-IFP device. Examples: \"企業版的 xxx\", \"VSTO-022\", \"side toolbar v3\", \"vbo 在 pixel tablet 上跑不起來\""
---

# edu-vbo（VBO / ViewBoard One，口語「企業版」）

本機：`~/ProjectsWork_GitHub/Orgs/Viewsonic-EDU/edu-vbo`（`repo-storage.py status` 查實際位置，
別照抄這行）。產品條目在 km 的 `data/repos-overview.json` → `products.vbo`。

這份只放**個人層**補充。團隊規則在 repo 自己的 `CLAUDE.md`、`ONBOARDING.md`、`docs/ai-workflow.md`、
`.claude/rules/`，**不會跨 repo 自動載入**，動手前自己讀；內容以那邊為準，這裡不複製。

## 它是什麼

- **ViewBoard One** 是會議室互動顯示器。兩層：
  - **VBO**（Layer 1）：白板 app，每台都有，不收音不錄影 —— **目前實際在做的是這層**。
  - **One Take**（Layer 2）：會議擷取（語音＋白板事件＋畫面 → 一條時間軸 → Wrap Up），
    還在 Phase 0 可行性。PoC 沒結論前不要開它的 MVP 功能。
- 同事口中的「企業版 demo」就是它。**跟 `vbos`（教育 IFP 的系統層）是不同線**，別因為名字像就混用。
- Jacky 建立與主導，大部分 commit 由他 Mac 上的 orchestrator agent（`orchestrator fable<N>`）派工落地。
  產品決定、範圍變動、不可逆的事都是 **Jacky** 的。
- 模組：`:app`（殼、側邊工具列）／`:whiteboard`／`:takeit`（Take it：PDF 經 QR 帶走）／`:phonedrop`（手機丟內容）。
  applicationId `com.viewsonic.vbo`；Gradle `rootProject.name` 仍是 `take_one`（歷史名）。

## 工作單位與票號

- **沒有 Jira**。票號是 repo 自己的 `VSTO-NNN`，登記在 `docs/tickets.md`。
  **不要**照 km 的 `jira-vb` 習慣去開 VB 單。
- 一張票 = 一個 change = `.prospec/changes/<name>/` = 一個 owner。接手一張時依序讀
  `ONBOARDING.md` → 該 change 的 `colleague-brief.md` → `handoff.md`（兩者衝突時 handoff 贏）→ `proposal.md`
  的 `## Scope locked (front walk)`（那就是 AC）。
- 誰在做什麼、卡在哪、等誰裁決：`docs/orchestrator-log.md`（管線／Backlog／待你裁決）。
  查 Jay 自己的：`grep -n 'Jay Wu' docs/orchestrator-log.md docs/tickets.md`。
- 會擴大鎖定範圍的問題**不是自己答**：寫成 QUESTION 進 change 的 `eyeball-log.md` 與 PR，然後停。

## 流程：用 repo 自帶的 skill，不要自己編

`.claude/skills/` 有整套：`prospec-*`（story → plan → tasks → implement → verify → archive）、
`front-walk`、`cross-review-loop`…。在 edu-vbo 目錄開 Claude Code 會自動載入。
**從 km 這邊的 session 操作 edu-vbo 時它們不在 context**，要跑流程就到 edu-vbo 開新 session。

## 分支與 commit（跟 km、mvbf 都不同）

- 分支：`{name}/{purpose}`，**小寫** `jay/…`（brief 指定例：`jay/vsto-022-side-toolbar-v3`）。
  **不要 commit 到 `main`**：Jacky 的 session 直接落在上面。PR 發到 `main`。
- 同步：`git fetch` + `git rebase origin/main`，**不 merge、不 pull**。
- commit 格式 `type[VSTO-NNN]: …`、英文 body、agent trailer —— **細節讀
  `.claude/rules/git-workflow.md`**（它規定 trailer 要寫確切 model id，不能寫 alias）。
- 每個 commit：**用檔名當 pathspec**（不要給目錄）、同一條指令鏈裡 `make gates >/dev/null || exit 1`、
  訊息用 `git commit -F -` ＋ quoted heredoc。理由見 ONBOARDING §8（都是踩過的）。
- 單獨用 km 那邊的 `review-local` 之類工具時也記得：這個 repo **有自己的 gates**，`make gates` 綠才算數。

## 本機環境的坑

| 症狀 | 原因 | 處理 |
|---|---|---|
| Gradle 在 agent shell 失敗、自己 terminal 可以 | agent shell 不讀 login profile，`JAVA_HOME` 空 | `export JAVA_HOME="$(/usr/libexec/java_home -v 17 2>/dev/null \|\| echo /opt/homebrew/opt/openjdk@17)"` |
| 相依套件解析錯誤，訊息完全沒提網路 | `settings.gradle.kts` 用公司內網 maven（`172.21.6.242`，VSApiCompat 只在那） | 連公司網路／VPN 再 build |
| 簽章失敗／找不到 keystore | `MVBA_PlatForm.jks` gitignored，要手動放 repo 根目錄 | 見下節 |

### keystore

跟 ClassSwift 同一把平台 key。**從 `ragdoll-cat/MVBA_PlatForm.jks` 複製**（一般 repo，可以動）：

```bash
cp -n ~/ProjectsWork_GitHub/Orgs/Viewsonic-EDU/ragdoll-cat/MVBA_PlatForm.jks \
      ~/ProjectsWork_GitHub/Orgs/Viewsonic-EDU/edu-vbo/
keytool -list -keystore edu-vbo/MVBA_PlatForm.jks -storepass viewsonic 2>&1 | grep -A1 '^platform'
git -C edu-vbo check-ignore -v MVBA_PlatForm.jks    # 要回 .gitignore 的 *.jks 那行
```

- `platform` alias 的 SHA-256 要跟 edu-vbo `CLAUDE.md` → Signing 寫的一致（開頭 `8E:76:71:58`）。
  檔案裡還有一個 `mvba` alias，build 不用，不是錯。
- **不要**從 `mvbf_keystore` 拿 —— 那是 km `excluded-dirs.md` 的保護目錄，agent 不讀不複製，
  連 cp 指令都不代寫。ragdoll-cat 那份就夠了。
- 2026-09-24 已放進 Jay 本機的 edu-vbo（`ls edu-vbo/*.jks` 驗證，別假設它還在）。

## 裝置

- **IFP35 在 Jacky 桌上、單人駕駛**，不要自己 `adb connect`；面板項目請 orchestrator 代跑，
  證據再釘進自己的分支（ONBOARDING §6）。
- 開發期用別台平板**可以**：evidence gate 只驗「真的在裝置上執行過」，不看型號
  （orchestrator 那邊自己也拿 Samsung sm-x520 釘開發期的 pin）。IFP35 在 verify／archive 前重釘一次。
- Jay 的 **Pixel Tablet `3629105H804NHC`**（API 36、800×1280 dp；IFP35 是 1280×720 dp）的差異：
  1. **面板 API 不存在** → 亮度等走 `VsBacklightPort` 的功能在這台是刻意的安靜失敗，不是 bug；
     這類只能在 IFP35 驗。
  2. **浮動視窗權限要手動開**：IFP 上靠平台簽章自動授予，Pixel 的平台簽章不是 ViewSonic 的。
     裝完 debug 版先
     ```bash
     adb -s 3629105H804NHC shell appops set com.viewsonic.vbo SYSTEM_ALERT_WINDOW allow
     ```
     沒開時側邊工具列**不出現、沒有錯誤訊息**。同類陷阱見 memory `mvbf-fusion-overlay-permission-silent-fail`。
  3. 這台裝著 MVB（`com.viewsonic.droid`），跟 `com.viewsonic.vbo` 不衝突；只有刻意開
     `mvbSlot` 的探針 build 才會用 MVB 的 id。
- **Mac 上常同時接好幾台**（Chromebook、IFP63…），instrumented 一律帶 `--serial`，
  不帶 runner 會直接報錯：
  ```bash
  python3 .github/scripts/run-instrumented.py --worktree "$PWD" --serial 3629105H804NHC --suite :app --class <FQCN>
  ```
  **不要**用裸的 Gradle class filter（逗號分隔只跑第一個還印 BUILD SUCCESSFUL）。
- 用實機而不是 ONBOARDING 寫的 emulator 時，PR 的 Verification 段寫明
  （例：「dev pins on Pixel Tablet (API 36); brightness pending IFP35」），orchestrator 才對得上。
