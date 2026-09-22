---
name: mvbf
description: "Use when writing, reviewing, or committing code in edu-droid-flutter (mvbf / myViewBoard Flutter app) — before any Edit/Write in that repo. Covers branch check, team-rule discovery, comment standards, headless engine limits, and hotfix backport / release judgement calls. Examples: \"改 mvbf 的 xxx\", \"review 這個 PR\", \"幫我 commit mvbf\", \"出 hotfix\""
---

# mvbf（edu-droid-flutter）工作核心

repo：`Orgs/Viewsonic-EDU/edu-droid-flutter`

這是**個人層**的補充。團隊慣例的 source of truth 在該 repo 自己的 `.claude/rules/`，
**不要**在這裡複製一份（會漂移且不會被發現）。

---

## 步驟 0：先讀團隊 rules（每次都做）

那個 repo 的 rules **不會**跨 repo 自動載入——在 km 工作時它們不在 context 裡，
就算 cwd 是 mvbf 也未必載入。所以動手前：

```bash
ls Orgs/Viewsonic-EDU/edu-droid-flutter/.claude/rules/
cat Orgs/Viewsonic-EDU/edu-droid-flutter/CLAUDE.md
```

> 該 repo **有** `CLAUDE.md` 與 `AGENTS.md`（2026-09-17 於 `origin/master` 6dbcc8516 實測）。
> 兩份內容相同：**OLF 格式法（WRAP track）**，守門規則是 `.claude/rules/olf-format.md`。
> 只有動到 OLF 讀寫／匯入匯出才需要細讀，但先掃一眼才知道這次有沒有被它管到。

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
| `olf-format.md` | 動到 OLF 讀寫／匯入匯出（根 `CLAUDE.md` 那條格式法的守門規則） |

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
| ❌ | 註解裡抄**別的 class 的常數值**（色碼、尺寸、id） | **跨檔冗餘複述** —— 那個值改了不會有人回來更新這裡，而且脫鉤時沒有任何徵兆。要寫的是**判準**（「這塊底色畫自 X、不隨主題變動」），不是值 |
| ✅ | 「A31 是唯一用 store flavor 的 IFP」 | **新資訊** —— 這在該檔案（甚至整個 repo）查不到，要看 build config ＋ 出貨機型清單。刪掉就是知識遺失 |

所以「已知的例外／個案」該寫，而且往往是註解最有價值的部分。要寫的是**規則與判準**
（下一個人拿它做決定），不是**從別處衍生的結論**（會過期）。

**由來（跨檔那列）**：VB-2267。手掌擦的註解原本抄了 `VSGlobalColors` 的三個色碼
（`unknownGray1 #fafafa` 等），Jay 指出：「你引用了很多這種色碼，而且是在其他 class，
這樣其他地方如果改了，也要改這邊的值？如果沒改動，註解就會錯」。改成寫不變條件 ——
「`_buildEraserImage` 整支都不讀 `vsColors`／`Theme`」—— 色票怎麼調都不影響這句的真偽，
再附一行 grep 指令讓它壞掉時會被發現。

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

### ⚠️ 量 base 的 analyze 數字時，不要把 base 版本蓋回工作檔

要比「我的改動有沒有新增告警」得跑兩次 analyze。**不要**用
`git show HEAD:<file> > <file>` 這種就地覆蓋的作法量 base —— 那會**無聲地洗掉
自己還沒 commit 的編輯**（`dart analyze` 只吃路徑，覆蓋成功不會有任何提示）。

改用不碰工作檔的作法：

```bash
# 把 base 版本放到 repo 外，在那裡量
mkdir -p /tmp/base && git show origin/master:lib/foo.dart > /tmp/base/foo.dart
fvm dart analyze /tmp/base/foo.dart | tail -2
```

`/tmp` 的單檔 analyze 會少掉專案的 `analysis_options.yaml`，數字未必可比 ——
**真的要精準比對就先把改動 commit 起來**（之後要改再 amend），
用 `git stash` 搬移是最差解（stash stack 跨 worktree 共用，可能動到別人的暫存）。

**由來**：VB-2193。為了量 lint 差異把兩個 base 檔 `cp` 回 `lib/`，把當次的編輯整個洗掉，
只能照 diff 重做一次。徵兆：`git diff` 突然變空、或只剩一部分改動。

---

## 寫測試

### ⚠️ `testWidgets` 裡做真實 I/O 必須包 `tester.runAsync()`

`testWidgets` 跑在 fake async 下，**真實檔案 I/O 的 Future 永遠不會完成**。
直接 `await` 一個會讀寫磁碟的函式，測試會一路卡到 flutter_test 的預設上限：

```
10:00 +0 -1: <測試名> [E]
  TimeoutException after 0:10:00.000000: Test timed out after 10 minutes.
  dart:isolate  _RawReceivePort._handleMessage
```

**看到整整 10 分鐘的 TimeoutException，先想這條** —— 不是死結、不是效能問題，
也不要去調 `timeout`。把呼叫包進 `runAsync`：

```dart
List<Foo>? result;
await tester.runAsync(() async {
  result = await thingThatTouchesDisk(...);
});
expect(result, ...);
```

**判斷是不是這條**：把同一段邏輯改用普通 `test()`（沒有 fake async）跑一次，
會過就是它。純 `test()` 沒有 `BuildContext`，所以需要 context 的只能用
`testWidgets` ＋ `runAsync`。

