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

  ⚠️ **上面這條只適合「驗編譯」。要裝到機器上實測，改用
  `fvm flutter build apk --debug --flavor edla --android-project-arg=classswiftRepoPath=…`**
  —— 直接下 `./gradlew assemble` 會繞過 flutter 的版號注入，APK 變成 `versionCode=1`，
  然後 app 一開就跳更新卡、按下去把你正在測的 build 換掉。詳見 [[mvbf]] skill 的
  「Build 注意事項」。
- 獨立 app 才用 `./gradlew installRcDebug`（APK 在 `app/build/outputs/apk/rc/debug/`）
- **只在 CS 登入畫面裡的邏輯，fusion 完全不會執行** —— 見下面的 overlay 權限陷阱

IPC 契約在 `docs/mvb-ipc-spec.md`，對面是 mvbf（見 [[mvbf]] skill）。

### 差異不只在 build 與登入 —— 執行期行為也不同

**別把一邊量到的結論套到另一邊**（2026-09-17 我在同一天犯了三次，見 km rules
`cross-system-claims.md` §1）。已查證的差異：

| 行為 | 獨立 app | fusion |
|---|---|---|
| 靠 `onDestroy` 收尾的清理 | `quitApp()` 最後 `killProcess`，process 死 → 一切歸零 | **process 不死**，而且 MVB 的 `bindService(BIND_AUTO_CREATE)` binding 一直活著 → `stopService()` **不會** destroy service、`onDestroy()` 不執行 → 寫在那裡的清理全都不跑 |
| 前景服務的通知何時消失 | 隨 process 死亡消失 | 啟用後留到 process 結束（上一列的後果之一：`stopForeground(STOP_FOREGROUND_REMOVE)` 在 `onDestroy` 裡）。VB-2291 在處理 |
| 浮窗何時收起 | CS 自己沒有生命週期判斷 → 不收 | 由 **mvbf 的 Dart 層**送 `MvbVisibility(all_hide / all_show)` 決定（`classswift_bloc.dart`）。改這類行為要去 mvbf 找，不是 CS |
| Kotlin `object` 的狀態 | killProcess 歸零 | 留到下個 session（`stopKoin()` 碰不到 classloader 層） |

**最容易踩的通則**：fusion 下**任何依賴「process 會死」或「service 會被 destroy」的設計都不成立**。
看到 `onDestroy` / `killProcess` / `object` 裡的狀態，先問「fusion 走得到嗎」。

證據：`ClassSwiftFusionQuitBridge.kt` 的類別註解（mvbf 端）寫明「融合後 process 不死、
binder 永遠不會斷（真機實測 2026-08-03）」；`ClassSwiftService.kt` 的 `onStartCommand`
註解寫明有 bound client 時 `stopServiceTokenLocked` 不會清 `fgRequired`。
`object` 那列見 km `docs/repositories/Viewsonic-EDU/edu-droid-flutter/features/classswift-embedded-apk/findings.html`（R19）。

查證指令（判斷服務現在到底是什麼狀態，比看畫面可靠）：

```bash
adb shell dumpsys activity services com.viewsonic.droid | grep -A45 'ServiceRecord{.*ClassSwiftService'
# isForeground / types=0x…（0x200=remoteMessaging、0x20=mediaProjection）
# startRequested（stopService 有沒有被呼叫過）/ Bindings: 底下的 IntentBindRecord
```

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

## PR 的兩道 test gate，第二道最容易漏

`.claude/rules/test-with-feature.md` 是這個 repo 的 PR gate（由 PR template 的 checkbox ＋
reviewer 把關，**不是 CI**）。它有**兩道**，我 2026-09-21（VB-2335 / PR #1164）只看到第一道，
被 reviewer 擋下來。

| Gate | 位置 | 要什麼 |
|---|---|---|
| Change type A/B/C/D | 該檔前半 | 依改動類型附對應測試 |
| **Per-Ticket E2E Gate** | 該檔 `### Per-Ticket E2E Gate` 那節 | **Type A/B/C 的 user-facing ticket，收尾要有 ticket scope 對應的 agent E2E journey PASS**，否則要掛 `skip-e2e-gate` ＋合格例外理由 |

