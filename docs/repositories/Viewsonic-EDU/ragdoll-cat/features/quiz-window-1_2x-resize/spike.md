# VSFT-10092 出題視窗 1.2x resize — 技術 spike

> 調查日期 2026-09-04；基準 `ragdoll-cat` develop @ `893ff709`（ci: bump version to 1.8.2）。
> 未開分支、未 commit，工作區維持乾淨。

## 票面原文（2026-09-04 抓自 Jira）

> **Question 流程 1.2x Resize**
>
> 請將 Figma `03. ClassSwift_Question` 群組下所有 page 的畫面 —— 包含 Question_text、Random draw、
> Sketch Response、Internet disconnection、Quiz Builder、Close question —— 內的所有 ClassSwift 元件
> 等比放大至 1.2 倍（含容器尺寸、間距、字級、icon）。ViewBoard 宿主環境不放大，維持 1x：視窗外框、
> title bar、tab bar、底部工具列與白板畫布內容皆不變。放大後每個 page 的所有 frame 與 variant 都需
> 產出對應版本，後續再由設計逐一將元件對應 design kit。

`[Quiz Tool][Android] 出題視窗 resize` / 故事 / Highest / KICK-OFF / 零留言。

**票面描述的是 Figma 交付物，不是 Android 實作**（「產出對應版本…後續再由設計逐一將元件對應
design kit」），而 summary 標了 `[Android]`。PM 口頭確認 Android 也要做，這份 spike 即為此而做。

它解掉的一個疑問：「視窗外框維持 1x」是掛在「**ViewBoard 宿主環境**不放大」這個主詞下，
而 ClassSwift 那句明寫「含**容器尺寸**」—— 所以 **CS 浮動視窗的外框要放大**，那句指的是 mVB 的外框。

它沒交代的：沒有 AC、沒有逐視窗尺寸、沒說 Android 實作算這張票還是後續票、
沒交代共用視窗（`JoinClassWindow` 那類）、沒提 1920 寬螢幕放不放得下。

---

## 一句話結論

**用「密度加權的 Context」做，不要逐一改 layout。** 已用一次性 Robolectric 測試證實：
把 `Configuration.densityDpi` 乘 1.2 之後重新 inflate，四個受測 mvb 視窗 layout 的
量測寬高都是 **exactly 1.200×**，且 dp、sp、寫死在 XML 的 dp 一起放大。
剩下的工作不是「改 419 個寫死值」，而是**把三類繞過 Context 的取值路徑收斂回 Context**。

---

## 1. 這張票在 code 上的落點

Figma `03. ClassSwift_Question` 各 page → 實際視窗（fusion／`Mvb` 前綴那一套）：

| Figma page | CS 視窗類別 | size 宣告方式 | 密度法自動生效？ |
|---|---|---|---|
| Question_text | `MvbTextMultipleChoiceStartWindow` / `MvbTextTrueFalseStartWindow` / `MvbTextShortAnswerStartWindow` | `WRAP_CONTENT` | ✅ |
| Quiz Builder | `MvbQuizCollectionWindow` | `WRAP_CONTENT` | ✅ |
| Quiz Builder（出題面板） | `MvbQuestionPanelWindow` | `localizedContext.resources.getDimensionPixelSize(...)` | ✅（Context 換掉就跟著換） |
| Sketch Response（作答） | `MvbSketchResponseStartWindow` | `WRAP_CONTENT` | ✅ |
| Sketch Response（編輯） | `MvbSketchResponseEditWindow` | `context.resources.getDimensionPixelSize(...)` | ✅ **先前誤判為 ❌** —— 建構子參數原本叫 `applicationContext`，但 Koin 餵的是 `mvbQuizContext()`，所以取到的是加權後的值。已把參數改名為 `context` 並加註解。另外這個窗是**參考實作、使用者到不了**（Setting 頁已被 VSFT-10067 `7` 移出流程） |
| Random draw | `MvbSpinnerWindow` | `570.67f.dpToPx(context)` / `472f.dpToPx(context)` | ✅ 外框已改（原為系統 metrics，見 §7 #1 的半壞狀態警告）|
| Internet disconnection | `MvbActivationStatusWindow` | `WINDOW_WIDTH_DP.dpToPx()` | ❌ 同上 |
| Close question | 各視窗內嵌的 `MvbSystemDialogView` | 跟著母視窗 | ✅ |

