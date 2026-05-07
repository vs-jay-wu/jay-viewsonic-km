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
└── <feature-name>/
    └── spec.md          ← clone 自 Confluence，持續對齊實際開發
```

## 說明

- `introduce/` — App 整體介紹，架構、技術棧、建置流程、命名規範
- `features/` — 每個大型需求（跨多 Jira ticket）建一個資料夾，`spec.md` clone 自 Confluence，後續直接修改並用 git history 追蹤與原始規格的差異
