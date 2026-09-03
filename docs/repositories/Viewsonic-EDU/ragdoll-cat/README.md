# ragdoll-cat

Viewsonic-EDU/ragdoll-cat 專案的需求規格與開發筆記。

## 目錄結構

```
introduce/
├── README.md            ← App 全局 overview
├── architecture.md      ← 架構設計（MVVM、Floating Window、Multi-App）
├── tech-stack.md        ← 技術棧清單
├── build.md             ← Build variants、環境、Gradle tasks
└── conventions.md       ← 命名規範

features/
├── phase3-question-quiz/
│   └── spec.md          ← clone 自 Confluence，持續對齊實際開發
└── quiz-tool-flow-v2/   ← 進行中的 feature branch 全覽（HTML）
    ├── overview.html    ← 流程改版、票務分工、架構增刪、分支操作注意事項
    └── defects.html     ← review 抓到的缺陷與「為什麼沒被擋下來」
```

## 說明

- `introduce/` — App 整體介紹，架構、技術棧、建置流程、命名規範
- `features/` — 每個大型需求（跨多 Jira ticket）建一個資料夾。內容依需求性質而定：
  - `spec.md` — clone 自 Confluence，後續直接修改並用 git history 追蹤與原始規格的差異
  - `overview.html` / `defects.html` — 長期 feature branch 的整合視圖（多人共同開發時特別有用）

## 進行中

- **[quiz-tool-flow-v2](features/quiz-tool-flow-v2/)** — 出題流程改版：Setting 頁移除、
  截圖遮罩接手設定、作答窗長出 pre-start 狀態。三人共同開發中的 feature branch，尚未合併回 develop。