其餘：`MvbBatchQuizStartWindow`、`MvbBatchQuizResultWindow`、`MvbAudioQuizStartWindow`、
`MvbShortAnswerStartWindow`、`MvbPollQuizStartWindow` 都是 `WRAP_CONTENT`，✅。

**`MvbQuizMaskWindow` 必須維持 1x** — 它是 `MATCH_PARENT` 的全螢幕框選 overlay，
座標直接對應實體螢幕與 MediaProjection 的擷取區。放大它＝擷取到錯的區域。
它的 `PanelPlacer` 也吃 `context.resources.getDimension(R.dimen.quiz_mvb_mask_panel_gap)`，
若共用加權 Context 會連框選邏輯一起位移。

**fusion 沒有「Setting 頁」了。** 五個 `Mvb*EditWindow` 類別已刪
（見 `MyViewBoardMessageHandler.getQuizEditWindow` 上方的長註解），出題改走
`MvbQuestionPanelWindow` + pre-start。票面若照 Figma 的 Setting 頁估工會高估。

---

## 2. 為什麼不用「把 dimens 全部乘 1.2」

`values/dimens.xml` 的 `quiz_mvb_*` 有近百個值，全部是 Figma px ÷ 1.5 手算來的
（`values/dimens_design.xml` 另有 `mvb_spacing_*` / `mvb_radius_*` token 組）。
但 **48 個 `*mvb*` layout 裡有 419 處寫死的 `dp` / `sp`**，最密集的幾個：

```
48  panel_mvb_batch_quiz_detail.xml
45  panel_mvb_quizzing.xml
43  panel_mvb_text_quizzing.xml
24  panel_mvb_text_short_answer_quizzing.xml
22  window_mvb_batch_quiz_start.xml
```

改 dimens 只會蓋到有 token 的那一半，另一半原地不動 → 版面會裂開。
要走這條路得先做一次「寫死值全部 token 化」的大重構，那是另一張票的量級。

**密度法把這 419 處一起處理掉**：寫死在 XML 的 `24dp`，在 inflate 當下也是用
inflating context 的 density 換算 px 的。

---

## 3. PoC 證據

一次性測試（`@Config(qualifiers = "w1920dp-h1080dp-xhdpi", sdk = [34])`，跑完已刪除，
原始檔留在 scratchpad `Vsft10092DensityScaleSpikeTest.kt`）：

```
base densityDpi=320  scaled densityDpi=384
dimen quiz_mvb_qc_window_width: 1706 -> 2047 (x1.200)
dimen quiz_mvb_text_lg (sp):    24   -> 29   (x1.208)   ← sp 也跟著放大
window_mvb_question_panel              base=576x513   scaled=691x618   ratio=1.200/1.205
window_mvb_text_multiple_choice_start  base=1738x992  scaled=2085x1190 ratio=1.200/1.200
window_mvb_quiz_collection             base=1748x1002 scaled=2099x1204 ratio=1.201/1.202
window_mvb_batch_quiz_start            base=1738x992  scaled=2085x1190 ratio=1.200/1.200
window_mvb_poll_start                  FAILED: InflateException（LottieAnimationView，Robolectric 限制）
window_mvb_sketch_response_start       FAILED: 同上
```

兩個 FAILED 是 Lottie 在 Robolectric 下 inflate 不起來，**不是縮放失敗**；
真機或改用 window 類別的既有 snapshot 測試路徑即可覆蓋。

`x1.205` / `x1.208` 的零頭是 `getDimensionPixelSize` 的整數取位，非邏輯誤差。

### 接入點

`ContextExtension.kt` 已經有現成的接縫：

```kotlin
// for floating window get setting language
fun Context.localizedContext(): Context {
    val config = resources.configuration
    config.setLocale(locale)
    return createConfigurationContext(config)
}
```

而 **`KoinModules.kt` 裡 61 個視窗 factory 全都寫成
`factory { XxxWindow(androidContext().localizedContext()) }`** —— 這是唯一的集中注入點。
只要對 §1 表格中「要放大」的那批改成 `...localizedContext().scaledBy(QUIZ_UI_SCALE)`，
就能逐窗開關，`MvbQuizMaskWindow` 等保持原樣。

