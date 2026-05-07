# 功能介紹

## 題型總覽

ClassSwift 支援 8 種題型，定義在 `data/quiz/QuizType.kt`：

| 題型 | 英文代號 | 說明 |
|------|---------|------|
| 是非題 | `TRUE_FALSE` | 學生選擇「對」或「錯」 |
| 單選題 | `SINGLE_SELECT` | 多個選項，只能選一個 |
| 多選題 | `MULTIPLE_SELECT` | 多個選項，可選多個正確答案 |
| 音檔題 | `RECORD` | 學生錄音作答，教師回放審閱 |
| 簡答題 | `SHORT_ANSWER` | 學生輸入文字，可由 AI 生成參考答案 |
| 單選投票 | `SINGLE_POLL` | 投票情境，單選，無標準答案 |
| 多選投票 | `MULTIPLE_POLL` | 投票情境，多選，無標準答案 |
| 未指定 | `UNSPECIFIED` | 預設初始值，不可發佈 |

選擇題選項支援附圖（`imgUrl`）與 KaTex 數學公式渲染。

---

## 測驗流程

### 單題測驗（Single Quiz）

由教師即時建立並發佈，流程如下：

```
教師建立題目 → 發佈給學生 → 學生作答
→ 教師揭曉答案 → 查看統計結果 → 結束
```

- 管理類別：`QuizManager`、`QuizApiService`
- 發佈後學生透過 Socket.IO 即時收到題目
- 支援 `disclose`（揭曉答案）與多種狀態轉換

### 批次測驗（Batch Quiz）

從 Quiz Collection 中選取多題，依序發佈給學生，類似一份考卷：

```
從 Collection 選題 → 建立 Batch Quiz
→ 逐題發佈 → 學生依序作答
→ 批次結束後查看整體正確率
```

- 管理類別：`BatchQuizManager`、`BatchQuizApiService`
- Summary 含每題的 `correctStudentIds`、`incorrectStudentIds`、`noAnswerStudentIds`，以及計算好的 `accuracyRate`
- 建立時自動記錄 `startTimeInMillis` 供分析使用

---

## Quiz Collection

一個有資料夾結構的題庫，教師可以預先整理好題目集合，課中快速取用。

- API：`QuizCollectionApiService`
- 支援分頁（page / per_page / total_pages）
- 可依以下條件篩選：
  - **來源（origin）**：AI 生成 vs 人工建立
  - **source_type**：`QUIZ_GENERATOR`、`KNSH`、`QUIZ_COLLECTION` 等
  - **題型**：依 `QuizType` 過濾
  - **建立日期**

### Collection vs 單題差異

| 面向 | 單題測驗 | Quiz Collection |
|------|---------|----------------|
| 建立時機 | 課中即時建立 | 預先準備好 |
| 組織方式 | 個別發佈 | 資料夾分類管理 |
| 使用情境 | 臨時提問 | 正式考試、批次測驗 |

---

## 音檔題（RECORD）

學生端錄製音訊作答，教師端回放並評分。

### 作答流程

1. 教師發佈 RECORD 題型
2. 學生在裝置上錄音並上傳
3. 音檔儲存為 URL（`StudentQuizzingInfo.answerStringData`）
4. 教師在結果畫面播放各學生錄音

### 播放機制

- 播放器：**ExoPlayer（Media3）**，須在 Main thread 初始化
- 封裝類：`AudioPlayerHelper`
- 播放狀態（sealed class）：`Init`、`Playing`、`Pause`、`Complete`、`GetDuration`、`UpdateRemainTime`
- 每秒更新剩餘時間，結束後 emit `PlayerEvent.Complete`
- 使用後須呼叫 `release()` 釋放資源

### UI 元件

- `AudioStartWindowModel`：管理所有學生的音檔播放狀態
- `AudioAnswerAdapter`：RecyclerView，分兩種 ViewHolder：
  - 作答中（顯示學生錄音進度）
  - 結果檢視（可播放各學生錄音）
- Payload 更新類型（避免全部重繪）：
  - `CHANGE_AUDIO_STATE`、`UPDATE_AUDIO_TIME`、`CHANGE_SHOW_ANSWER_UI`、`PARTIAL_VISIBLE`

---

## 簡答題（SHORT_ANSWER）

學生輸入文字作答，教師手動評分或參考 AI 建議答案。

- `ShortAnswer.isAiAnswer`：標記該參考答案是否由 AI 生成
- Collection 中的簡答題也帶有相同 flag
- 評分由教師人工操作，無自動批改

---