⚠️ `runAsync` 裡**不能**呼叫 `tester.pump()`，所以「在非同步作業進行到一半時
改變 widget 樹」做不到 —— 依賴那種時序的守衛就會測不到（見
`cross-system-claims.md` 的變異測試第三個確認）。

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

## Tooltip 與 semantics

### `VSTooltip` 只在**接了滑鼠**時 hover 觸發 —— 純觸控裝置驗不到

`lib/widget/custom_tooltip.dart` 把 `triggerMode` 寫死為 `TooltipTriggerMode.manual`
（原註解：`// Prevent trigger from long press`），剩下唯一的路徑是 hover，而那條還掛在
`_mouseIsConnected` 底下。**所以整個 app 的 tooltip 在純觸控機上一個都不會出現。**

**徵兆**：長按按鈕只會觸發它本來的動作（跳選單、開視窗），沒有任何 tooltip。

**判準**：要在機器上驗 tooltip 就得**接一隻滑鼠**，或改用 IFP。看不到時先用
**既有的**按鈕對照一次（例如 file manager，它本來就有 tooltip）——對照組也看不到，
就是觸發模式問題，不是你的改動壞了。證據等級：實測（2026-09-14，Pixel Tablet）。

延伸的設計判準：**tooltip 不可以承載操作所需的必要資訊**，因為觸控使用者永遠看不到。
必要資訊要放在 `semanticsLabel` 或可見的 UI 上。

### ⚠️ `VSTooltip` 內部是 `ExcludeSemantics`，會吃掉 child 的點擊語意

`custom_tooltip.dart` 的 `VSTooltip.build` 外層包了 `ExcludeSemantics`，砍的是**整棵子樹**。
把它包在一個自訂控制項外面，底下 `GestureDetector` 的 tap 語意會一起消失 ——
**螢幕閱讀器使用者按不動那個元件，而畫面上完全看不出異狀。**

正確作法（與 `lib/widget/common/vs_icon_button.dart` 既有寫法一致）：
**VSTooltip 只負責視覺，語意由呼叫端自己包一層 `Semantics` 補回來**，而且各欄位分工固定：

| 欄位 | 放什麼 |
|---|---|
| `identifier` | QA 定位字串（`[QA][main toolbar: …]`） |
| `label` | 使用者聽得懂的名稱（已翻譯） |
| `tooltip` | tooltip 文字；與 `label` 相同時省略，避免念兩次 |
| `enabled` / `selected` / `onTap` | 狀態與動作（`onTap` 就是被 ExcludeSemantics 吃掉、要補回來的那個） |

順序是 `Semantics( child: VSTooltip( child: 實際控制項 ) )` —— 包反了等於沒包。

**這條值得配一條測試釘住**，因為壞掉沒有視覺徵兆：

```dart
final node = tester.getSemantics(find.byType(MyWidget));
expect(node.getSemanticsData().hasAction(SemanticsAction.tap), isTrue);
```

> `VSTooltip` 那層 `ExcludeSemantics` 其實**過寬**：它 fork 的 `CustomTooltip` 本身就有
> `excludeFromSemantics` 參數（`custom_tooltip.dart` 的 `Semantics(label: excludeFromSemantics ? null : _tooltipMessage, child: widget.child)`），
> 只拿掉 tooltip 自己的 label、保留 child 語意。改它要驗 17 處呼叫端，
> **2026-09-14 與 Jay 確認先不開單**；在它被改掉之前，照上面的作法走。

### `semanticsId` 不是 `semanticsLabel`

`semanticsId` 是 QA 自動化定位用的字串，塞進 `label` 會被螢幕閱讀器逐字念出來。
repo 裡有不少 legacy 是這樣寫的（例：`ClassSwiftLaunchToggle` 曾經
`Semantics(label: widget.semanticsId)`）—— **legacy 這樣寫不構成新程式碼照做的理由**
（Jay 2026-09-14 原話：「我知道有很多 legacy 是這樣做，但新的請用正確做法做」）。

另一個同型錯誤是**多包一層 `Semantics`**：多一層就多一個節點，同一個控制項會被讀成兩個。
語意節點只留一個。

由來：VB-2213 / PR #271。

---

## 圖片資產：App 讀的不是 `.svg`

### 管線

執行期只讀**編譯後**的 `images/dist/<name>.svg.vec`（`UtilityHelper.getSvgVectorPath`），
原始 `.svg` 從來不會被打開。新增或改圖：

```bash
mkdir -p tmp_images && cp <new>.svg tmp_images/
make images    # vector_graphics_compiler → images/dist/*.svg.vec，再把 svg 搬進 images/
```

`tmp_images/` 是 gitignore 的暫存區，`make images` 跑完會自己清空。

⚠️ **改了 `.svg` 卻沒跑 `make images`：測試全綠、App 顯示舊圖**，沒有任何徵兆。
驗 dist 有沒有同步（不需要人眼）——重編到暫存目錄比 sha：

```bash
fvm flutter packages pub run vector_graphics_compiler --input-dir <tmp> --out-dir <out>
shasum <out>/<name>.svg.vec images/dist/<name>.svg.vec   # 相同 = 同步
```

編譯是決定性的：同一份 svg 重編會 **byte-identical**（VB-2267 實測，含對照組）。

### `.vec` 裡的顏色**可以**用位元組驗

填色編在**檔頭的顏色表**：offset 15 起、stride 10、每格 **3 byte 且是 BGR**。
VB-2267 的亮暗兩版實測（同一份幾何、只換色 → 兩檔等長 8601，只差 21 個 byte）：