> 注意 `localizedContext()` 目前直接改動 `resources.configuration`（沒有先 copy），
> 加權版務必用 `Configuration(resources.configuration)` 複製後再改，否則會污染共用的
> configuration 物件。這是既有的小瑕疵，順手一起修。

---

## 3b. 實作與真機驗證（2026-09-04，Pixel Tablet `3629105H804NHC`，density 320）

改動（ragdoll-cat develop 工作區，**未 commit**）：

| 檔案 | 改動 |
|---|---|
| `utils/extension/ContextExtension.kt` | 新增 `Context.scaledBy(factor)`、`Context.mvbQuizContext()`；順手修 `localizedContext()` 直接改動 live `Configuration` 的既有瑕疵（加了 densityDpi 之後這個 bug 會讓倍率累乘） |
| `constant/AppConstants.kt` | 新增 `MVB_QUIZ_UI_SCALE = 1.2f` |
| `di/KoinModules.kt` | 15 個 `Mvb*` quiz 視窗 factory 改吃 `mvbQuizContext()` |
| `ui/activity/ScreenshotActivity.kt` | `MvbQuestionPanelWindow` 吃加權 Context；`MvbQuizMaskWindow` 明確維持系統密度，但它的 `panelWidthPx` 改從加權 Context 讀 |

`./gradlew compileStagDebugKotlin` BUILD SUCCESSFUL；
fusion APK 由 mvbf `:app:assembleEdlaDebug -PclassswiftRepoPath=...` 建出後裝機實測。

**量測結果（`adb shell dumpsys window windows`）：**

```
Window #8  com.viewsonic.droid   frame=[238,137][2323,1327]   →  2085 x 1190   ← MvbTrueFalseStartWindow
Window #7  com.viewsonic.droid   frame=[1894,140][2560,1270]  →   666 x 1130   ← JoinClassWindow（未加權）
```

`2085 × 1190` **正好等於 §3 PoC 預測的 scaled 值**（1x = 1738×992，比值 1.1997）。
`MvbQuestionPanelWindow` 的卡片實測 649px，1x 應為 272dp × 2.0 = 544px，比值 1.193。

真機上另外確認：

- `MvbQuizMaskWindow` 的框選框與提示 bar 維持 1x，Capture 正常，面板貼齊位置正確
  （代表 `panelWidthPx` 那條修對了）。
- **`JoinClassWindow` 仍是 1x，就貼在放大後的答題窗右邊，字級目測差一截** —— 見 §6 新增的第 5 點。
- `MvbQuizCollectionWindow` 實測 `frame=[231,130][2330,1334]` = **2099 × 1204**，
  同樣與 PoC 預測的 scaled 值一字不差。
- 2085px 寬在 2560 寬的螢幕上放得下（右邊還剩 237px）；1920 寬的 IFP 要另外量。

**已驗證畫面上看不到破綻是正確的，不是看不出來：** True/False 答題窗（pre-start 狀態）
全程只有一處 `dpToPx`（`populateCorrectBadges` 的 badge，只走 result 狀態），
RecyclerView 的 item decoration 讀的是 `context.resources.getDimensionPixelSize(mvb_spacing_400)`
——加權 Context——所以間距跟著放大。要看到破綻得去 §4 表格點名的那幾個畫面。

---

## 4. 三類會繞過加權 Context 的路徑（＝這張票的真正工作量）

### 陷阱 A：`dpToPx()` 用的是系統 metrics，不是 Context

```kotlin
// utils/extension/FloatExtension.kt:8
fun Float.dpToPx(): Float = TypedValue.applyDimension(
    TypedValue.COMPLEX_UNIT_DIP, this, Resources.getSystem().displayMetrics)
```

`Resources.getSystem()` **永遠**是未加權的系統 metrics，換 Context 完全不影響它。

> ⚠️ 先前這裡寫「`ui/window/quiz/` 底下 65 處」——那個數字涵蓋整個目錄，
> 但目錄裡一半是**不加權**的獨立 app 視窗。真正落在加權面上的是
> **`Mvb*` 檔案裡的 29 處**，而且高度集中：

