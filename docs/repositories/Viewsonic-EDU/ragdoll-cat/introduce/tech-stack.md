# 技術棧

## 核心 Android / Jetpack

| 套件 | 版本 | 用途 |
|------|------|------|
| Kotlin | — | 主要開發語言 |
| AndroidX Core-KTX | — | Kotlin 擴充函式 |
| AppCompat | — | 向下相容 UI 元件 |
| ConstraintLayout | — | 主要 layout 排版 |
| Navigation (SafeArgs) | — | Fragment 導覽與型別安全參數傳遞 |
| DataStore (Proto) | — | 型別安全的使用者偏好設定（取代 SharedPreferences） |
| Room | — | SQLite ORM，用於課堂/測驗本地資料 |
| Paging | — | 分頁載入學生記錄等長列表 |
| Media3 (ExoPlayer) | — | 媒體播放 |
| Browser | — | 在 App 內開啟網頁（Custom Tabs） |

## 網路層

| 套件 | 用途 |
|------|------|
| Retrofit | HTTP REST API 呼叫，搭配 suspend fun coroutines |
| Moshi | JSON 序列化／反序列化，包含自訂 adapter |
| OkHttp | HTTP client，含 `AuthInterceptor`、`LoggingInterceptor` |
| Socket.IO Client | 雙向 WebSocket，即時推送課堂/測驗事件 |

## 依賴注入

| 套件 | 用途 |
|------|------|
| Koin | Service locator 模式 DI，取代 Dagger/Hilt，設定在 `di/` 模組下 |
| KSP | Kotlin Symbol Processing，Room / Moshi 等 code generation |

## UI / 動畫

| 套件 | 版本 | 用途 |
|------|------|------|
| Lottie | — | JSON 動畫（載入、測驗動效等） |
| Coil | 2.6.0 | 圖片載入（比 Glide/Picasso 更 Kotlin-friendly） |
| Material Design | — | 標準 Material UI 元件 |

## Firebase

| 服務 | 用途 |
|------|------|
| Firebase Analytics | 使用行為事件追蹤 |
| Firebase Crashlytics | 線上崩潰報告（Release build 才上傳） |
| Firebase Remote Config | 遠端動態設定（feature flag 等） |
| Firebase Installation ID | 裝置識別 |

## 分析與監控

| 套件 | 用途 |
|------|------|
| Amplitude | 行為分析，透過 `AmplitudeManager` 集中管理 |
| Timber | 日誌輸出（取代 `Log`，方便 Debug/Release 切換） |

## 第三方工具

| 套件 | 用途 |
|------|------|
| ZXing | QR Code 掃描（學生加入課堂） |
| Protocol Buffers (Lite) | 搭配 Proto DataStore 定義資料結構 |

## 雲端整合

| 服務 | 用途 |
|------|------|
| Amazon S3 | 檔案上傳（學生作答圖片、課堂內容等），透過 `api/amazon/` |

## 測試

| 套件 | 用途 |
|------|------|
| JUnit | 單元測試 |
| AndroidX Test JUnit | Android instrumentation 測試 |
| Espresso | UI 自動化測試 |

---

## SDK 設定

```
minSdk         = 28  (Android 9.0 Pie)
targetSdk      = 35  (Android 15)
compileSdk     = 35
compileOptions = Java 11
```