```
offset  15/25/35/45/55/65/75（7 格）
light:  25 00 db · 25 00 db · 25 00 da · 27 00 db · 26 00 d8 · 24 00 d9 · 27 00 d8
dark:   ff ff ff × 7
```

BGR 反轉後正好是亮色 SVG 裡那六個紅（`#db0025` 佔兩格）。

**寫斷言不要寫死位移**（位移隨檔案與 compiler 版本而異）。驗不變式本身就夠：
兩檔**等長**、**有差異**、且**每個差異位置在暗版都是 `0xff`**。這條擋得住
「換錯顏色後重編」與「.vec 被換成別份美術」，實測兩種變異都會紅。

> ⚠️ **我一開始下錯結論。** 掃 ARGB uint32 掃不到東西（白版紅版數字一模一樣），
> 我就寫下「`.vec` 的顏色沒辦法用位元組驗」—— 實際上只是**編碼假設錯了**（是 3-byte BGR）。
> 是 mvbf PR #279 的 reviewer 指出來的。
> **「我的探針壞了」不等於「這件事驗不了」**，見 `cross-system-claims.md` §5。

### 亮／暗雙檔：`_edu` 後綴慣例

`UtilityHelper.getThemeFileName(base, isLight)`：亮色 → `${base}_edu`、暗色 → `base`。

| 要什麼 | 用哪個 |
|---|---|
| 跟隨主題 | `VSThemeSvgImage` / `VSThemeSvgIcon`（內部走 `theme.getSvgAssetPath`） |
| 不分主題 | `VSSvgImage` / `VSSvgIcon` |
| 預載清單 | `ImageCollection` 的 `themeSvgs` vs `noThemeSvgs`，要跟上面對齊 |

⚠️ **`VSIcons` 的常數必須是不含 `_edu` 的 base name，否則整個機制靜默空轉。**
`myViewBoard_logo` 曾經寫成 `'myViewBoard_logo_edu'`，等於直接當檔名用，
`getThemeFileName` 在兩個主題回同一支檔 —— 畫面照常顯示、零錯誤訊息。
**這就是 VB-2267 的根因。**

**徵兆**：常數值自己帶了 `_edu` / `_on` / `_off` 後綴，卻被標成 `/// theme`。

### 要讓一張圖跟著主題翻色之前，先追它畫在什麼底上

**底不跟著主題翻，圖就不能翻。** repo 裡有些表面的顏色是寫死的（直接用
`VSGlobalColors.*` 或裸 `Colors.*`），不走 `vsColors` token，暗色主題下不會變暗。
把白版圖畫上去等於消失，而且**畫面不會有任何錯誤徵兆**。

對**每一個**消費點各查一次（不能只查一個就推論其他的）：

```bash
grep -n 'vsColors\|Theme\.of' <畫那塊底色的檔>   # 沒命中 = 這塊不隨主題變
```

VB-2267 實例：標題列 / 設定▸關於 / 登入框三處的底都是 `vsColors.containerBackground`
（暗色會變暗）✅ 可以翻；手掌擦 `eraser_palm_helper.dart` 全檔零 `vsColors`
❌ 必須固定取亮色版。

---

## Build 注意事項

含 ClassSwift 的 flavor（`ifp` / `edla`）需要 CS checkout：

```bash
./gradlew ... -PclassswiftRepoPath=/Users/jay.wj.wu/ProjectsWork_GitHub/Orgs/Viewsonic-EDU/ragdoll-cat
```

沒帶 property 會停在 configuration 階段（`settings.gradle` assert「ClassSwift
尚未取得，或缺少同步標記」）。**先補 property，不要去跑 `tools/sync-classswift.sh`**
——那會建出第二份 checkout，跟本機在測的不是同一份。要跑先問。

### ⚠️ ClassSwift 過了還會卡第二個外部相依：Finch

`settings.gradle` 有**兩份平行的三層驗證**（ClassSwift 與 Finch），補了
`-PclassswiftRepoPath` 只解決第一個，接著會停在：

```
Settings file '…/android/settings.gradle' line: 177
    Finch 尚未取得，或缺少同步標記。
    請執行：./tools/sync-finch.sh
```

Finch 的 checkout 位置是 repo 根的 `third_party/finch`（gitignore），**新 worktree 沒有**。
兩條路：

| 做法 | 什麼時候用 |
|---|---|
| `./tools/sync-finch.sh` | 首選。依版控的 `finch-ref.properties` clone，拿到的就是釘選版 |
| `-PfinchRepoPath=<路徑>` | 腳本拉不到 ref 時的退路。**會跳過版本驗證** |

⚠️ **不要直接把 `-PfinchRepoPath` 指向 `Orgs/Viewsonic-EDU/edu-vbos-finch`。**
那份 checkout 的 HEAD 是它自己的最新 tag，跟 `finch-ref.properties` 釘的**不是同一版**
（2026-09-18 實測：ref 釘 `vb-2077-mvb-sync-20260914`，本機 HEAD 已是 `…-20260917`）。
編錯版介面的後果見該檔檔頭第 4 類：**bindService 成功、呼叫送得出去，直到對方
unmarshal 才丟 BadParcelableException，而且只在裝著那版 Finch 的機器上發生**。

要用退路就開一個停在釘選 SHA 的 worktree（不動 Jay 的 checkout）：

```bash
git -C <edu-vbos-finch> worktree add --detach <同層路徑> <釘選的 SHA>
```

