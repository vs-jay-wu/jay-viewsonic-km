# mvbf — Android 平台：headless engine 與背景工作

**先讀 [`SKILL.md`](SKILL.md)**（步驟 0–2、註解標準、引號）。這裡只放「真的在做這件事時才需要」的部分，從 SKILL.md 拆出來的，內容未改。

> 什麼時候讀：headless 丟 `MissingPluginException` 卻被 try/catch 吞掉、後面照跑／要重用既有函式到 headless／要新增 `JobService` 或挑 job id

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