| 檔案 | 處數 | 影響 |
|---|---|---|
| `MvbTextTrueFalseStartWindow` | 13 | option chip 的 gap / padding 維持 1x，容器卻放大 —— **最明顯的一個** |
| `MvbCollectionQuizDetailView` 等三個 detail view | 6 | Quiz Builder 題目詳情的選項卡尺寸與間距 |
| 四個檔案的 `48f.dpToPx()` 正解 badge | 4 | 只在 **result 狀態**（公布正解後）才畫得出來 |
| `MvbActivationStatusWindow` / `MvbSpinnerWindow` | 3 | **視窗外框本身**不會變大，內容卻放大 → 會被裁切 |
| `MvbToolbarAlignedInitialPlacement` | 3 | 初始擺位，本來就該維持 1x（宿主座標） |

作法：加一支 `Context.dpToPx(Float)`（吃 `resources.displayMetrics`），把 quiz 相關的
呼叫點換過去。既有的 `Float.dpToPx()` 保留給非 quiz 路徑，避免波及全 app。

### 陷阱 B：`applicationContext.resources` / 未加權 context 取 dimen

`ui/` 底下有 82 處，但**落在 `Mvb*` 檔案裡的只有 3 處**，全都在
`MvbSketchResponseEditWindow`（其中兩處就是視窗寬高）。其餘要逐一判斷屬於
「CS 內容」還是「宿主座標」，但不是這張票的阻塞點。

### 陷阱 C：程式碼裡自行 new 出來的 View / Dialog

`ui/widget/` 有 86 個檔案用 `LayoutInflater.from(context)`。掛在已加權視窗樹下的
（adapter 的 `parent.context`、custom view 的 `getContext()`）**會自動繼承加權**，安全；
拿 `applicationContext` 去建的不會。要用 grep 篩出後者。

---

## 5. 驗證成本 —— golden **不需要**重錄（2026-09-04 實測）

`./gradlew verifyRoborazziStagDebug` → **BUILD SUCCESSFUL**，175 張 golden 全綠。

原因：**每一支 snapshot 測試都是直接拿 Activity 的 context 建視窗**
（`MvbTrueFalseStartWindow(activity)`、`MvbActivationStatusWindow(activity)`…），
不經過 Koin，也就沒有經過 `mvbQuizContext()`。測試裡渲染的是 1x，所以基準完全沒動。

> 先前這一節寫「125 張要重錄、PR 拆兩個 commit」是錯的 —— 那是假設測試會走 production 的
> Koin 接線。實測後推翻。

### 但這代表 1.2x **完全沒有測試覆蓋**

`app/src/test/` 底下 **沒有任何一處**用到 `mvbQuizContext()` 或 `scaledBy()`。
所以只要有人日後改壞 `KoinModules.kt` 的接線（或把 `MVB_QUIZ_UI_SCALE` 調回 1.0f），
**整個功能會靜默失效，而 CI 全綠**。

### 已補上守門：`MvbQuizUiScaleSnapshotTest`（2026-09-04）

`app/src/test/java/com/viewsonic/classswift/roborazzi/MvbQuizUiScaleSnapshotTest.kt`，兩條：

| 測試 | 守什麼 |
|---|---|
| `koin_supplies_quiz_windows_at_the_scaled_density` | **接線**：啟 Koin 載入 `KoinModules.windowModule`，斷言 `get<MvbActivationStatusWindow>().size` 是未加權版的 `MVB_QUIZ_UI_SCALE` 倍 |
| `activation_status_window_size_follows_quiz_scale` | **倍率**：外框必須正好是未加權版的 `MVB_QUIZ_UI_SCALE` 倍。倍率跑掉時**訊息會直接說是倍率**，不是「幾個 pixel 不一樣」 |
| `activation_status_at_quiz_scale` | **視覺**：整個視窗（外框 + 內容）在加權 Context 下的 golden。host 給的正是 `window.size`，所以「外框沒長、內容放大」會顯示成擠爆／裁切 |

> 第一條是 2026-09-07 code review 補的。原本只有後兩條，而它們都用
> `activity.scaledBy(...)` 自己建構視窗 —— 把 `KoinModules` 的接線改回 `localizedContext()`
> 照樣全綠。**突變測試驗證過**：改回去之後只有 `koin_supplies_...` 那條紅，另外兩條仍綠。
> 為此把 `windowModule` 從 `private` 開成 `internal`，並在原地註明原因。

選 `MvbActivationStatusWindow` 當代表的理由：它同時踩到外框（`dpToPx(context)`）與內容
（同一個 Context inflate）兩條路，且 Koin 依賴少到可以獨立建構。

