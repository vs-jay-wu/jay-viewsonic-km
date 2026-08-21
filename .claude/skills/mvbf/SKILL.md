---
name: mvbf
description: "Use when writing, reviewing, or committing code in edu-droid-flutter (mvbf / myViewBoard Flutter app) — before any Edit/Write in that repo. Covers branch check, team-rule discovery, comment standards, headless engine limits. Examples: \"改 mvbf 的 xxx\", \"review 這個 PR\", \"幫我 commit mvbf\""
---

# mvbf（edu-droid-flutter）工作核心

repo：`Orgs/Viewsonic-EDU/edu-droid-flutter`

這是**個人層**的補充。團隊慣例的 source of truth 在該 repo 自己的 `.claude/rules/`，
**不要**在這裡複製一份（會漂移且不會被發現）。

---

## 步驟 0：先讀團隊 rules（每次都做）

那個 repo 的 rules **不會**跨 repo 自動載入——在 km 工作時它們不在 context 裡，
就算 cwd 是 mvbf 也未必載入（該 repo沒有 CLAUDE.md）。所以動手前：

```bash
ls Orgs/Viewsonic-EDU/edu-droid-flutter/.claude/rules/
```

讀完與本次任務相關的。目前有（可能增減，以 `ls` 為準）：

| 檔案 | 何時要讀 |
|---|---|
| `commit-format.md` | 要 commit 或寫 PR 描述 |
| `branch-and-delivery-workflow.md` | 開分支、交付 |
| `no-auto-format.md` | 任何改檔 |
| `exception-must-extend-vs-base.md` | 新增／修改例外 |
| `i18n-conventions.md` | 動到字串 |
| `toastification-abstraction.md` | 動到 toast／通知 |
| `aes-cipher-encryption.md` | 動到加解密 |
| `jira-status-transition-policy.md` | 要改 Jira 狀態 |

## 步驟 1：確認分支

```bash
git -C Orgs/Viewsonic-EDU/edu-droid-flutter branch --show-current
```

各 repo 分支狀態獨立且會變動。**字串比對失敗時先懷疑「是不是在錯的分支」**，
不要急著調整比對字串——那通常是「這條分支沒有該票的 commit」的徵兆。

## 步驟 2：不要引用 km 路徑

專案 repo 的任何檔案（原始碼註解、README、PR 描述、commit message、Jira 留言）
都不可以出現 km 的路徑。結論寫進註解本身，指標指向 Jira / Confluence / 同 repo 檔案。
送 PR 前：

```bash
grep -rn "docs/features/\|docs/domains/\|docs/repositories/" lib/ test/
```

---

## 註解標準（個人層）

### 描述現狀，不描述 diff

註解描述**現在的程式碼具有什麼性質**，不描述**這次改動做了什麼**。
出現「**原本**少了這個守衛」「**之前**是 X 現在改成 Y」「一直沒被發現」就是寫錯了。

為什麼：「原本」對後來的人是未定義的（哪個 commit 之前？），只能翻 history；
而且它會過期——再兩次重構就失去意義，卻沒人會回來更新。它是一則永遠不會被維護的
changelog。歷史屬於 commit message 與 Jira。

做法是**保留陷阱、丟掉敘事**，並補一句明確的「不要這樣改」：

❌
```dart
// 原本少了這個守衛：saved 是 0（偶數），build number 為奇數時就會誤判…
// 全新安裝時 box 本來就空、reset 無感，所以一直沒被發現。
```

✅
```dart
// _savedBuildNumber == 0 是「從來沒有記錄過」的哨兵值，不是真的 build number。
//
// ⚠️ 0 同時也是偶數。少了這個守衛，全新安裝一個奇數（stage）build 時
// `奇 != 偶` 會成立，被當成「stage ↔ production 切換」而清掉 activation storage。
// 不要把條件「簡化」成只比奇偶。
```

延伸：「為什麼以前沒事」是考古，不要寫；只留「為什麼現在會痛」。
「目前所有呼叫端都傳 false」可以留，但「目前」會過期——若那是刻意維持的約束，
就寫成約束。

### 沒有編譯期保護的隱性依賴，必須寫進註解

只要正確性依賴編譯器看不到、測試也不一定抓得到的前提，就在那一行旁邊寫清楚。四類：

| 類型 | 例子 |
|---|---|
| 跨 process 假設 | `static` 旗標當共享狀態——前提是 manifest 沒宣告 `android:process` |
| 跨 repo 行為契約 | 失敗不自我重排，靠呼叫端「還會再問一次」 |
| 跨語言常數 | 同一字串在 Dart 與 Java 各寫一份 |
| 順序依賴 | 「A 必須在 B 之前初始化」，型別上看不出來 |