**另外**：`sync-finch.sh` 會因為「釘選的 tag 在遠端不存在」而失敗
（`錯誤：在 Finch 找不到 ref「…」`）。那不是本機環境問題 —— 是
`finch-ref.properties` 指向一個已被遠端刪掉／取代的 tag，代表**當下的
`origin/master` 從乾淨 clone 建不起來**。先用 `git ls-remote --tags origin 'vb-2077-*'`
確認，再回報給 Jay，不要自己改 ref 檔。

只驗編譯不必建整個 APK：

```bash
./gradlew :app:compileEdlaDebugJavaWithJavac -PclassswiftRepoPath=…
```

Dart 側用 `fvm dart analyze <檔案>`（**不要用 Flutter MCP**，見 km `CLAUDE.md`）。

### ⚠️ 要**安裝**的 APK 用 `fvm flutter build apk`，不要直接下 `./gradlew assemble`

版號是 flutter 注入的（`flutter build` 會把 `flutter.versionCode` / `flutter.versionName`
寫進 `android/local.properties`，gradle 再讀它）。**直接跑 `./gradlew assembleEdlaDebug`
繞過那一步，APK 會變成 `versionCode=1 / versionName=1.0`**，而且 build 完全成功、
沒有任何警告。

實測後果（2026-09-14，VB-2213，Pixel Tablet）：app 以為有新版，一開就跳
`Whiteboard Updater`「The new version has been downloaded. Do you want to install it now?」
—— **按下 Update 會把你正在測的 build 換成 OTA 版**，而你會以為自己還在測剛才那份。

```bash
# 驗證裝上去的是哪個版號
adb -s <serial> shell dumpsys package com.viewsonic.droid | grep -E 'versionCode|versionName'
```

`./gradlew` 直接下仍然適合**只驗編譯**（`:app:compileEdlaDebugJavaWithJavac`），
那種情況產物不會被安裝，版號無所謂。

flutter 這條路要傳 gradle property 用 `--android-project-arg`：

```bash
fvm flutter build apk --debug --flavor edla \
  --android-project-arg=classswiftRepoPath=/Users/jay.wj.wu/ProjectsWork_GitHub/Orgs/Viewsonic-EDU/ragdoll-cat
```

### 新開的 worktree 要先補 `.fvm`

`.fvm/` 被 gitignore（`.gitignore:17`），所以 `git worktree add` 出來的新工作目錄**沒有它**，
`make test` / `flutter` 會落到系統版本。`.fvmrc` 有進版控，版本資訊還在，補一次即可：

```bash
fvm use --skip-setup     # 讀 .fvmrc，建 .fvm/flutter_sdk 符號連結
```

**徵兆**（實測，VSFT-6704）：

```
The current Flutter SDK version is 3.27.1.
Because droid requires Flutter SDK version >=3.41.5, version solving failed.
```

看到「版本解析失敗」不要去動 `pubspec.yaml` 的版本約束——那是 SDK 選錯了。

⚠️ `fvm use` 會**把 `.fvmrc` 結尾的換行吃掉**，產生一行純雜訊 diff。跑完
`git checkout -- .fvmrc` 還原，別讓它混進 commit。

⚠️ **起點沒有 `.fvmrc` 時（例如從舊 production tag 開的 hotfix 分支），`fvm use <版本>`
會改寫 `.gitignore`** —— 把既有的 `.fvm` / `.fvmrc` 兩行刪掉，在檔尾補一個**沒有結尾換行**
的 `.fvm/`。後果是 `.fvmrc` 從被忽略變成 untracked，`git status` 不再乾淨。

實測（2026-09-18，hotfix/3.10.207 的 backport worktree，起點 tag `3.10.206`
＝ `.fvmrc` 進版控之前的 `0b4c87c89^`）：

```
 M .gitignore
?? .fvmrc
```

`verify_hotfix_backport.sh` 的「工作目錄乾淨」會因此變紅，而它給的建議是
「先 commit 或 stash」—— **照做就是把 fvm 的副作用 commit 進 backport 分支**，
而那條分支的全部賣點正是「只有刻意挑進來的東西」。正確做法是還原：

```bash
git checkout -- .gitignore   # .fvmrc 會自動變回被忽略
```

**徵兆**：backport 分支上突然有 `.gitignore` 的改動，而你這輪根本沒碰它。

### 新開的 worktree 也沒有 `gradlew`

同樣是 gitignore（`android/.gitignore` 列了 `/gradlew`、`/gradlew.bat`、
`gradle-wrapper.jar`、`gradle-wrapper.properties`）。**徵兆是 `exit 127`／
`no such file or directory: ./gradlew`** —— 不是 build 壞了。從主 checkout 複製一份：

```bash
cp <主checkout>/android/gradlew android/
cp <主checkout>/android/gradle/wrapper/gradle-wrapper.* android/gradle/wrapper/
```

### ⚠️ keystore 路徑會不會壞，取決於 worktree 放在**哪一層**

`android/app/build.gradle` 用相對路徑找 keystore
（`rootProject.file('../../playstore_keystore/…')`、`file('../../../playstore_keystore/…')`、
ifp 的 `file('../../../mvbf_keystore/MVBA_PlatForm.jks')`）。**判準是目錄深度，不是
「有沒有用 worktree」**：

| worktree 位置 | 結果 |
|---|---|
| **同層**（`Orgs/Viewsonic-EDU/<repo>-<topic>`，即 `cross-repo-workflow.md` §4 建議的放法） | 深度與主 checkout 相同 → **路徑解析得到，照常簽章** |
| `.claude/worktrees/<name>`（session 綁定那種） | 多墊兩層 → 解析到不存在的路徑，packaging 倒 |