**送 PR 前把那個檔整份讀完**，不要只讀到 change type 表就開始寫 PR 描述。

### journey 是什麼、為什麼你大概跑不了

journey ＝ 五層測試的最上層，**真機上的完整使用者流程**。特別的是它**不是腳本**：
一條 journey 就是一份自然語言任務書，跑的時候由 orchestrator 開一個 `claude -p` 子 agent，
讀任務書 → 用 `mobile_dump_ui` 判斷畫面 → 自己決定操作 → 自己判 PASS/FAIL/NEEDS_HUMAN。
`_shared-preamble.md` 明文禁止寫死座標、禁止 Appium / Espresso DSL。

**規格進版控、執行引擎不進**：

- `docs/testing-strategy/journeys/J*.md` — 任務書，在 repo 裡
- **`pipeline/`** — orchestrator / runner / 產出，**`.gitignore` 裡，fresh clone 沒有**

`docs/testing-strategy/architecture/device-rig.md` 說明這是刻意的：那些東西自動化的是
**某一座特定機櫃**（launchd 排程、參考機 SM-X520 `R52Y60E4GEW`），
「it does not promise turn-key execution from a fresh clone」。

所以在 Jay 的機器上**跑不了 journey**，這不是環境壞了。

### ⚠️ 現有 journey 只有 J2–J6，而且涵蓋範圍比名字窄

| Journey | Mission |
|---|---|
| J2 login-mvb | toggle → CS 綁定 → 落在 `MvbQuizCollectionWindow` |
| J3 quiz-dispatch-mvb-qc | 在 Quiz **Collection** 挑既有題目 → Start/Push → `MessageStartQuiz` |
| J4 push-respond | J3 之後的學生端作答視窗 |
| J5 mvb-toggle | toggle 開／關／再開的生命週期 |
| J6 join-class-crud | 學生管理／加入班級 |

**沒有一條涵蓋「從畫布截圖並派成題目」**（`ScreenshotActivity` / `ScreenCaptureSession`）。
J3 名字最像，但它的 drive 是 folders → 題目列表 → 詳情 → Start，一步都不碰擷取路徑。

> ⚠️ **被要求「補 E2E 證據」時，先確認那條 journey 會不會執行到你改的程式碼。**
> 名字相近就照跑、拿回一個 PASS 當 gate 證據，是
> [`cross-system-claims.md`](../../rules/cross-system-claims.md) §5 那個「測試存在、
> 名字對，但執行路徑根本沒碰到」的變體 —— 只是這次是**別人要求我去跑**那個空轉的測試。
> 假綠比沒有證據更糟。

`test-with-feature.md` 本文寫「J1–J5」，跟實際的 J2–J6 對不起來；
`docs/testing-strategy/features/mvb-quiz-mask.md` 自己註記了這個不一致。

### 沒有對應 journey 時怎麼辦（2026-09-21 實際走過一次）

`skip-e2e-gate` 的允許清單**沒有**「此 scope 沒有 journey」這一項，硬掛會把原因標錯。
當時走通的做法：

1. 把上面三件事查出來當證據（沒有對應 journey／`pipeline/` 不在 repo／參考機沒接）
2. **手動跑同一個形狀**，每個 gating moment 留一張圖
3. **用產品程式碼自己的 log 證明走到了改動的分支**（不是為除錯另加的探針）
4. 附**負向對照**：把修正改回去，同一台機器重現原症狀 → 證明這次執行分得出修好與沒修好
5. 把裁定權交回 maintainer（接受證據 vs 掛 label），不要自己決定
6. 缺的 journey 開 follow-up ticket，別卡住當前 PR

maintainer 當時選 1（接受證據、不掛 label），理由是硬掛 label 會把原因標錯。
**證據要留在 PR 上** —— 票的附件不算（見 [[handoff-docs]] 的「GitHub 沒有附件上傳 API」）。

### PR template 的 `./pipeline/local-qa.sh` 是死連結