**寫三件事，缺一不可**：前提 / 破掉的後果 / 屆時的正解。
只寫前提等於沒寫——讀的人不知道違反會發生什麼，就會覺得無所謂。

### 不要複述「程式碼已經是真相來源」的東西

判準不是「是不是清單」，而是**這段註解刪掉之後，資訊會不會遺失**。

| | 例子 | 為什麼 |
|---|---|---|
| ❌ | 白名單陣列旁寫「排除的欄位有這三個」 | **冗餘複述** —— 真相來源就是旁邊的陣列。兩份表述必然脫鉤，且脫鉤時沒人知道。刪掉不損失任何資訊 |
| ✅ | 「A31 是唯一用 store flavor 的 IFP」 | **新資訊** —— 這在該檔案（甚至整個 repo）查不到，要看 build config ＋ 出貨機型清單。刪掉就是知識遺失 |

所以「已知的例外／個案」該寫，而且往往是註解最有價值的部分。要寫的是**規則與判準**
（下一個人拿它做決定），不是**從別處衍生的結論**（會過期）。

**寫「新資訊型」的枚舉時，附上怎麼查證：**

```java
// A31 是唯一用 store flavor 的 IFP（其餘走 ifp flavor）。
// 查證：android/app/build.gradle 的 productFlavors ＋ 出貨機型清單。
```

哪天多了一台，讀者照著查一次就會發現清單過期。跟「`檔案:行號` 要附上該行內容」同一招：
**不求指標不壞，只求壞掉時會被發現。**

---

## 引號：新程式碼一律單引號

`analysis_options.yaml` 裡 `prefer_single_quotes` 是**關的**，但那不代表不在意——
它是**分階段遷移**：全開會噴 **2282** 個（`lib/` 實測），一次 `dart fix` 的巨大 diff
既難 review 也容易與他人的分支衝突。**收斂到夠少之後就會打開 lint。**

所以規則是：

| 情境 | 做法 |
|---|---|
| **新增／修改到的行** | 一律**單引號**，不管周圍是什麼 |
| 沒動到的行 | **不要**碰（見該 repo 的 `no-auto-format.md`） |
| 字串本身含單引號 | 用雙引號避免 escape（lint 自己的例外） |
| 內插 `${}` 裡的嵌套字串 | 用雙引號即可，**lint 不會抓**（已實測確認） |

同一個 statement 裡混用（如 `get("x", defaultValue: '')`）是最糟的——
讀的人會以為兩種引號有語意差別。既有程式碼裡很多這種，新寫的不要再產生。

### 怎麼驗「這次的改動有沒有照規則」

不要靠肉眼，也不要為了檢查就把 lint 常駐打開。暫時啟用 → 只看落在本次改動行上的
命中 → 還原：

```yaml
# analysis_options.yaml
linter:
  rules:
    prefer_single_quotes: true    # ⚠️ 必須放在 rules: 底下（4 空格）
```

⚠️ **縮排放錯會被靜默忽略**：放在 `linter:` 底下（2 空格）yaml 不會報錯，
`dart analyze` 也不會有任何提示，只是規則從未生效——踩過一次。

```bash
fvm dart analyze <改動到的檔案…> | grep prefer_single_quotes
```

再把命中的行號與 `git diff -U0 HEAD -- <file>` 的 `@@ +start,count @@` 交集，
只修落在新增行上的那些（未追蹤的新檔則全檔都算）。改完**記得還原
`analysis_options.yaml`**，用 `git diff -- analysis_options.yaml` 確認沒有殘留。

---

## Headless engine 的能力邊界

本 app 除了 `MainActivity` 的 engine，還有不開 UI 的 headless engine
（VSFT-9654），跑獨立的 Dart entry point，**不執行 `main()`**。

### 可以依賴 plugin，不可以依賴 Activity 手寫的 MethodChannel

`new FlutterEngine(context)` 會自動註冊所有 plugin（實測 10–26ms），
所以 `path_provider` / `device_info_plus` / `sqflite` 都能用。
但 `MainActivity.configureFlutterEngine()` 裡**手寫**的那二十幾個 channel
（`detectChromeos`、`app_update` 的 `getPreference`…）**不存在**，呼叫會丟
`MissingPluginException`。

⚠️ **危險在於它安靜**：這些呼叫點常各自有 try/catch（本來是為了 Windows），
例外被吞掉、只留一行 log，**外層函式繼續往下跑**。實際評估過的例子：