同層那種**已實測可行**（2026-09-14，VB-2213）：`cd android/app` 後
`[ -f ../../../mvbf_keystore/MVBA_PlatForm.jks ]` 為真，`:app:packageEdlaDebug` 正常產出
可安裝的 APK。所以**不要**因為「這是 worktree」就先去改 build.gradle ——
先用那行 `[ -f ... ]` 測一次。

下面講的是**深一層那種**才會遇到的情形，`:app:packageStoreDebug` 會倒在：

```
property 'signingConfigData.storeFile' specifies file
'…/.claude/worktrees/playstore_keystore/viewsonic.keystore' which doesn't exist
```

**兩個容易誤判的點：**

1. **`storeDebug` 也會倒。** store / open 的 **debug** buildType 一樣用
   `signingConfigs.googlePlayRrelease`（只有 ifp / edla 的 debug 走 ifp keystore）。
   以為「改用 debug 就能繞過」是錯的——我踩過。
2. **R8 不受影響。** 失敗點在 packaging，`minifyStoreReleaseWithR8` 與
   resource shrinking 都已經跑完 → 想驗 R8 或量 APK 體積**不需要**解決簽章問題，
   從 `build/app/intermediates/dex/` 與 `optimized_processed_res/` 直接量即可。

要真的產出 APK，就**暫時**把那兩條路徑往上加幾層（層數自己算，不要猜：
`python3 -c "import os;print(os.path.normpath(os.path.join(os.getcwd(),'<相對路徑>')))"`），
build 完**立刻還原**並用 `git diff -- android/app/build.gradle | grep -i keystore` 確認沒殘留。
這不違反 `excluded-dirs.md`：只改指向，沒有讀取、複製或搬移 keystore 本身。
不想動版控檔就改從主 checkout build。

### `ifp` flavor 裝不到一般 Android 裝置

`android/app/src/ifp/AndroidManifest.xml` 宣告 `android:sharedUserId="android.uid.system"`，
那需要平台簽章。裝到一般機器（實測：Pixel Tablet）會是：

```
INSTALL_FAILED_UID_CHANGED: Package com.viewsonic.droid shared user changed
from <nothing> to android.uid.system
```

要在非 IFP 機器上驗畫面，改用 **`edla`**（含 ClassSwift，仍需 `-PclassswiftRepoPath`）
或 **`open`**（不含 ClassSwift）。查證：`grep -rn sharedUserId android/app/src/*/AndroidManifest.xml`。

---

## vsColors：`*OnPrimary*` 不是「一般的 disabled 色」

`textOnPrimaryDisable` 的語意是「**疊在 primary 按鈕底色上**的 disabled 文字」，
它跟 `actionButtonBackgroundPrimaryDisable` 成對（唯一既有用途在
`lib/theme/utils/utils.dart` 的 `ElevatedButtonThemeData.disabledForegroundColor`）。

**light theme 的值是 `#ffffff` 純白**——套到白色 surface 上的選單列，整列會直接消失。

| 用途 | token | light | dark |
|---|---|---|---|
| surface 上的一般文字 / 圖示 | `textPrimary` / `iconPrimary` | `#333333` / `#4d4d4d` | `#ffffff` |
| **surface 上的 disabled** | **`textDisable` / `iconDisable`** | `#c2c2c2` | `#919191` |
| 疊在 primary 按鈕上的 disabled | `textOnPrimaryDisable` | `#ffffff` | `#919191` |

**判準**：挑 disabled token 時，先看它平常成對的「一般狀態」token 是哪個——
這一列平時用 `iconPrimary`，disabled 就該用 `iconDisable`，不是名字裡有 Disable 就能用。

**徵兆**：查到某個 disabled token 在 light theme 是純白或純黑，那它幾乎一定是
「on 某個底色」的 token，不是給 surface 用的。

查證：`grep -n '<token>' lib/theme/colors/vs_light_colors.dart lib/theme/colors/vs_dark_colors.dart`
再把色票代號拿去 `vs_global_colors.dart` 換成實際色值。

### 由來

VSFT-6704。Jay 指定用 `vsColors.textOnPrimaryDisable`，查證後發現在白底選單上會看不見，
回報後確認是他記錯，改用 `textDisable` / `iconDisable`。

---

## i18n：POEditor 流程的實務補充

團隊的規範在該 repo 的 `.claude/rules/i18n-conventions.md` 與
`.claude/skills/poeditor-i18n-workflow/`，**動手前兩份都要讀**。以下只記實際跑過一輪
（VSFT-6704）才知道的事。

> ⚠️ **這一段只適用 mvbf（POEditor `754682` ＋ `arb`）。** ClassSwift Android 是
> **另一個專案** `825204` ＋ `android_strings`，格式、語系清單、plural 語意、同步時機
> 全都不同（例如 Android 的值有一層轉義編碼，而 arb 沒有）。動到那邊看 [[cs]] skill
> 的「i18n：POEditor ↔ `values-*/strings.xml`」，不要把這裡的做法搬過去。

### ⚠️ 兩份團隊文件對「AI 要不要寫 term comment」講反了

| 文件 | 說法 |
|---|---|
| `.claude/rules/i18n-conventions.md` | AI **負責**撰寫 comment，英文，末行必須是 `(This comment is AI-generated.)` |
| `.claude/skills/poeditor-i18n-workflow/SKILL.md` | AI **不負責** comment，由工程團隊在網頁補（可貼圖自動上傳 S3），只有 plural term 例外 |