自我審核那三個 checkbox 之一要求跑 `./pipeline/local-qa.sh`，但 `pipeline` 在 gitignore 裡、
Jay 的 checkout 沒有，`git log --all -- '*local-qa.sh'` 也查不到 —— 那是別人的個人工具。

**不要勾它。** 改成跑 `ci.yml` 實際 gate 的兩條，並在 PR 裡寫明為什麼沒勾：

```bash
./gradlew compileStagDebugSources lintStagDebug
./gradlew testStagDebugUnitTest --rerun-tasks
```

> 📤 這條與上面的「J1–J5 vs J2–J6」都**應該上游到 ragdoll-cat 的團隊 rules**，待與 Jay 確認。

---

## 在新 worktree 跑 JVM 測試要先補三個 gitignored 檔

`./gradlew testStagDebugUnitTest` 在乾淨的 worktree 會連續倒三次，而且**錯誤訊息都不指向
「這個檔沒進版控」**。依序補：

| 停在哪 | 缺什麼 | 怎麼補 |
|---|---|---|
| `:classswift` configuration（fusion build）或 `:app` | `keystore.properties`（repo 根） | 從主 checkout 複製。**這個檔名叫 keystore 但實為 secrets**（OAuth client id、Amplitude key、guest 登入 key） |
| `:app:processStagDebugGoogleServices`「File google-services.json is missing」 | `app/src/stag/google-services.json` | 見下 |
| SDK 路徑相關 | `local.properties` | 從主 checkout 複製 |

### ⚠️ `cs_googlejson/` 裡沒有一份 package name 對得上

repo 內 `cs_googlejson/{aosp,edla}{Stag,Rc,Prod}/` 六份的 package 分別是
`com.viewsonic.classswift.aosp[.stag|.rc]` 與 `com.viewsonic.classswift[.stag|.rc]`，
**沒有**現在 `stag` variant 需要的 `com.viewsonic.classswift.service.stag`。直接複製會停在：

```
No matching client found for package name 'com.viewsonic.classswift.service.stag'
```

真正的來源是 CI secret（`GOOGLE_SERVICES_JSON_STAG`，見
`.github/actions/setup-ci-env/action.yml`，它寫到 `app/src/stag/`），本機沒有。

**只是要跑 JVM 單元測試**的話，把 `cs_googlejson/edlaStag/` 那份的 package name 改掉即可
（Firebase 在 JVM 測試不會被呼叫，這個檔只是為了讓 google-services plugin 過關）：

```bash
python3 -c "
import json
j=json.load(open('<主checkout>/cs_googlejson/edlaStag/google-services.json'))
for c in j['client']:
    c['client_info']['android_client_info']['package_name']='com.viewsonic.classswift.service.stag'
json.dump(j, open('app/src/stag/google-services.json','w'), indent=2)"
```

三個檔都被 gitignore（`git check-ignore -v` 確認過），所以補完 `git status` 仍然乾淨。

---

## 出版本：tag 是 CI 打的，而「給舊 production 線的修正」要另開 release 線

CS 的版本 tag **不是人手動打的**，是 `Build`（`build.yml` → `_build.yml`）dispatch 時
產生的：它讀 dispatch 的那條 ref 上的 `version.properties`，`VERSION_PATCH + 1`、
commit（`ci: bump version to X.Y.Z [skip ci]`）、打 tag。

`build.yml` 的 guard 只允許從 **`develop` 或 `release/**`** dispatch，其他分支直接中止。

### 日常 vs 給舊線出修正，是兩條不同的路

| 情境 | 做法 |
|---|---|
| 一般 sprint 版本 | 直接在 `develop` dispatch **Build** → tag 打在 develop 上 |
| **mvbf 的 production hotfix 要一顆修正** | **先 Cut Release Branch**，再在 `release/N.M` 上 dispatch Build |

第二條之所以必要：mvbf 的 production 線把 CS 釘在一個舊 tag 上，而 `develop` 早就往前跑了。
拿 develop 的新 tag 去換，等於把中間所有東西一起帶進 production 修補版。