```
transferNativeData() {
  await _transferNativePreferences();   // headless 丟例外，被內層 catch 吞掉
  await _transferNativeDatabaseData();  // 照樣執行
  await _removeMvbaData();              // 照樣執行：舊資料被刪
}
```

→「設定沒搬成、舊資料卻已刪除」，**不可逆**。

做法：在 headless 重用函式前逐一確認每個 channel 是 plugin 還是手寫的；
需要更細的粒度就抽出更細的入口，不要整塊呼叫。

### 不要在 headless 呼叫「有寫入副作用的一次性初始化」

`ApplicationInfo.ensureInitialized()` 結尾會寫 `savedBuildNumber` 與 `isFirstInstall`。
headless 一碰就把「第一次啟動」這個一次性事件消耗掉，使用者真正開啟 app 時
`isNewVersion == false`，掛在它下面的升級／遷移流程全部不執行。
判斷條件改用無副作用的來源。

### Headless 對呼叫端沒有回傳管道

觸發用的 `ContentProvider.call()` 是非阻塞的，engine 在它回傳**之後**才起。
唯一管道是寫入共享狀態、讓呼叫端下次查詢讀到。要用時：

- **只曝光「需要外部介入才會改變的狀態」**（例如「必須有人親自開一次 app」）
  ——那會**改變呼叫端的動作**。
- **不要曝光會自癒的失敗**（engine 起不來、timeout）。呼叫端對它們唯一正確的動作
  都是稍後重查，曝光只會誘使人寫成「放棄」的依據。診斷靠 log，那裡還有時間戳。
- 狀態欄位用**封閉詞彙表**，不配自由文字 message。需要更多資訊時加具名結構化欄位。

---

## 背景工作：`JobService` 與 job id

背景工作**優先用 WorkManager**（它自己管 job id、重試、約束）。自己寫 `JobService`
只在 WorkManager 做不到時——目前 repo 內唯一的案例是 VSFT-9654：需要在 receiver 的
數秒限制外啟動 Flutter engine。

新增自己的 `JobService` 時：

1. **先看現有的 id**：
   ```bash
   grep -rn "JobInfo.Builder\|JOB_ID" android/app/src/main/java/
   ```
2. **id 寫成可以被 grep 的整數**，不要用底線分隔（`96540001`，**不是** `9654_0001`）。
   兩者等價，但下一個人是用數字搜尋來確認有沒有重複的——底線讓搜尋落空，
   而落空看起來就像「沒有重複」。
3. **避開小數字**（`1`、`2`…）。WorkManager 底層也是 JobScheduler、預設從小數字遞增，
   撞號的表現是**靜默互相取代**，兩邊都不會報錯。
4. **id 的來源慣例**：票號 ＋ 序號（如 VSFT-9654 → `96540001`）。這只是慣例、
   不是規範——所以**必須在常數上加註解寫出完整票號**，因為 `9654` 單看認不出是什麼。

### 什麼時候該建 `JobIds` 常數檔

**出現第二個自己寫的 `JobService` 時。** 現在只有一個，建了反而會腐化
（沒人記得它存在，下一個人照樣在自己的 class 裡寫 private 常數），
給不了「全 app 唯一」那個保證，只會多一個「看起來有在管」的假象。

真要結構性地防撞函式庫，該做的不是登錄檔，而是
`WorkManager.Configuration.Builder.setJobSchedulerJobIdRange(…)` 把 WorkManager
圈在指定區段。代價是要自訂 `Configuration.Provider`、動到 app 全域初始化——
為一兩顆 job 不值得，job 變多了再說。

---

## Build 注意事項

含 ClassSwift 的 flavor（`ifp` / `edla`）需要 CS checkout：

```bash
./gradlew ... -PclassswiftRepoPath=/Users/jay.wj.wu/ProjectsWork_GitHub/Orgs/Viewsonic-EDU/ragdoll-cat
```

沒帶 property 會停在 configuration 階段（`settings.gradle` assert「ClassSwift
尚未取得，或缺少同步標記」）。**先補 property，不要去跑 `tools/sync-classswift.sh`**
——那會建出第二份 checkout，跟本機在測的不是同一份。要跑先問。

只驗編譯不必建整個 APK：

```bash
./gradlew :app:compileEdlaDebugJavaWithJavac -PclassswiftRepoPath=…
```

Dart 側用 Flutter MCP 的 `analyze_files`，比 `flutter analyze` 快。

---

## 相關 skill

- `mvbf-review` — review（稽核指令、自己改動要多問的問題、如何驗證別人的 review 意見）
- `mvbf-commit` — commit 與 PR 描述
- `handoff-docs` — 對外文件（PR 描述、Jira 留言、跨團隊規格／prompt）。不限 repo
