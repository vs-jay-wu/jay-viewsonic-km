# oc-portal-picker

Viewsonic-EDU/edu-oc-portal-picker（Originals Content Picker，內嵌於 MVB Hub 與 MVBA/MVBW App 的 Next.js 內容選擇器）開發筆記。

Repo 路徑：`~/ProjectsWork_GitHub/Orgs/Viewsonic-EDU/edu-oc-portal-picker`

## 目錄結構

```
introduce/
├── README.md       ← 專案 overview
├── tech-stack.md   ← 技術棧
└── build.md        ← 環境設定、啟動、連 production 流程

features/
└── webview-auth-sync/
    ├── README.md           ← 從 Android WebView 同步登入狀態到桌面 dev 環境的方法
    └── scripts/
        ├── capture-token.mjs       ← 攔 WebView 的 OIDC token 注入 localhost
        └── sync-webview-storage.mjs ← 同步 sessionStorage / localStorage / cookies（備用）
```

## 主題索引

- 想本地起 dev 並連 production API：見 `introduce/build.md`
- 想用手機上已登入的 MVB App 模擬登入桌面 picker：見 `features/webview-auth-sync/README.md`