兩份都由同一筆 commit（`a36a2158b`, 2026-04-09）最後修改，**分不出新舊**。

**這條應該上游到 `edu-droid-flutter` 讓團隊裁定，待與 Jay 確認。** 在那之前：動手前先問，
或照 `rules/` 那份寫（格式較嚴、有 AI 標記，事後要撤掉只是一次 API call）。

### pipeline 可以直接 dispatch 在自己的分支上

`poeditor-i18n-workflow` skill 寫的是「Azure DevOps 觸發 → merge 回分支」，但 repo 裡有
對應的 GitHub Actions（`.github/workflows/poeditor.yml`，`workflow_dispatch`），它會
checkout 觸發時指定的 ref 並把結果 commit 回**同一條分支**：

```bash
gh workflow run poeditor.yml --ref <你的分支>
```

bot 會產出 `BOT: Auto Apply POEditor changes`（含 `lib/l10n/*.arb` 與 `lib/generated/`），
`git pull` 就好，**不需要 merge 回分支**。這樣也天然滿足「非 master 分支不要自己 commit arb」。

### 它跑在 self-hosted runner 上，可能排很久

`runs-on: [self-hosted, macos, team-right]`。實測有一次排隊 30 分鐘以上、job 完全沒開始。

**判斷「是不是我的問題」**：看同一個 pool 上有沒有別人的 run 也卡著。

```bash
gh run list --limit 10 --json status,name,createdAt
```

若 GitHub-hosted 的 Unit Test 照常跑完、而 self-hosted 的（Daily Build、POEditor）
全都卡在 queued，那就是 runner 離線或滿載，跟你的改動無關——等或找人重啟，不要改 workflow。

### `add_comment` 回報 `updated=0` 不代表失敗

`parsed=1, updated=0` 的 `updated` 指的是「覆蓋掉幾筆既有 comment」，新寫入的算 0。
要確認就直接回查，不要重送：

```bash
curl -s -X POST https://api.poeditor.com/v2/terms/list \
  -d api_token=<token> -d id=<project_id>
```

### term 命名

跟著既有的走：`toast_feature_not_support`、`toast_file_file_not_support` 用的是
`not_support` 而**不是** `not_supported`。新增前先
`list_terms(search: ...)` 看鄰居怎麼取。

**新增之前先確認同義的 term 是否已存在。** VB-2213 原本要為 toggle 的無障礙標籤開
`Quiz Tool` 的新 term，`list_terms(search: 'quiz_tool')` 一查發現 `quiz_tool` 早就有、
arb 裡也在用，直接沿用即可（規範原話：「若已有合適的 term，可直接採用，無需新增」）。

### 文案沿用另一個產品的既有字串時，翻譯可以一起搬（例外，需 Jay 同意）

常規是**工程只提供英文**，其他語言由翻譯人員處理。但當新 term 是**刻意沿用 ClassSwift
（Quiz Tool）端既有 UI 字串**時，那些字串在 CS 已經翻好 41 種語言，重新送翻只會得到
**兩個產品對同一個視窗講不同話**的結果。

Jay 2026-09-14（VB-2213）裁定這種情況可以直接搬：「因為有 3 個 term 都是沿用 cs 的
window 已有的，順手將英文以外的翻譯都補上吧（這次是例外，我知道規則是寫我們只負責英文）」。

**適用判準**（三個都成立才算）：

1. 英文字串與 CS 端**逐字相同**；
2. 指的是**同一個東西**（同一個視窗／同一個動作），不是碰巧同字；
3. 有 Jay 或 spec owner 點頭 —— **這是個案例外，不是新常規**。

做法：從 `ragdoll-cat/app/src/main/res/values-*/strings.xml` 取，語系代碼要轉換
（`zh-rCN`→`zh-Hans`、`zh-rTW`→`zh-TW`、`in`→`id`，其餘相同；`values-night` /
`values-land` / `values-v23` / `values-w*` 要排除，那些不是語系）。
逐語系打 POEditor `translations/add`（它**不覆蓋**既有翻譯，安全）。

⚠️ **CS 有的語系不一定等於 POEditor 有的**，反之亦然。VB-2213 實測：POEditor 的
挪威語（`no`）在 CS 沒有對應 `values-` 目錄 → 那個語系只能留英文。**回報覆蓋率時要把
缺的語系講出來**，不要只說「都補上了」。

驗證要看 arb，不要只看 API 回傳：pipeline 跑完後掃一次
`lib/l10n/intl_*.arb`，數「幾個非英語檔含有這個 key」，缺的列出來。

---

## `/dev-deliver`：Jira transition 要用「目標狀態」挑，不能照抄 id 或名稱

`dev-deliver` 是 **mvbf repo 自己的 command**（`.claude/commands/dev-deliver.md`），
km 沒有同名 skill。它原本把 transition id 寫死（`progressing`(19)、`task done`(8)）。

### 跑這個流程時，另外兩個 skill 也要叫

command 本身不會提醒，但這兩步都踩過坑：

| 時機 | 先叫 |
|---|---|
| Phase 1 開分支前 | 確認基底夠新 —— `cross-repo-workflow.md` §2 的「分支的**基底**也要夠新」 |
| Phase 6／7 寫 PR 描述與 Jira 留言 | `handoff-docs` —— 它 §6 就寫了 `jira_add_comment` 的**回傳值是有損的**，不要據此重貼 |

VB-2193 那輪沒叫 `handoff-docs`，看到 Jira 回傳值裡底線變成 `*` 就連改三次留言，
實際儲存的 ADF 從頭到尾是好的（用 `responseContentFormat: "adf"` 讀回來確認）。