**2026-09-22 實際走過一次**（VB-2335，給 mvbf 3.10.208）：mvbf production 線釘 `v1.8.2`，
而 develop 已經是 `v1.9.2` —— 中間 135 個 commit，主軸是 drop-standalone（移除 CS 自己的
獨立登入鏈）與 i18n 重構。完整路徑：

1. dispatch **Cut Release Branch**（`cut-release-branch.yml`），input `tag=v1.8.2`
   → 建出 `release/1.8`。guard：tag 必須 reachable from develop、`release/N.M` 不能已存在
2. 從 `release/1.8` 開工作分支 → cherry-pick 那顆修正 → **PR 進 `release/1.8`**
   （`release/**` 有 ruleset 要求 `Build, Lint & Unit Test (stag debug)` 這個 check，不要直推）
3. merge，**等 CI 綠**（見下一條），再在 `release/1.8` dispatch **Build** → `v1.8.3`
4. mvbf 端才 bump `classswift-ref.properties`

⚠️ **`release/N.M` 不會自己存在。** 2026-09-22 當下 `release/*` 只到 `release/1.7`，
v1.8.x 與 v1.9.x 的 tag 全都直接打在 develop 上。所以第 1 步幾乎一定要做。

⚠️ **修正也要在 develop 上**（本例是先進 develop 再 backport，所以不必補），
否則下一版就回歸了。

### ⚠️ merge 完**不能馬上** dispatch Build —— `check-ci-green` 會擋

`_build.yml` 的第一步 `check-ci-green` 會讀該 commit 上**除了自己這個 run 以外**的所有
check-run，只要有任何一條 **pending 或 failed** 就中止：

```
Checking CI status for <sha> (release/1.8)
❌ 1 check(s) still running on release/1.8. Aborting.
```

而 merge 進 `release/**` 本身就會觸發一次 CI（`ci.yml` 的 `on: push`），那要 **約 15 分鐘**
（實測 14m47s）。所以 merge 後立刻按 Build 一定被擋。

**它中止得很乾淨** —— 後面的 job（Bump/tag、Build APK、Publish、Deploy）全是 `skipped`，
沒打 tag、沒建 release、沒推 S3。所以這不是要修的東西，**等 CI 綠了重跑同一個 run
（Re-run failed jobs）就好**，不必改任何設定。

**由來**：2026-09-22，merge 於 00:03:21Z，Build dispatch 於 00:07:36Z，第 4 分鐘就按了。

**做法**：merge 完先去做別的，等 `gh run list` 上那條 CI 變 `completed/success` 再按。

### `mVB Quiz Tool → staging` 這一步在「往回出舊版」時會失敗

`build.yml` 最後一段（VSFT-9584）會把 staging APK 當「Quiz Tool」推到 mVB 共用 S3 給
Manager/MDM 安裝，然後**輪詢 mVB 後端 API 確認它回報新版號**。往回出舊版時那個輪詢會失敗：

```
Verifying via MVB backend (Manager) API: https://api.stage.myviewboard.com/api/v2/application/
⚠️  MVB backend API not ready yet: file_name='ClassSwift_Service_v1.9.2.apk' version='v1.9.2'
（8 次後）##[error]MVB backend API did not report v1.8.3 after 8 attempts
```

**證據等級**：API 在 2 分鐘內始終回舊版號是**實測**；「因為 v1.8.3 < v1.9.2 是降版所以
後端不接受」是**推論** —— 腳本自己的錯誤訊息指向的是
「admin-portal folder registration for `MVB_QuizTool_Stage`」，也就是要人去 admin portal 看。

**判準**：**這一步失敗不影響 mvbf**。融合版是從**原始碼**編 CS，只認 tag；這條路徑給的是
CS 的獨立 APK。`build.yml` 自己的註解也寫著它 "never blocks the ClassSwift OTA path"。
而且對 staging 來說，Quiz Tool 的登記**維持在較新的版本反而是對的** —— 別為了讓它變綠
就去把 stage 登記降版。要不要處理交給 Jay。

---

## i18n：POEditor ↔ `values-*/strings.xml`