`./gradlew verifyRoborazziStagDebug` → 1942 tests、0 failures、181 張 golden。

> 跑全套時偶爾會看到 `MvbQuizCollectionWindowModelTest` 的
> 「entering a class clears pendingSelectClass and loads the folders」失敗 ——
> 那是一條帶 2 秒 timeout 的 mockk verify，**既有的 flaky**，單獨跑與重跑都過，與本次改動無關。

---

## 6. 待確認（需 spec owner / 設計）

1. ~~**「宿主環境維持 1x」的邊界在哪？**~~ → **已由票面原文解掉。**
   「視窗外框…維持 1x」掛在「**ViewBoard 宿主環境**不放大」這個主詞下，而 ClassSwift 那句
   明寫「含**容器尺寸**」→ CS 浮動視窗的外框與 header 要放大。實作與此一致。
2. ~~**1.2x 之後會不會超出可用畫面？**~~ → **已在真機量掉。**
   IFP8652 是 **3840×2160、density 480**（不是我先前假設的 1920×1080）。
   答題窗 2607×1488 → 3129×1786，在 3840 寬上還剩 700+ px，放得下。
3. **只放大 fusion（`Mvb*`），獨立 app 維持 1x？** 票名寫 Android／Figma 是 mVB 情境，
   我照這個假設做；若獨立 app 也要，工作量約 ×1.5（多一套非 `Mvb` 視窗）。
4. **要不要同步 balinese-cat（CS Windows）？** 票只掛 CS Android。
5. ~~**與 quiz 併排的非 quiz 視窗要不要一起放大？**~~ → **已決：不做（2026-09-04）。**
   `JoinClassWindow` 不在 Figma `03. ClassSwift_Question` 群組裡，超出本票範圍。
   **但落差仍然存在**：IFP 實測時它以 1x 貼在 1.2x 答題窗右邊，字級明顯小一截
   （1x 的 666×1130 貼著 1.2x 的答題窗）。同類還有 `StudentManagementWindow`、
   `SelectOrgAndSelectClassWindow`、`ToastWindow`、`SettingsWindow`。
   交付時要主動告知 PM／設計這個視覺落差是已知且刻意的，不要讓它以 bug 的形式被回報。

---

## 6b. 「只做 context、不修繞過點」到底差多少（含實測圖）

用 `MvbActivationStatusWindow`（三個「外框寫死」視窗之一）渲染三版對照，
卡片外框實測（Roborazzi 渲染，對照圖已於交付後刪除，數字留在下表）：

| 版本 | 卡片尺寸 | 說明 |
|---|---|---|
| a. 1x（現況） | 660 × 900 | 基準 |
| b. **只做 context** | **648 × 888** | **外框幾乎沒變**，但裡面的字、icon、按鈕全部 1.2x |
| c. 真 1.2x | 792 × 1080 | = 660×900 的 1.2 倍 ✅ |

**這才是重點：差異不是「幾 px 的位移」，而是「視窗根本沒放大、內容卻放大了」。**
外框由 `dpToPx()`（系統 metrics）算出，換 Context 完全不影響它；
卡片 root 又是 `match_parent`，所以卡片被釘在 1x 尺寸，內容擠進去。
這一版比 1x 和 1.2x 都糟 —— 版面變擠，字一長就會溢出。

**但這個症狀只發生在「外框尺寸寫死」的視窗，全部只有三個。** 其餘 12 個 `Mvb*`
quiz 視窗是 `WRAP_CONTENT`，實機量到的是 1.1997 / 1.2000，完全正確。

### 兩桶工作，成本差很多

| 桶 | 範圍 | 症狀 | 修法 | 規模 |
|---|---|---|---|---|
| **A（一定要修）** | `MvbActivationStatusWindow`(2)、`MvbSpinnerWindow`(1 行 2 呼叫)、`MvbSketchResponseEditWindow`(2) | 視窗完全不放大，內容擠爆 | 外框改從加權 Context 取值 | **約 5 行 / 3 檔** |
| **B（可以先不修）** | `MvbTextTrueFalseStartWindow`(13)、`MvbCollection*DetailView`(6)、正解 badge(4) | 間距／badge 差 2–19px | 加 `Context.dpToPx()` 後逐一換 | **約 23 行 / 7 檔** |

