---
name: cs
description: "Use when writing, reviewing, or committing code in ragdoll-cat (ClassSwift Android teacher app) — before any Edit/Write in that repo. Covers where it actually runs (fused into mvbf's APK), the build/install traps, team-rule discovery, and the commit format (NOT km's gitmoji, NOT mvbf's [Type]). Examples: \"改 cs 的 xxx\", \"ClassSwift 視窗沒開\", \"VSFT-100xx 的 Android 票\""
---

# ClassSwift Android（ragdoll-cat）工作核心

repo：`Orgs/Viewsonic-EDU/ragdoll-cat`（package `com.viewsonic.classswift.service`）

這是**個人層**的補充。團隊慣例的 source of truth 在該 repo 自己的 `.claude/rules/`
與 `docs/conventions.md`，**不要**在這裡複製一份（會漂移且不會被發現）。

---

## 步驟 0：先讀團隊 rules（每次都做）

這個 repo 的規則比 mvbf 多得多，而且**有 CLAUDE.md**（mvbf 沒有）：

```bash
cd Orgs/Viewsonic-EDU/ragdoll-cat
cat CLAUDE.md
ls .claude/rules/
```

目前有 11 個（可能增減，以 `ls` 為準），依任務挑：

| 檔案 | 何時要讀 |
|---|---|
| `project-coding-architecture.mdc` | 任何改動（架構與 DI 的通則） |
| `coding-solid-and-testing.mdc` | 任何改動 |
| `test-with-feature.md` | **PR 前必讀** — 依改動類型分層的最低測試門檻，是 PR gate |
| `file-placement.md` | 新增檔案 |
| `naming-conventions.md` | 命名 class / XML id / layout / color / drawable |
| `extension-functions.md` | 寫 extension function |
| `figma-design-tokens.md` | 動到顏色／尺寸／樣式 |
| `git-rebase-only.mdc` | commit／PR 同步 |
| `sonar-kotlin-actionable.md` | 想避免 SonarCloud 卡關 |
| `jira-fetch.md` | 抓票 |
| `assistant-traditional-chinese.mdc` | 對話語言（跟 km 一致） |

`docs/conventions.md` 另外放 code review 規則、分支策略、以及**開票時的 Jira 欄位**
（Scrum Team `星期六浩克`、Project 欄位 `MVB_CS_Android`）。

---

## ⚠️ 這個 app 有兩種跑法，先確認你在測哪一種

| 跑法 | 說明 |
|---|---|
| **獨立 app** | CS 自己的 APK。有自己的登入畫面（`LoginFragment` / `LoginActivity`） |
| **fusion（融合版）** | **CS 被打包進 mvbf 的 APK**（`com.viewsonic.droid`），走 IPC，**不經過任何 CS 登入畫面** |

**IFP 出貨與日常驗證都是 fusion。** 這件事會改變一切：

- **fusion 要用 mvbf 的 gradle 建**，不是 CS 自己的：
  ```bash
  cd Orgs/Viewsonic-EDU/edu-droid-flutter/android
  ./gradlew :app:assembleEdlaDebug \
    -PclassswiftRepoPath=/Users/jay.wj.wu/ProjectsWork_GitHub/Orgs/Viewsonic-EDU/ragdoll-cat
  ```
  （mvbf 的 `:classswift` module 直接把 sourceSets 指到這個 checkout，改 CS 的 code 重建 mvbf 就會生效）
- 獨立 app 才用 `./gradlew installRcDebug`（APK 在 `app/build/outputs/apk/rc/debug/`）
- **只在 CS 登入畫面裡的邏輯，fusion 完全不會執行** —— 見下面的 overlay 權限陷阱

IPC 契約在 `docs/mvb-ipc-spec.md`，對面是 mvbf（見 [[mvbf]] skill）。

---

## 切分支後編譯噴 `Unresolved reference`：safe-args 產生碼沒清

改動 `app/src/main/res/navigation/nav_graph.xml` 的分支之間切換後，fusion build 會噴：

```
e: .../build/classswift/generated/source/navigation-args/.../XxxFragmentDirections.kt
   Unresolved reference 'action_to_xxx'
```

那是**舊分支的 Directions 檔殘留**。`rm -rf build/classswift` **沒有用**（gradle 的
incremental 會把它視為 up-to-date）。正解：

```bash
cd Orgs/Viewsonic-EDU/edu-droid-flutter/android
./gradlew :classswift:generateSafeArgsDebug -PclassswiftRepoPath=... --rerun-tasks
```

---

## 視窗開不起來時，先查 overlay 權限再查程式碼