## 投票題（SINGLE_POLL / MULTIPLE_POLL）

無正確答案的題型，用於課堂意見調查。

- `SINGLE_POLL`：只能投一個選項
- `MULTIPLE_POLL`：可複選
- 結果以統計圖呈現，不計入學生個人分數
- 與選擇題共用大部分 UI，差異在於不顯示「正確答案」

---

## Leaderboard（排行榜）

以 WebView 嵌入遠端頁面呈現，不在 App 內自行渲染。

- **課堂排行榜 URL**：`{CLASS_SWIFT_HUB_URL}/leaderboard/{classroomId}?lang={languageCode}`
- **完整記錄 URL**：`{CLASS_SWIFT_HUB_URL}/signin?orgId={orgId}&lessonId={lessonId}&lang={languageCode}`
- 管理類別：`LeaderboardWindowModel`
- 以 Floating Window 形式疊加呈現
- 載入失敗時以 `loadUrlHadError` flag 區分頁面錯誤與正常完成

---

## Spinner（隨機點名）

以 WebView 嵌入遠端 Spinner 工具，隨機選取學生。

- **URL**：`{SPINNER_URL}?lang={languageCode}`
- 管理類別：`SpinnerWindowModel`
- 將目前出席學生清單（`CandidateStudentInfo`：studentId、seatNumber、displayName）傳給 WebView
- 選中後透過 Socket.IO 發送 `SELECT_STUDENT` 事件
- 同步送出 Amplitude 事件：`SPINNER_CLICKED`、`SPINNER_REMOVED_CLICKED`

---

## Standalone 模式

不依賴 MyViewBoard 的獨立執行模式，主要用於測試與舊版裝置相容。

- 入口：`LoginActivity`（在 standalone 模式下作為主 Activity 常駐）
- 當 MyViewBoard 接管時，執行 teardown：
  1. 關閉 `LoginActivity`
  2. 呼叫 `accountManager.clearSessionForMvbTakeover()` 清除 session
- 目前為 **legacy 模式**，主要維護用途，新功能以 MyViewBoard 整合模式為主

---

## Guest 模式

讓沒有學生帳號的參與者（訪客）也能加入課堂。

- 資料模型：`GuestOrganizationInfo`
  - 包含：`userDisplayName`、`orgDisplayName`、`orgId`、`packageCode`、`packageType`、`endDate`、`studentConcurrent`
  - 標記：`isIndividual`、`isSupportStandard`、`isDefault`、`mvbRole`
- UI：`GuestRecordView` 顯示訪客記錄，帶有座號，狀態固定為 `ABSENT`
- 在 `StudentInfo` 中以空的 `studentId` 與 `displayName` 識別訪客身份

---

## AI 功能

### AI 生成測驗

- Source type `QUIZ_GENERATOR`：AI 自動出題
- Source type `KNSH`：另一種 AI 生成機制
- `QuizOption.isAiAnswer`：標記 AI 建議的正確答案
- `QuizManager.QuizCategory` 含 `QUIZ_GENERATOR` 類別，用於 UI 分類與分析

### AI 簡答參考答案

- 簡答題的參考答案可由 AI 生成，以 `isAiAnswer = true` 標記
- 教師可參考但仍需自行評分

---

## KaTex 數學公式

以 WebView 渲染 LaTeX 格式的數學式，適用於理工科目題目。

- 實作類別：`KatexView`（繼承 WebView）
- 載入 assets 中的 `katex.min.js` 與 `auto-render.min.js`
- 支援的 delimiter：

| Delimiter | 模式 |
|-----------|------|
| `$...$` | Display mode |
| `\(...\)` | Inline mode |
| `\[...\]` | Display mode |

- 自動處理雙重 escape 的反斜線
- 渲染更新策略（`KatexRenderUpdatePolicy`）：
  - `RELOAD_CONTENT`：文字變更，完整重新渲染
  - `APPLY_STYLE_ONLY`：僅顏色/粗細變更，跳過重新渲染（效能優化）
  - `NONE`：不需更新

---

## 媒體上傳（S3）

學生作答圖片或題目附圖透過 Amazon S3 上傳。

- 流程：先呼叫後端取得 `PreSignedUrlResponse`（含 `put` URL 與 `get` URL），再直接將圖片 PUT 到 S3
- 實作：`S3UploadService`（Retrofit + `@Url` 動態 URL）
- 題目建立時（`CreateQuizBody`）附帶 `imgUrl`
- AI 生成題目不含 `imgUrl`；Collection 題目改用 `collectionId` 參照