### 唯一該記的判準

**挑 `to.name` 等於目標狀態名稱的那條**（要「進行中」就挑 `to.name == "進行中"`，
要 code review 就挑 `to.name == "IN CODE REVIEW"`）。

三個都不可以當判準：

| 不要用 | 為什麼 |
|---|---|
| **id** | 每張票都可能不同，而且照填不會失敗，會**成功地做錯事** |
| **transition 名稱** | 同一個目標狀態，不同 workflow 的 transition 叫法不同 |
| **`statusCategory`** | 幾乎所有工作中的狀態其 category 都是「進行中」，篩了等於沒篩 |

### ⚠️ 粒度是「每張票的 workflow」，不是「每個專案」

這點我記錯過一次：2026-09-10 寫成「依專案而異」，隔天被 reviewer 用實查推翻。
**同一個 Jira 專案內，不同 issue type 走不同 workflow，id 就已經對不起來**
（2026-09-11 實查 VB 的故事 vs 漏洞：同一個 id 在兩邊是相反方向的動作）。

所以**任何「某某專案的 X 是 id N」的句型都不成立**，包括我自己寫過的。這裡刻意不列
任何 id 對照表——列了就會被下一個人照抄，而那正是這條要防的事。

### ⚠️ 工具選擇：預設那支拿不到 `to`

`jira_get_transitions` **只回 `id` 與 `name`，沒有 `to`** —— 用它無法執行上面的判準。
要拿目標狀態得用 `getTransitionsForJiraIssue`（可加 `includeUnavailableTransitions=true`）。
照新判準做卻沿用舊工具會直接卡住，這點很容易漏，因為兩支工具名字很像。

### 清單會隨「單子當下的狀態」變動

每個 transition 前都要**重查**，Phase 1 查到的結果在 Phase 7 不適用。
`includeUnavailableTransitions=true` 可以看到全集，用來確認「是真的沒有這條」
還是「只是現在還不能走」。

### 已知的兩個沉默陷阱（現況，非永久事實）

- **`19` 在 VB 是 `Closed`**（故事與漏洞 workflow 都是），在 VSFT 卻是 `progressing`。
  照舊值填會直接把票關掉，API 回報成功。
- **VSFT 的 `Code reviewed` 通往 `PR MERGED`**，不是 code review 中；PR 還沒合就按會跳錯狀態。
  （另見 memory 的 `vsft-bug-workflow-states.md`。）

> ⚠️ **VB / VSFT 的分工目前本身就是混亂的，Jay 表示之後會整理**（2026-09-11 當場說明）。
> 上面兩條是當天實查的現況，不是穩定契約 —— 看到與實際不符時，**相信現查的結果**，
> 並回頭把這段改掉。

### ⚠️ `scripts/jira_assign_sprint.sh` 的 board 預設值還停在 VSFT 時代

Phase 1 最後一步 `bash scripts/jira_assign_sprint.sh {ISSUE_KEY}` 會**回報成功**，
但可能把票放進**錯的 sprint**：腳本裡 `BOARD_ID="360"` 是寫死的，那是 VSFT 的 board。
VB 用的是 **board 1754**，sprint 名為 `VB Sprint N`（不帶隊名）。

**徵兆**：它印出的 sprint 名字**帶隊名**（例如 `星期六浩克-sprint 27`），而且 `End:`
的日期**已經過去了** —— 但它照樣印 `✅ Successfully moved`。

2026-09-17（VB-2267）實際踩到：票被放進 board 360 一個 2026-09-07 就結束的 sprint。

**現在怎麼做**（腳本本身有旗標，不必改檔）：

```bash
bash scripts/jira_assign_sprint.sh <KEY> --board-id 1754 --sprint-prefix "VB Sprint" --dry-run
bash scripts/jira_assign_sprint.sh <KEY> --board-id 1754 --sprint-prefix "VB Sprint"
```

**查證放對了沒 —— 不要只看腳本的成功訊息。** 先看大家在哪個 sprint：

```
jira_search: project = VB AND sprint is not EMPTY AND updated >= -14d
             fields: key,customfield_10020    use_display_names: true
```

再 `jira_get_issue` 讀回自己那張，確認「衝刺」欄**只剩**新的那個
（重跑是取代、不是並存 —— 已實測）。

> 腳本要讀 repo 根的 `config.json`（gitignored，含 Jira 憑證）。新開的 worktree 沒有這個檔，
> 會停在 `❌ Jira URL not found`；從主 checkout 複製一份即可。

**這條應該上游到 `edu-droid-flutter`**：把預設值改成 VB 的 board，或讓腳本依 issue key 的
專案前綴自動選 board（別再寫死）。**待與 Jay 確認後交給其他 agent 處理** ——
在那之前，跑 dev-deliver 時自己補上面那兩個旗標。

### 由來

- **VSFT-6704**（漏洞）：Phase 7 的 id 8 在「開放」狀態查不到，差點誤用 `Code reviewed`(16)。
- **VB-1945**（故事）：照 command 填 Phase 1 的 19 會把票關掉。
- **mvbf PR #268**：修 `dev-deliver.md`。第一版只把寫死的 *id* 換成寫死的**名稱**
  （`progressing`），被 reviewer 指為「同一個坑換個外衣」——因為 VB 的漏洞 workflow
  裡根本沒有叫 `progressing` 的 transition，會讓 Phase 1 直接中斷。第二版才改成比對
  `to.name`。**教訓：把一個寫死的東西換成另一個寫死的東西，不算修好。**