**跟 mvbf 那條線是兩回事**，不要互相外推：mvbf 是 POEditor `754682` ＋ `arb`
（見 [[mvbf]] skill 的「i18n：POEditor 流程的實務補充」），cs 是 **`825204`
（`ClassSwift in mvb (Android)`）＋ `android_strings`**，41 個語系。
同步腳本與 workflow 在該 repo 的 `.github/scripts/sync-poeditor-translations.py`
與 `.github/workflows/poeditor-sync.yml`（VB-2281），細節看那兩個檔的檔頭。

以下是實際跑過一輪（VB-2280 灌基準 ＋ VB-2281 接自動化）才知道、而且**看程式碼看不出來**的事。

### 版本鏈：要在 **cs 打 tag 之前**同步，不是 mvbf 發版時

mvbf 不是從工作區建 CS，而是用 `classswift-ref.properties` 釘一個 **tag**，
且 `edu-droid-flutter/.github/actions/android-setup/action.yml` 有一道 gate
**強制 checkout 必須落在 tag 上**（寫 SHA 也拒絕）。所以 mvbf 發版當下才拉翻譯，
拉到的東西進不了那個已經釘好的 tag。順序只能是：

```
ragdoll-cat:  拉 POEditor → merge → 打 tag
                                      ↓
edu-droid-flutter:  bump classswift-ref.properties（人工 PR，約兩週一次）→ 發版
```

> 「打 tag」那一步怎麼做（以及給 mvbf production 線的修正為什麼要另開 `release/N.M`），
> 見上面的「出版本」一節。

### Android 的值有「編碼層」，灌進 POEditor 前要先解碼

`strings.xml` 存的不是內容本身，是 Android 轉義後的形式。**最容易漏的是外層雙引號**：

| repo 原文 | 真實值 |
|---|---|
| `", "` | `, `（外層引號是用來保住前後空白的**編碼**） |
| `Turn on \"Display over other apps\"` | `Turn on "Display over other apps"` |
| `That\'s an error.` | `That's an error.` |

直接把原文灌上去，POEditor 匯出時會**再包一層**，第一個就壞掉。
反方向寫回時也要重新編碼 —— POEditor 匯出一律外層包引號、換行是**字面換行**，
三者都會踩到該 repo `validate-translations.py` 的硬性失敗
（`spurious quote wrapping` / `embedded newline` / `unescaped apostrophe`）。

> 字面換行與 `\n` 在 **aapt2 編譯後完全等價**（compile + link + dump 實測，兩者 dump 輸出相同），
> 所以正規化是為了 diff 與那道檢查，不是為了修正顯示。

### POEditor 的 plural key set ＝該語言的 CLDR 詞形，空值＝還沒翻

**實測** `terms/list`（825204）：

| 語言 | 回傳的 keys |
|---|---|
| `ca` | `one, other` |
| `ru` / `cs` | `few, many, one, other` |
| `ar` | `few, many, one, other, two, zero` |
| `zh-TW` | `other` |

所以 **「key 不存在」與「key 存在但值是空字串」意思完全不同**：前者是這個語言沒有這個詞形
（可以用 `other` 補，Android 本來就是這樣 fallback），後者是有這個詞形、翻譯員還沒填
（**必須沿用現值**）。把兩者壓成同一種，會把捷克文、烏克蘭文既有的正確詞形靜默換成 `other` ——
而 validator 只驗 placeholder、不看文法詞形，**CI 會全綠**。VB-2281 PR #1163 被 reviewer 抓到。

### `validate-translations.py` 只掃 `<string>`，不掃 `<plurals>`

那支腳本很嚴（placeholder、簡繁混用、機翻殘留、跳脫），但 `embedded newline` 與空值檢查
**只走 `<string>`**。所以 `cs / lt / lv / sk / uk` 的 plural item 裡一直躺著字面換行沒被發現
（VSFT-9904 那批機翻把兩句黏在一起的殘留，VB-2281 只改寫法沒動內容）。
plural 的 placeholder 漂移原本也只是 warning、不影響結束碼，VB-2281 已升為硬性失敗。

**動到翻譯時不要只依賴那支腳本的綠燈**，plural 要自己看。