桶 A 不做的話 PM 一定不會過（視窗沒變大）；桶 B 是「PM 也許能接受」的那種差異
——最大的一處是 48dp 正解 badge（96px vs 應為 115px），且只在 result 狀態。

**所以 diff 不大：兩桶加起來約 30 行、8 個檔。** 真正大的是 golden 重錄，不是程式碼。

### 維護風險（這條才是真的要權衡的）

`Float.dpToPx()` 在 app 內有 **133 個呼叫點、散在 59 個檔**。它會留著給非 quiz 路徑用，
所以之後任何人在 quiz 視窗裡寫 `16f.dpToPx()`，**會安靜地拿到 1x**，沒有任何警告。

- 直接 `@Deprecated` 掉 → 一次噴 133 個 warning，不可行。
- 可行的守門：對 `Mvb*` 檔案加一條 Sonar／lint 規則禁用 `dpToPx()`
  （這個 repo 已有 `sonar-kotlin-actionable.md` 的慣例）。
- 沒有守門的話，這是**會慢慢漂回去**的那種改動 —— 值得在票上寫清楚。

---

## 7. 交付狀態與剩餘 todo

### 已完成（ragdoll-cat `develop`，21 檔 / +273 −80）

| 項目 | 內容 |
|---|---|
| 機制 | `Context.scaledBy(factor)`、`Context.mvbQuizContext()`、`Float.dpToPx(context)` 多載、`AppConstants.MVB_QUIZ_UI_SCALE = 1.2f` |
| 接線 | `KoinModules.kt` 15 個 `Mvb*` quiz factory；`ScreenshotActivity` 的出題面板（mask 明確排除） |
| 接線 | …外加 `MvbSpinnerWindow` |
| 繞過點 | 32 個呼叫點換成 `dpToPx(context)`：`MvbTextTrueFalseStartWindow`(13)、`MvbCollection*DetailView`(6)、`WcagPatternTiles`+2 呼叫端(5)、正解 badge(3)、`MvbActivationStatusWindow`(2)、`MvbSpinnerWindow`(2)、`MvbTextQuizDiscloseOption`(1) |
| 測試 | `MvbQuizUiScaleSnapshotTest`（數值 + 視覺兩條），全套 gate 綠 |
| 驗證 | IFP8652 真機六種截圖題 + Close question 的 before/after；答題窗 2607×1488 → 3129×1786（×1.2002）。Random draw 另在 Pixel Tablet（density 320）跑完整流程：外框 1141×944 → **1369×1132**（×1.1998） |
| 評審 | PM / UI / UX 已看過並認可（2026-09-04） |

### 剩餘 todo

1. ~~**`MvbSpinnerWindow`（Random draw）未做**~~ → **已完成（2026-09-07）。**
   當時擔心的「轉盤是 WebView，1.2x 可能有一部分要在網頁側處理」**已在真機推翻**：
   WebView 的 CSS px 也是依 Context 的 density 換算，所以它跟原生 view 用同一個來源、
   自動跟著放大，網頁側不需要任何改動。實測轉盤直徑 721px、完整落在框內，無裁切。

   > ⚠️ 這個窗曾短暫處於**半壞狀態**：Koin 已餵加權 Context（layout root 的
   > `570.67dp × 472dp` 因此放大 1.2 倍），但 `size` 還讀系統 metrics，外框沒跟著長 →
   > 內容比外框大 20%、右側與下緣被裁掉。**「先不接線」與「接了線但不修外框」是兩件事**，
   > 後者比完全不做更糟。日後若要暫緩某個視窗，要從 `KoinModules` 拿掉，不是只跳過 `size`。

2. **`Float.dpToPx()` 不加 lint 守門**（已決，2026-09-04）。
   系統密度在某些情境是**正確**的取值 —— 宿主座標擺位
   （`MvbToolbarAlignedInitialPlacement`、`BesideAnchorWindowPlacement`）、
   MediaProjection 的 VirtualDisplay 密度（`ScreenshotActivity`、`ScreenCaptureSession`）。
   一刀切禁用會擋到這些，而要正確地「只在 quiz 路徑禁用」很難劃界（同一個檔可能兩種都有）。
   代替方案已就位：`Float.dpToPx()` 的 KDoc 寫明「什麼該留在這一支」，
   加上 §5 那條 snapshot 當行為網。
