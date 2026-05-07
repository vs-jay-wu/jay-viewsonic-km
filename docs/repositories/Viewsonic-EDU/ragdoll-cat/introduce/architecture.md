# 架構設計

## 整體分層

ClassSwift 採用 **MVVM + Koin DI** 架構，分為以下五層：

```
┌─────────────────────────────────────┐
│           UI Layer                  │  Activity / Fragment / Window / Widget
├─────────────────────────────────────┤
│        ViewModel Layer              │  ViewModel / WindowModel / WidgetModel
├─────────────────────────────────────┤
│        Manager Layer                │  業務邏輯協調者（單例）
├─────────────────────────────────────┤
│         Data Layer                  │  Repository / Room DB / DataStore / API Service
├─────────────────────────────────────┤
│        Network Layer                │  Retrofit + OkHttp + Socket.IO
└─────────────────────────────────────┘
```

### UI Layer

| 元件類型 | 說明 |
|----------|------|
| `Activity` | 3 個：`LoginActivity`（入口）、`MvbEntryActivity`（MyViewBoard 喚起）、`SetLanguageActivity` |
| `Fragment` | 21+ 個，負責各畫面邏輯（登入、測驗、OTA、權限等） |
| `Window` | Floating window UI（疊加在其他 App 上方） |
| `Widget` | 複合自訂 View 元件，可跨畫面重用 |
| `CustomView` | 基礎自訂 View 繼承類 |

### ViewModel Layer

- `ViewModel` — 搭配 Fragment/Activity 使用
- `WindowModel` — 搭配 Window（floating window）使用，實作 `IWindowModel`
- `WidgetModel` — 搭配複合 Widget 使用

### Manager Layer

單例（透過 Koin 注入），集中管理跨畫面的業務狀態與操作：

| Manager | 職責 |
|---------|------|
| `AccountManager` | 登入、登出、token 管理 |
| `QuizManager` | 單題測驗發佈、結果收集 |
| `BatchQuizManager` | 批次測驗管理 |
| `ClassroomManager` | 課堂狀態、學生名單同步 |
| `StudentManager` | 學生資料管理 |
| `SocketManager` | Socket.IO 連線、訂閱課堂事件 |
| `ScreenshotManager` | 截圖捕捉（配合 `ScreenshotActivity`） |
| `AmplitudeManager` | Amplitude 行為分析事件送出 |
| `TutorialManager` | In-app 教程狀態追蹤 |
| `SpinnerManager` | 隨機點名抽籤 |

---

## Floating Window 框架

ClassSwift 最核心的自訂架構，讓 App 在其他 App 上方疊加互動視窗（需要 `SYSTEM_ALERT_WINDOW` 權限）。

### 設計模式

```
CSWindowManager
  └── WindowContainer（每個視窗的容器）
        ├── IWindow（View 層介面）
        └── IWindowModel（ViewModel 層介面）
```

- **`CSWindowManager`** — 管理所有視窗的生命週期、z-order（疊加順序）、drag/touch 事件分發
- **`IWindow`** — 所有浮動視窗實作此介面，定義 show/hide/dismiss 等契約
- **`IWindowModel`** — 浮動視窗的 ViewModel 契約介面

### 視窗類別

透過 `WindowTag` enum 識別各視窗身份，例如：測驗面板、排行榜、Spinner、維護公告等。

### 為何需要此框架

ClassSwift 作為「疊加層」運作在 MyViewBoard 之上，所有互動 UI 都必須以浮動視窗形式存在，不能使用一般的 Activity/Fragment 全螢幕模式。

---

## Multi-App 整合（MyViewBoard 協作）

ClassSwift 與 MyViewBoard（MVB）之間透過兩種機制協作：

### 1. Intent 喚起

`MvbEntryActivity` 監聽特定 intent action，由 MyViewBoard 觸發後進入 ClassSwift 主流程。

### 2. AIDL Service Binding

`ClassSwiftService`（Foreground Service）宣告為 signature-protected service，僅允許同簽章的 App（即 MVB）綁定。透過 `MyViewBoardBinder` 進行跨 App IPC 通訊。

```
MyViewBoard App
  → bindService(ClassSwiftService)
  → MyViewBoardBinder
  → 回呼 ClassSwift 業務邏輯
```

### ClientAppInfo 抽象層

`ClientAppInfo` 介面抽象化「呼叫方 App」的差異，使核心業務邏輯無需區分是從 MyViewBoard、ClassSwift Hub 還是 Demo App 進入。

---

## 資料流

### 網路請求

```
ViewModel / Manager
  → Retrofit ApiService（suspend fun）
  → OkHttp（含 AuthInterceptor、LoggingInterceptor）
  → 後端 REST API
  → ApiResponse<T> wrapper（統一錯誤處理）
```

### 即時事件

```
SocketManager（Socket.IO Client）
  ↔ 後端 WebSocket
  → emit / on 事件
  → 解析 data/socket/ 下的 message model
  → 更新 Manager 狀態 → ViewModel StateFlow → UI
```

### 本地持久化

```
Room DB（SQLite）        ← 課堂資料、測驗記錄等需要離線查詢的資料
Proto DataStore          ← 使用者偏好設定（型別安全，取代 SharedPreferences）
```

---

## Foreground Service 架構

`ClassSwiftService` 以 Foreground Service 形式常駐，原因：

1. 維持 Socket.IO 長連線不被系統回收
2. 持有 `REMOTE_MESSAGING` + `MEDIA_PROJECTION` foreground service type
3. 作為 AIDL Binder endpoint 供 MyViewBoard 綁定
4. 管理 `CSWindowManager`（WindowManager overlay 需要 Service context）
