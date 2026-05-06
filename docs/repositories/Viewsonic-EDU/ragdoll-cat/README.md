# ragdoll-cat

Viewsonic-EDU/ragdoll-cat 專案的需求規格與開發筆記。

## 目錄結構

```
features/
└── <feature-name>/
    └── spec.md   ← clone 自 Confluence，持續對齊實際開發
```

## 說明

- 每個大型需求（跨多 Jira ticket）建一個資料夾
- `spec.md` clone 自 Confluence，commit 訊息標注來源版本
- 後續直接修改此檔，用 git history 追蹤與原始規格的差異