3. **`JoinClassWindow` 等共用視窗維持 1x 的視覺落差** —— 已決不做（見 §6 #5），
   但交付／PR 描述要主動寫出來，不要讓它以 bug 被回報。
4. **`MvbCollection*DetailView` 與 `MvbActivationStatusWindow` 只有 Roborazzi 證據，沒有真機圖。**
   前者要登入並進班才進得去；後者要製造斷網／啟用失敗，較難擺。

5. **交付前把 `MVB_QUIZ_UI_SCALE` 的值再跟設計確認一次。** 目前 1.2f 來自票面，
   但票面本身是設計交付物的描述；Figma 的放大版 frame 產出後，若有任何 page 的實際比例
   不是整齊的 1.2，這裡要跟著調（改一個常數即可，不必動呼叫點）。

> 團隊規範提醒：這個 repo 的 commit 是 `feat[VSFT-10092]: ...`（英文、Conventional
> Commits），**不是** km 的 gitmoji。PR 前對照 `.claude/rules/test-with-feature.md`。
> 新增註解用繁體中文（`cs` skill 已更新此條）。

---

## 8. Code review 的落實（2026-09-07）

另一位 agent 對 staged diff 做了完整 review，10 點全部處理完。這裡只留**下次會再犯**的那幾條。

### 8.1 「改了一半」是這次最容易漏的一類

密度加權法的代價是：**改動集中在少數接縫，但漏掉的點會安靜地留在 1x**。review 抓到 4 處我漏的，
共同特徵是「1.2x 的容器裡塞 1x 的元件」：

| 檔案 | 漏掉的 | 症狀 |
|---|---|---|
| `CSResultOptionBarItem` | chip 圓徑、多字元 padding、圓角、`MIN_VISIBLE_BAR_WIDTH_DP` | 我只改了它的 WCAG 圖樣三行，同檔另外 4 處沒動。這個 View 被**所有** Mvb start window 用 |
| `MvbBatchQuizDetailsResultWidget:689` | 正解 badge | 註解自己寫著是 `MvbMultipleChoiceStartWindow.populateCorrectBadges()` 的複製品 —— 本尊改了，複製品沒跟上。**同一行**裡 badge 用 1x、gap 用 1.2x |
| `LoadingButton:32` | icon margin | 進得了 `MvbQuizCollectionWindow` |

**教訓：改某個檔案裡的 `dpToPx()` 時，把整個檔案 grep 過一遍，不要只改手上那幾行。**
「複製自 X」的註解要當成待辦清單。

### 8.2 孤兒 golden 的復活機制 —— 手動刪 intermediates 反而保證它回來

清 `app/src/test/snapshots/` 底下的孤兒 golden 清了**三輪**才真的關掉。前兩輪的診斷都不完整：

| 輪次 | 當時以為的來源 | 為什麼沒關掉 |
|---|---|---|
| 1 | 只刪 `app/src/test/snapshots/` | 下次 verify 又搬回來 |
| 2 | `build/outputs/roborazzi` | 猜錯目錄 |
| 3 | `app/build/intermediates/roborazzi` | 目錄對了，但**刪完跑一般 gate 反而保證復活** |

真正的機制：`app/build/intermediates/roborazzi/` 是 Gradle 宣告的 **task output**。手動刪掉它的
內容後，下次跑 verify 就算是 `UP-TO-DATE`（實測 1 秒結束、測試根本沒跑），Gradle 也會
**從 build cache 把整個 output 目錄還原回去**，接著 `finalizeTestRoborazzi` 再搬進受版控的
`app/src/test/snapshots/`。

正解是讓 task **真的重跑一次**，依現存的測試重建那份 output：

```bash
rm -f app/src/test/snapshots/<pattern>.png
rm -rf app/build/intermediates/roborazzi app/build/outputs/roborazzi
./gradlew verifyRoborazziStagDebug --rerun-tasks   # 關鍵：不能讓它 UP-TO-DATE
```

**刪完一定要再跑一次一般 gate 並看 `git status --porcelain`**，看到零 untracked 才算關掉。
前兩輪都是刪完就以為結束了。

> 這條的兩個惡性特徵：錯誤做法會製造「刪掉又出現」的假象，而且失敗時**完全沒有錯誤訊息**。
> 已寫進 `cs` skill。

