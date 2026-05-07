# ClassSwift Teacher App（ragdoll-cat）

**ClassSwift** 是 Viewsonic 教育事業群的 Android 教師端應用程式，提供教師在課堂中管理學生、進行測驗、監控課堂互動的工具。支援 AOSP 與 EDLA 兩種裝置類型，並深度整合 MyViewBoard 生態系。

- **Package:** `com.viewsonic.classswift`
- **minSdk:** 28 | **targetSdk / compileSdk:** 35
- **版本格式:** `MAJOR.MINOR.HOTFIX.INTERNAL`（例：2.05.03.001）

## 核心功能

| 功能 | 說明 |
|------|------|
| **題型** | 是非題、單選題、多選題、音檔題、簡答題、單選投票、多選投票（共 8 種） |
| **單題測驗** | 即時建立並發佈，學生作答後教師揭曉答案、查看統計 |
| **批次測驗** | 從 Quiz Collection 選多題組合成一批，依序發佈，整批結束後查看正確率 |
| **Quiz Collection** | 有資料夾結構的題庫，支援 AI 生成題目，可分類篩選快速取用 |
| **課堂管理** | 學生名單、簽到、出缺席、課堂狀態即時同步 |
| **即時通訊** | Socket.IO 雙向連線，推送測驗與課堂事件 |
| **Floating Window** | 在 MyViewBoard 上方疊加浮動 UI，不佔滿螢幕 |
| **Leaderboard** | WebView 嵌入遠端排行榜，課後可查看完整記錄 |
| **Spinner** | 隨機點名抽籤，選中後透過 Socket 廣播給學生 |
| **OTA 更新** | 自動偵測並下載安裝新版本 APK |
| **多 App 整合** | 可由 MyViewBoard 喚起，AIDL Service Binding 協作 |
| **Standalone 模式** | 不依賴 MyViewBoard 的獨立執行模式（legacy） |
| **Guest 模式** | 無學生帳號的訪客也能加入課堂 |
| **AI 功能** | AI 自動出題（QUIZ_GENERATOR / KNSH）、AI 建議簡答參考答案 |
| **KaTex** | WebView 渲染 LaTeX 數學公式，適用理工科題目 |
| **媒體上傳** | 題目附圖透過 Amazon S3 PreSigned URL 上傳 |
| **教學教程** | 內建 in-app 互動式新手引導 |

## 文件結構

```
introduce/
├── README.md            ← 本文件：App 全局 Overview
├── features.md          ← 各功能詳細介紹（題型、音檔、投票、AI、KaTex 等）
├── architecture.md      ← 架構設計（MVVM 分層、Floating Window 框架、Multi-App）
├── tech-stack.md        ← 技術棧清單與版本說明
├── build.md             ← Build variants、環境設定、Gradle tasks
└── conventions.md       ← 命名規範（class、XML ID、layout、color、string）
```

### 各文件用途

- **features.md** — 所有題型、測驗流程、Quiz Collection、Guest/Standalone 模式、AI、KaTex、媒體上傳等功能詳解
- **architecture.md** — App 分層架構、Floating Window 框架設計、MyViewBoard 多 App 整合模式
- **tech-stack.md** — 所有主要 dependencies、版本號、使用情境
- **build.md** — Build type/flavor 矩陣、環境 URL、Signing 設定、常用 Gradle task
- **conventions.md** — 完整命名規範，直接從 `README.md` 與 `AGENTS.md` 提煉

## 快速連結

- [功能介紹](features.md)
- [架構設計](architecture.md)
- [技術棧](tech-stack.md)
- [Build 指南](build.md)
- [命名規範](conventions.md)