### 語系代碼映射

`zh-rCN→zh-Hans`、`zh-rTW→zh-TW`、**`in→id`**（Android 沿用 Java 的舊印尼文代碼）、
`values/→en-us`。其餘同名。`values-night` / `values-w600dp` / `values-v23` 不是語系 ——
誤當語系送出去，**POEditor 回的是空翻譯而不是錯誤**。

---

## 在融合版上疊一個 demo／除錯用的浮動工具

2026-09-22 做 VB-2116「出題視窗 1.2x」的現場對比工具時走完一輪，整段**不用改 mvbf 一行**。
可重用的成果留在 ragdoll-cat 的分支 `jay/demo-0922-quiz-ui-scale`（commit `9ece40147`，
從 `origin/develop` 98be5cc81 開），另存一份 patch 在 `~/Downloads/cs-demo-0922-quiz-ui-scale.patch`。

### 放哪：CS 的 `app/src/debug/` 會被融合版 debug APK 納入

`edu-droid-flutter/android/classswift/build.gradle` 的 `sourceSets.debug` 把
`${csRoot}/app/src/debug/java` 與那份 `AndroidManifest.xml` 掛進 debug variant（release 不含）。
所以 demo／除錯用的 Activity、浮動視窗都寫在 CS 的 debug sourceset 就好，**mvbf 端零改動**。
repo 裡本來就有這個用法的前例：`SketchReviewPreviewActivity`（`exported=true`，供 `adb shell am start`）。

### 進入點不要是「會留在前景的一頁」

**由來**：第一版把切換鈕做成一個正常的 Activity，結果 Jay 一按就整頁蓋在 mVB 上 ——
而 CS 的擷取出題是**從畫面上框**，於是框到的變成那一頁而不是白板內容。
之後就算離開那一頁，它仍以 `FLAG_ACTIVITY_NEW_TASK` 留著一個 task
（`dumpsys activity activities` 看得到），擷取流程切 task 時系統又把它帶回前景。

做法：

- 桌面圖示指向一個**只做事、不顯示畫面**的 Activity：`onCreate` 裡掛／收浮動視窗後立刻 `finish()`
- 那個 Activity 用 `@android:style/Theme.Translucent.NoTitleBar`，而且**必須繼承 `Activity`
  不能繼承 `AppCompatActivity`** —— AppCompat 會檢查 theme 並丟
  「You need to use a Theme.AppCompat theme (or descendant) with this activity」
- 真的需要一頁（例如並排預覽），給它 `android:noHistory="true"` ＋ `android:excludeFromRecents="true"`，
  離開就結束，不留 task
- ⚠️ 多掛一個 LAUNCHER activity 之後，`cmd package resolve-activity --brief <pkg>` 會回
  `ResolverActivity`。要起 mVB 改用 `am start -n com.viewsonic.droid/.MainActivity`

### overlay 的疊放是「加入順序」，所以你的工具會被 CS 視窗蓋住

浮動工具跟 CS 的視窗一樣是 `TYPE_APPLICATION_OVERLAY`（融合版已有 `SYSTEM_ALERT_WINDOW`，
沒有的話是靜默失敗，見 [[mvbf-fusion-overlay-permission-silent-fail]]），**同型別之間由加入順序決定
誰在上面**，沒有任何 z-order 參數可以贏過它。

- **實測**：擷取遮罩一開，浮動鈕就被壓在下面 —— 點不到，而且看起來只是「按了沒反應」。
  判斷方式：截圖取膠囊上的像素，被遮罩的暗化層蓋住時顏色會變（實測 `#3D5AFE` → `(40,59,165)`）。
- **`wm.removeViewImmediate(view)` ＋ `wm.addView(view, params)` 會重新變成最後加入的那個**，
  馬上浮回最上面（實測顏色回到 `(61,90,254)`）。