---

## 出 hotfix / 發版：四條補在團隊 skill 之外的判準

流程本體在**專案 repo 的** `.claude/skills/mvb-hotfix-release/SKILL.md`（團隊維護，不要在這裡複製）。
以下四條是 2026-09-18 出 `3.10.207`（VSFT-10164 / backport PR #287）時，團隊 skill **沒涵蓋**、
**講得太緊**、或**已經過期**的地方。

> 📤 **這四條應該上游到該 repo（前三條進 `mvb-hotfix-release`，第 4 條進 `mvb-release-note`），
> 待與 Jay 確認。** 在那之前先放這裡，不要自己去改專案 repo。

### 1. squash merge 的 PR 可以安全 backport（§4 那條「停下來回報」要分兩層）

skill §4 說「master 上只找得到一顆涵蓋全部改動的，就是 squash —— **停下來回報，不要往下挑**」。

那條的**本意**是「不要拿 PR 頁面上的 SHA 去挑」（那些 SHA 不在 master 歷史上）。
但 squash 之後，**master 上那一顆就是該 PR 的完整淨改動**，挑它不會漏、也不會多帶。

所以判準是：**停下來回報是對的（讓人確認範圍），但「不能挑」不成立。**
回報時要講清楚「PR 有 N 顆、master 上只有 1 顆、那 1 顆等於全部」，由人拍板。

**證據等級：實測。** PR #275 `gh api .../pulls/275` 回 `commits=3`、
`merge_commit_sha=68d68db40`（1 個 parent），master 上只有那一顆；cherry-pick 後
增刪行與來源逐行相同（比對法見第 3 條）。

### 2. 衝突可能來自「不在範圍內的 commit 的 context」——解法要看 hotfix 線自己的前提

skill §5 只說「用**上界**那一刻的檔案狀態當基準，不要用 master 最新狀態」。
但它沒說：**上界的那個狀態，本身可能依賴一顆你並沒有要 backport 的 commit。**

實例：`android/app/src/store/AndroidManifest.xml` 的衝突，來源 commit 的 context 含
`7c4da965f`（移除 `SetLanguageActivity` 的 exported 覆寫）之後的狀態。照那邊解會把覆寫
一併拿掉 —— 但 `7c4da965f` 的**前提**是 ClassSwift v1.9.2 的 drop-standalone 刪掉了該 Activity，
而 hotfix 線釘的是 **CS v1.8.2**（`46eb2aa94`），Activity 還在，覆寫拿掉會讓 store APK
把 CS 的 `exported` 宣告原樣併進最終 manifest。

**判準**：解衝突前先問兩個問題 ——

1. 這段 context 是**哪顆 commit** 造成的？（`git log -S'<那段文字>' <起點>..origin/master`）
2. 那顆的**前提**在 hotfix 線成立嗎？

**版本釘選是最常見的「前提不成立」來源**：CS 版本、Flutter SDK 版本、plugin 版本 ——
hotfix 線釘的通常比 master 舊，master 上「因為升級了所以可以刪」的東西，在 hotfix 線不能刪。

### 3. patch-id 不同時，用「只比增刪行」區分「掉東西」與「只是 context 不同」

skill 講了 patch-id **不是**「必須相同」而是「不同時你要說得出原因」，但沒給怎麼說。

`git patch-id` 會把 **context 行**也算進指紋，所以**純粹因為周圍文字不同**就會變號 ——
這跟「cherry-pick 掉了東西」在輸出上長得一模一樣（都只是兩個不同的雜湊）。可分辨的探針：

```bash
diff <(git show <來源 SHA>   --format= | grep -E '^[+-]' | grep -v '^[+-][+-][+-]') \
     <(git show <分支上那顆> --format= | grep -E '^[+-]' | grep -v '^[+-][+-][+-]')
```

無輸出 ＝ **增刪行逐行相同**，差異只在 context → 正常，可以寫進 PR 描述當證據。
有輸出 ＝ 真的不一樣，逐行看是不是掉了東西。

⚠️ **對照組**：這條探針要在一個**已知有實質差異**的 commit 上跑出非空輸出，
才證明它有鑑別力（見 `cross-system-claims.md` §5）。

### 4. release note 的 route A 已經寫過線上頁面了（`mvb-release-note` 那句已過期）

那份 skill 寫著「Every publish so far has gone through route B, so route A has not yet
written to the live page. Treat its first real use as a shakedown.」——
**2026-09-18 已經不成立**：`scripts/mvb_release_note_publish.py --publish` 真的寫了，
page version 98 → 99，三道 post-write guard 全綠
（`node count 506 (expected 506)` / `old content byte-identical` / `new sections byte-identical`）。

所以 route A 現在是**預設路徑**，不必再當 shakedown 對待。但那次的作法仍值得照做，
因為它便宜：`--self-test`（21 checks）→ dry run 讀節點數與 APK URL → 才 `--publish`，
而且**三個 guard 要逐項讀**，不要只看 exit code。

⚠️ 那份 skill 的其他內容（route B 的取 body、slicing、`PYTHONIOENCODING=utf-8`）沒有過期，
只有「route A 還沒上線過」這一句要改。

---

## 相關 skill

- `mvbf-review` — review（稽核指令、自己改動要多問的問題、如何驗證別人的 review 意見）
- `mvbf-commit` — commit 與 PR 描述
- `handoff-docs` — 對外文件（PR 描述、Jira 留言、跨團隊規格／prompt）。不限 repo