見 [[mvbf-fusion-overlay-permission-silent-fail]]。一句話：**fusion 模式沒有任何地方
檢查 `Settings.canDrawOverlays`**（那個檢查只在 CS 獨立 app 的 `LoginFragment` /
`LoginActivity`），權限一掉就是**完全靜默**的失敗 —— toggle 正常轉 ON、每個
`MessageOpenWindow` 都回 `open_window_failed`、畫面上沒有任何提示。

```bash
adb -s <dev> shell appops get com.viewsonic.droid SYSTEM_ALERT_WINDOW
# default + rejectTime=剛剛 → 就是它
adb -s <dev> shell appops set com.viewsonic.droid SYSTEM_ALERT_WINDOW allow
```

真正的原因只在 `flutter :` **以外**的 logcat 行：
`BadTokenException: permission denied for window type 2038`。

---

## Roborazzi golden「刪掉又出現」：要 `--rerun-tasks`，跑一般 gate 反而保證復活

`app/build/intermediates/roborazzi/` 是 Gradle 宣告的 **task output**，而
`finalizeTestRoborazzi` 會把它的內容搬進受版控的 `app/src/test/snapshots/`。

所以手動刪掉 snapshots 底下的檔案之後，下次跑 verify **就算是 `UP-TO-DATE`**（1 秒結束、
測試根本沒跑），Gradle 也會從 build cache 把整個 output 目錄還原回來，孤兒 golden 隨即復活。

```bash
rm -f app/src/test/snapshots/<pattern>.png
rm -rf app/build/intermediates/roborazzi app/build/outputs/roborazzi
./gradlew verifyRoborazziStagDebug --rerun-tasks    # 關鍵：讓 task 真的重跑，依現存測試重建
./gradlew verifyRoborazziStagDebug                  # 再跑一次一般 gate
git status --porcelain                              # 看到零 untracked 才算關掉
```

**兩個惡性特徵**：錯誤做法會製造「刪掉又出現」的假象；失敗時完全沒有錯誤訊息。
VSFT-10092 有兩輪 review 卡在這上面。

> 順帶：`git add .` 前務必看一次 `git status` —— 復活的孤兒 golden 可能是前面某張票
> **刻意刪掉**的檔案（VSFT-10065 / VSFT-10067 各刪過一批），加回去不會有人發現。

---

## 架構速記（細節以 `CLAUDE.md` 為準）

- **UI 是 Android Views + ViewBinding，沒有 Compose**；Koin DI、Moshi、Retrofit、Room、Socket.IO
- **浮動視窗框架** `windowframework.core`：`IWindow` / `IWindowModel` / `WindowContainer` /
  `CSWindowManager`。所有 CS 畫面都是 overlay 視窗，不是 Activity
- **quiz 畫面依題型各一份**，不是共用元件：
  - `ui/window/quiz/edit/Mvb*EditWindow`（＝ spec 講的「Setting 頁」，6 種題型）
  - `ui/window/quiz/start/Mvb*StartWindow`（＝作答頁）
  - `QuizEditWindowModel` 派題成功後用 `MvbStartWindowReloader.replaceWithFreshStartWindow` 換窗
- **`Mvb` 前綴＝給 mvbf 用的變體**；沒有前綴的是獨立 app 的版本。改一個要想另一個

---

## Commit 格式：Conventional Commits ＋ 票號在中括號

⚠️ **不是 km 的 gitmoji，也不是 mvbf 的 `[Type] 標題`。** 這個 repo 用：

```
fix[VSFT-10065]: align the mask geometry with the full Figma spec
feat[NO-TICKET]: hold the quiz surfaces until a class is picked
refactor[VSFT-9711]: ...
docs[VSFT-9711]: ...
test[VSFT-9711]: ...
```

- **英文**（跟 mvbf 的中文 commit 不同）
- 沒有票就寫 `[NO-TICKET]`
- `Co-Authored-By` 是慣例（近 60 筆有 50 筆）
- 動手前一樣先確認：`git log -10 --format='%s'`

**註解語言**：**新增的註解一律用繁體中文。**

CS 既有註解以英文為主，也有中文（如 `PendingClassEntryWindowManager`）—— 既有的不要為了統一
去翻譯，但你新寫的那幾行寫中文，即使周圍是英文。這是使用者明確要求（VSFT-10092 時定案），
優先於「跟著你正在改的那個檔案走」。

---

## 相關

- [[mvbf]] — IPC 對面那一端；fusion build 也從那邊發動
- `docs/mvb-ipc-spec.md`（該 repo）— 兩邊的訊息契約
- 動到 OLF 檔案格式語意時另外叫 `olf-vnext`