- ❌ **掛 `CSWindowManager.addOnWindowChangedListener` 去做自動置頂，實測沒有生效**
  （遮罩／出題面板開起來之後膠囊仍在下面）。原因未定案 —— 讀碼看到
  `notifyWindowCountChanged()` 只在 `addWindow` / `removeWindow` 兩處呼叫，但那兩處理論上
  createWindow 也會走到，所以更可能是通知時機早於對方真正 `addView`（加了 350ms 延遲仍失敗）。
  **要可靠就別靠事件**：定時（例如每 0.8 秒）比對 `CSWindowManager.getAllWindows().size`，
  變了就重新加入一次。
- **MediaProjection 的「Share your screen?」系統對話框在所有 app overlay 之上**，
  它出現時浮動工具一定點不到，這是正常的。

### 已經開著的視窗改不了密度，只能做等比縮放

dp／sp 在 **inflate 當下**就被解析成 px 寫進 view 的 padding、LayoutParams、字級裡，
事後改 Context 的 `densityDpi` 不會讓既有的樹重算 —— 只有重新 inflate 才會，而重建會把視窗
狀態清掉（出題面板重建＝剛擷取的那張圖沒了）。所以「按一下就即時生效」只能對 view 做
`scaleX/scaleY` ＋ 同步視窗的 `LayoutParams`：

- 幾何結果與密度加權**相同**（兩者都是所有尺寸乘同一個倍率，連換行位置都不變），
  差別只在文字是「畫完再放大」而非「以放大後密度重畫」
- 每個視窗**自己的 Context 密度就記著它是用哪個倍率建的**，所以要補的倍數算得出來不用猜：
  `視覺倍數 = 目標倍率 ÷ (視窗 Context 的 densityDpi ÷ app 的 densityDpi)`
- `view.measuredWidth` 不受 `scaleX` 影響，拿它當未縮放基準，重複套用不會累乘

### demo 用的狀態要用 `commit()` 寫，不要 `apply()`

**由來**：倍率存在 SharedPreferences，用 `apply()`（非同步）。按完 1.2x、畫面也顯示 1.2x，
但緊接著 `adb install -r` 把 process SIGKILL 掉，那次寫檔還沒落地就沒了，檔案停在更早的值。
台上同樣會踩到（mVB 被系統收掉就靜默退回）。
**驗證方式**：設一個與現值不同的值 → 立刻 `am force-stop` → `run-as <pkg> cat
/data/data/<pkg>/shared_prefs/<name>.xml`。設回**同一個值**的那次沒有鑑別力。

### 量「有沒有真的放大」用像素，不要用肉眼

截圖後量目標視窗的寬度（掃描列上最長的一段近白像素即可）。實測出題面板
**1.0x = 542 px、1.2x = 649 px，比值 1.1974** —— 差的 0.0026 是 `densityDpi` 四捨五入，
`Context.scaledBy()` 的註解本來就寫了這件事。

### 裝置：先確認簽章與記憶體

- **簽章**：機器上若是 release 簽章的版本，`install -r` 會被
  `INSTALL_FAILED_UPDATE_INCOMPATIBLE` 擋下，只能先解除安裝（**登入狀態與班級資料一起沒**）。
  原本就是 debug 簽章的機器可以直接覆蓋，登入保留。demo 前先在目標機器上試一次。
- **記憶體**：融合版 **debug** APK 有 539 MB（Dart JIT ＋ 全 ABI ＋ 除錯符號），
  Galaxy Tab S7 FE（SM-T733，3.4 GB RAM）一開就被 low-memory killer 砍掉，
  看起來像 crash 但 **logcat 沒有任何 `FATAL EXCEPTION`**，只有
  `ActivityManager_kpm: ... Killed com.viewsonic.droid_0` 與 `mem-pressure-event`。
  Pixel Tablet（7.6 GB）沒問題。見 [[fusion-debug-build-killed-by-lmk]]。

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

- `cs-review` — review 這個 repo 的程式碼時（Roborazzi fixture 與 production 的一致性、
  改視窗畫法時幾何被未加權程式碼消費、review 與既有決定衝突的處理）
- [[mvbf]] — IPC 對面那一端；fusion build 也從那邊發動
- `docs/mvb-ipc-spec.md`（該 repo）— 兩邊的訊息契約
- 動到 OLF 檔案格式語意時另外叫 `olf-vnext`
