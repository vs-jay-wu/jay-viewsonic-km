# oc-portal-picker overview

## 是什麼

Originals Content Picker — Next.js (React) 應用，提供「選教材」的 UI。被三種環境嵌入：

| 嵌入環境 | 偵測方式 | Auth flow |
|---|---|---|
| **MVB App (MVBA Android / MVBW Windows WebView)** | `window.ExternalObject.getSession` 存在 | Native bridge 取 session token → `POST /api/v1/session/convert` 換 OIDC token |
| **MVB Hub（iframe）** | `window.parent !== window.self` | 從 URL / parent 取 `cs_token` |
| **獨立瀏覽器（dev only）** | 都不是 | sessionStorage 讀 `ocv2_token_info`（手動 dev fallback，prod build 被 `REMOVE_CODE_PROD_START/END` 移除） |

關鍵程式：`src/hooks/convertMVBToken/useConvertMVBAppToken.ts`、`src/utils/browser.ts`

## 主要路由（basePath = `/originals/picker`）

`src/pages/` 沒有 index — 進站要走子路由：

- `/originals/picker/contents`
- `/originals/picker/backgrounds`
- `/originals/picker/resources`

README 寫的 `/originals/picker` 會 404（沒有 index page）。

## Auth 套件

- `@viewsonic-edu/mvb-fe-auth` — 私有，來自 `Viewsonic-EDU/edu-fe-common-lib`
- 同 mono-repo 還發布：`mvb-fe-gql-codegen-op-mock`、`mvb-fe-poeditor-sync`
- 拿 OIDC token 後 `saveTokenInfo()` 只放 **in-memory（zustand）**，預設不持久化到 IDB/localStorage
