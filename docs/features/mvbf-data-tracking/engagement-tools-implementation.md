# Engagement Tools 埋點實作對照（VSFT-9941）

> mvbf（`edu-droid-flutter`）端六個 engagement tool 事件的觸發點對照表，
> 給 QA / 之後改動的人查「這個事件實際掛在哪一行、什麼條件才會送」。
>
> - Jira：[VSFT-9941 \[mVB\] \[Flutter\] Engagement Tools Event Tracking](https://viewsonic-vsi.atlassian.net/browse/VSFT-9941)
> - Spec clone：[`confluence/myViewboar/engagement-tools-event-tracking.md`](confluence/myViewboar/engagement-tools-event-tracking.md)（v6, 2026-08-19）
> - 分支：`Jay/VSFT-9941-engagement-tools-tracking`
> - 實作日期：2026-08-19

## 共通

- 事件全部走既有的 `StructuredTrackEvent` → `AmplitudeHelper.trackEvent`（跟 App Launched / Login 同一條管線）
- 事件定義（名稱／屬性 key）集中在 `lib/model/track_event/src/track_event_factory.dart` 的
  `// region VSFT-9941 Engagement Tools Event Tracking`
- **呼叫入口統一走 `lib/helper/amplitude/engagement_tools_tracker.dart` 的
  `EngagementToolsTracker`** —— 見下面「為什麼多一層 tracker」
- **事件名與屬性 key 1:1 照 spec 原文**（含空白，不改 snake_case），沿用 VSFT-8368 的既有紀律
- Common Properties 走 User Property（全域已設），六個事件都不重複帶
- 驗證方式：debug build 看 logger `[TrackEvent] Amplitude name=[...] properties=[...]`

## 對照表

| # | 事件 | 觸發檔案 | 觸發條件（實作） |
|---|---|---|---|
| 1 | `Timer Started`（count down） | `count_down_page.dart` `onPlayOrPause` → `timerStartedCountDown()` | 秒數 ≠ 0 且計時真的開始。`preset seconds` 取 `anno.defaultCountDownValue`（見下方註記） |
| 1 | `Timer Started`（stopwatch） | `count_up_page.dart` play 按鈕 → `timerStartedStopwatch()` | 非 running 時按 Play。依 spec **不帶** `preset seconds` |
| 2 | `Throw File Imported` | `lib/widget/dialog/magic_box/widgets/throw/throw_files_view.dart` `_onItemDoubleClick` / `_onMultiImport` | `FileUtilityHelper.importFile` 沒拋錯。多選匯入**每個成功檔案各一次** |
| 2 | `Throw File Imported`（通知中心） | `lib/widget/dialog/notification/dialog_v2.dart` `_itemClick`（`TYPE_THROW` / `TYPE_THROW_RECALL`） | 重新抓 throw 檔案清單 → 下載 → `importFile` 沒拋錯 |
| 3 | `Dice Rolled` | `dice_container.dart` `diceWidget` `onTap` → `diceRolled()` | 點擊當下**沒有骰子正在轉**（動畫中再點不會真的重擲）。一次點擊擲全部骰子＝一個事件 |
| 4 | `Participate Mode Used` | `participate_mode_bloc.dart` `onChange` → `_tryTrackParticipateModeUsed` → `participateModeUsed(session: this, ...)` | `state.isModified` 首次為 true（老師或學生任一有書寫）。`ParticipateModeNewSession` 重置 |
| 5 | `Flashcard Flipped` | `flash_card_view.dart` `_flip()` → `flashcardFlipped(card)` | 畫布上的卡片首次翻面（`FlashCardAnnotation.hasTrackedFlip`）。**編輯器 dialog 內的預覽翻面不算** |
| 6 | `Sticky Note Created` | `adorning_sticky_options.dart` `dispose` 的 post-frame callback → `stickyNoteCreated(note)` | 內容從**空 → 非空**的那一次（`SNAnnotation.hasContent`）。取消選取便利貼時判定 |

## 值對照（code ↔ spec）

| 屬性 | code 值 | spec 值 |
|---|---|---|
| `timer mode` | `TimerMode.CountDown` | `count down` |
| `timer mode` | `TimerMode.CountUp` | `stopwatch` |
| `dice type` | `DiceType.Number` | `classic` |
| `dice type` | `DiceType.Text` | `text` |
| `dice type` | `DiceType.Image` | `image` |

> ⚠️ `preset seconds` **不能**用輸入框換算的值。計時進行中，`count_down_page.dart:362-365`
> 每個 tick 都會把三個 TextController 改寫成「剩餘時間」，所以暫停後按 Play 續跑時，
> 從輸入框算出來的是**剩餘秒數**而非原本設定的時長 —— 會靜默污染 spec 想看的
> 「常用時長分佈」。正解是 `anno.defaultCountDownValue`：它只在使用者用 +/- 或打字
> 調整時被 `_setupTimer()` / `_handleTimeValue()` 更新，計時中不會被覆寫，
> 而且輸入框在 running 時是 `readOnly`。

> ⚠️ `dice type` **不能**直接用既有的 `DiceTypeExtension.name` —— 那組字串（`traditional`）
> 是 OLF 存檔格式，改它會破壞既有檔案相容性。埋點另外用
> `EngagementToolsTracker._specDiceType()` 做映射（有 test 蓋）。

## 為什麼多一層 tracker

spec 有三個「一個 X 只記一次」的要求。第一版把旗標直接掛在物件上
（`FlashCardAnnotation.hasTrackedFlip`、`SNAnnotation.hasTrackedCreated`、
`ParticipateModeBloc._hasTrackedUsed`），**已改掉**，理由：

1. **職責錯位** —— annotation 是畫布物件的資料模型，不該知道自己有沒有回報過 Amplitude。
   這個 repo 的 annotation 已經同時扛 model / view / 序列化，不該再加
2. **會擴散** —— 每多一個「只記一次」的事件，就往 model 多塞一個欄位
3. **序列化風險** —— annotation 有 `copyWith` 與 OLF 存讀，transient 旗標混在裡面，
   日後有人補欄位時很容易順手複製過去，靜默改掉埋點語意
4. **不可測** —— 去重規則散在三個 widget/bloc 裡，沒辦法單獨驗證

現在去重狀態集中在 `EngagementToolsTracker`，用 `Expando` 掛在物件上。
**用 `Expando` 而不是 `Set` 的原因**：`Set<FlashCardAnnotation>` 會持有強參考，
卡片從畫布刪掉後仍活在 set 裡 → 開久了記憶體洩漏。`Expando` 是 Dart 標準的
「把額外欄位掛在物件上」機制，持弱參考，物件被 GC 時紀錄跟著消失。

| 事件 | 去重 key | 重置時機 |
|---|---|---|
| `Flashcard Flipped` | `FlashCardAnnotation` 物件本身 | 物件被 GC（新卡片＝可再記） |
| `Sticky Note Created` | `SNAnnotation` 物件本身 | 同上 |
| `Participate Mode Used` | participate mode bloc 實例 | `participateModeSessionReset()`（bloc 在 `ParticipateModeNewSession` 呼叫） |

呼叫端只表達「這件事發生了」，要不要真的送由 tracker 決定。

### 留在 domain 的是什麼

`SNAnnotation.hasContent(PageData)` 留在 annotation 上 —— 「這張便利貼有沒有內容」
是便利貼自己的領域問題（跟隔壁的 `compareContent` 同性質），不是埋點規則。
埋點規則是「內容從空 → 非空時回報，且每張只回報一次」，那部分在呼叫端與 tracker。

## 測試

### ⚠️ 寫 widget / bloc test 碰到這六個事件時必讀

`EngagementToolsTracker` 是 singleton（對齊 repo 既有的 `AnalyticsHelper` /
`AmplitudeHelper` 慣例）。一般 test 環境沒跑過 `AmplitudeHelper.ensureInitialized()`，
所以直接觸發事件會炸：

```
LateInitializationError: Field '_amplitude' has not been initialized.
  AmplitudeHelper.trackEvent
  AnalyticsHelper.trackEvent
  EngagementToolsTracker.diceRolled
```

（這個陷阱**不是本次新增的** —— repo 裡任何 widget 直接呼叫
`AnalyticsHelper.getInstance().trackEvent(...)` 都一樣，只是 VSFT-9941 讓
dice / flashcard / sticky / participate / throw / timer 這幾個畫面也踩得到了。）

所以留了測試接縫，替換全域實例即可：

```dart
setUp(() => EngagementToolsTracker.setInstanceForTest(
      EngagementToolsTracker.forTest(FakeEventTracker()),
    ));
tearDown(EngagementToolsTracker.resetInstanceForTest);
```

兩個 API 都標了 `@visibleForTesting`，正式程式碼誤用會被 analyzer 擋。

### tracker 自己的 test

`test/helper/amplitude/engagement_tools_tracker_test.dart`（15 個 case）。
透過 `EngagementToolsTracker.forTest(EventTracker)` 注入假的 tracker，驗證：

- 倒數帶 `preset seconds`、碼表不帶
- `DiceType.Number` → `classic`（不是 OLF 的 `traditional`）
- Dice / Throw 沒有去重
- Flashcard / Sticky Note 同物件只送一次、不同物件各送一次
- Participate session 去重 + reset 後可再送 + `board count` 取首次書寫當下的值
- `setInstanceForTest` / `resetInstanceForTest` 接縫本身

## 待 spec owner 拍板的判斷

三個地方 spec 沒寫死，實作先照字面走並記在 [`open-questions.md`](open-questions.md)：

- **Q17** Timer：暫停後按 Play 續跑也算一次 `Timer Started`（照 spec 字面「每次開始計時記一次」）
- **Q18** Flashcard：spec 寫「雙擊卡片」，Flutter 實際是 Flip 按鈕（行為等價，建議改 spec 文字）
- **Q19** Throw：PDF 在「開啟選頁 dialog」時就送，使用者之後取消選頁也不會補撤
（Q20 已定案：維持 spec 三個入口，不含 Companion App 的 `file-import-present`。）

## 踩過的坑

`ThrowHelper.presentFile` / `_openFile` **不是**通知中心的路徑 —— 它只有 remote control
的 `file-import-present` action 會走到（`remote_control_manager.dart`）。通知中心點擊
throw 檔案走的是 `notification/dialog_v2.dart` 的 `_itemClick`，自己重抓清單、下載、
呼叫 `FileUtilityHelper.importFile`，完全不經過 `ThrowHelper._openFile`。

第一版埋錯地方（只掛了 `_openFile`），實測從通知點擊只看到 legacy 的
`name=[import_file]`，沒有 Amplitude 事件，才抓出來。

### `file-import-present` 是 Companion App，不是學生

一度以為那是「學生端推檔」而把它也埋了。查證後（含外接碟的 offloaded repo）確認：
sender 是 **Companion App**（`edu-droid-companion-flutter`），使用者 throw 完檔案後
按確認 dialog 的 Yes，推到**自己帳號當前登入的白板**。學生用的 `/preview/<hostName>`
網頁發不出這個 action。所以那是老師自己的行為，不是學生端互動。

2026-08-19 與 PM 確認**維持 spec 三個入口**，該埋點已移除。完整查證表見
[Q20](open-questions.md)。