順帶清掉了 7 個**與本票無關**的孤兒 golden。其中 5 張可追到
`a75f394a refactor[VSFT-10067]` 的 commit message：「deleted: MvbEditWindowSnapshotsTest + 5 goldens」
—— 它們是被那張票刻意刪掉、又被 verify 搬回來的。一個 `git add .` 就會把它們加回版控。

### 8.3 暫緩一個視窗，要從 `KoinModules` 拿掉

`MvbSpinnerWindow` 曾同時「接了加權 Context」與「`size` 還讀系統 metrics」，結果內容比外框大 20%、
被裁掉 —— **比完全不做更糟**。細節見 §7 todo #1 的警告。

### 8.4 真機補驗兩項（Pixel Tablet，density 320）

| 項目 | 量測 | 1x | 1.2x | 結論 |
|---|---|---|---|---|
| 0-response 細長條（`MIN_VISIBLE_BAR_WIDTH_DP` 5.33dp） | 12px | 10.66 | 12.79 | ✅ |
| 正解 badge 圓（48dp） | 111px 弦寬 | 96 | 115.2 | ✅ |
| 遮罩面板換邊後，卡片到選取框 | 60px | 48 | 57.6 | ✅ |

遮罩換邊本身也正常（選取框拖到右緣 → 面板翻左）。

#### 多字元標籤：走得到，但實機數字只能當上界

先前我寫「這個 UI 產不出多字元標籤」是**錯的** —— 那只在 Multiple choice 的結果頁成立。
`CSResultOptionBarItem` 的 label 不只是選項代號：`MvbShortAnswerStartWindow`、
`MvbAudioQuizStartWindow`、`MvbTrueFalseStartWindow`、`MvbTextTrueFalseStartWindow`、
`MvbSketchResponseStartWindow` 餵的是字串資源（"Submitted" / "Not submitted" /
"Answered correctly"），五個都是加權視窗。改跑**簡答題**就看得到。

實機量測（density 320）：

| chip | chip 寬 | 文字寬 | 左 pad | 右 pad |
|---|---|---|---|---|
| `Submitted` | 113 | 86 | 13 | 14 |
| `Not submitted` | 146 | 118 | 14 | 14 |

`CHIP_MULTICHAR_PADDING_DP` 5.33dp → 1x = 10.66px、1.2x = 12.79px。

⚠️ **這個數字的證據強度低於前三項，交付時不要包裝成同等強度。** 量的是「chip 邊緣到最外側
深色像素」，含字型 side bearing，所以是**上界**；而要分辨的 10.66 vs 12.79 只差 2.1px，
與誤差同一量級 —— 這個量法在物理上就分不出來，換角度重量也一樣。

**這條的結論主要靠靜態論證**：`CHIP_MULTICHAR_PADDING_DP.dpToPx(context)` 與已在實機確認過的
`CHIP_CIRCLE_SIZE_DP`、`RATIO_CORNER_RADIUS_DP`、`MIN_VISIBLE_BAR_WIDTH_DP` 在同一個 class、
同一個 context 來源，其中 `CHIP_CIRCLE_SIZE_DP` 還在**同一個函式的另一個分支**。真要壞，
那三個不會是好的。實測 13–14 的方向與此一致、沒有矛盾。

已補上迴歸網：`CSResultOptionBarItemSnapshotTest.result_bar_multichar_label_chip`
（"Submitted" / "Not submitted" 兩條，後者 `count = 0` 一併鎖 `MIN_VISIBLE_BAR_WIDTH_DP`）。
這條分支在本票之前**連 1x 的 golden 都沒有** —— 既有的 `result_bars_all_three_styles`
只餵 "A" / "B" / "C"。那是本票之前就存在的缺口，順手補掉。

### 8.5 這個 repo 的測試有既有 flakiness

跑三次全套，前兩次各有一支不同的測試失敗，單獨重跑都過：

- `MvbQuizCollectionWindowModelTest`「entering a class clears pendingSelectClass…」（mockk verify 2 秒 timeout）
- `MvbTrueFalseStartWindowResultHighlightSnapshotTest`（`NullPointerException: child is null`）

都與本次改動無關。**push 前要有心理準備可能要重跑**，值得另開一張票。
