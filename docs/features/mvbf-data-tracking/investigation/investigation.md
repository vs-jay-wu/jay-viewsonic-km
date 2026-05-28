# Investigation：MVBF Data Tracking

> 目的：把 Confluence 規格（`../confluence/`）的需求落到 mvbf 之前，先盤點現有實作、找出 spec
> 與 code 的落差與互相矛盾的地方，並確認 user property 哪些是由 client 自己組、哪些必須跟
> backend 拿。

## 1. 產品 / Repo 對應

> 由 cs 端透過 cougar（AWS CDK infra repo）`config/prd.json` 的 `domainNamePrefix ↔ frontendProjectName / backendProjectName` 對應表還原。

### 1.1 mvb 生態（myViewBoard）

| 縮寫 | 角色 | Repo | 備註 |
| --- | --- | --- | --- |
| **mvbf** | myViewBoard Flutter（本次要動的 app） | `edu-droid-flutter` | 工作目錄已在用，登入相關 widget：`lib/widget/dialog/sign_in_out`、`lib/widget/dialog/account_menu/widget` |
| **mvbw** | myViewBoard Windows（UWP app，內部代號 sparrow） | `edu-sparrow-app` | 已 onload 並 `git pull` 到最新（2026-05-27）。透過 VSFT-8267 已遷移到 cs Amplitude project |
| **mvb backend** | MVB API / 認證 | `edu-mvb-api-core` ✅、`edu-mvb-auth-oidc` ✅、`edu-mvb-backend-libs`（offloaded） | api-core 已 onload。OIDC 處理登入；api-core 主業務 API |

### 1.2 ClassSwift 生態（cs）

從 cougar config 拼出來的完整對應：

| Host (`<prefix>.aps1.classswift-stg.com` / `.us.classswift.com`) | Repo（offloaded） | 角色 |
| --- | --- | --- |
| — (Android App) | `ragdoll-cat` ✅（已在本機） | **cs Android Teacher App**（Kotlin） |
| — (Windows Electron App) | `maine-coon-cat` | **cs Windows App（Electron 新版）** |
| — (Windows WPF App) | `balinese-cat` | **cs Windows App（WPF 舊版，`SWIFT_WPF` 目錄）** |
| `api-swift` | **`ocelot`** | **cs 主 backend API**（user properties / org / plan 的源頭） |
| `api-swift-product` | `margay` | product / store backend |
| `admin-swift` | `african-golden-cat` | Hub / Admin web 前端（React+Vite） |
| `learn-swift` | `fishing-cat` | Lesson web 前端 |
| `classswift` | `puma` | Article / marketing web 前端 |
| `app-link` | `iriomote-cat` | App-link / login redirect 服務 |
| `swift-tools` | `siamese-cat` | Spinner / 工具 |
| `quiz-generator` | `panthera` | Quiz Generator |
| — | `cougar`（infra） | AWS CDK 部署設定（這次反查命名就是用它） |

### 1.3 已 onload 狀態

✅ `edu-droid-flutter`（本來就在）
✅ `ragdoll-cat`（本來就在）
✅ `edu-mvb-api-core`
✅ `edu-mvb-auth-oidc`

## 2. 我認為要調查的事 — 分 repo 整理

### 2.1 mvbf（edu-droid-flutter）— 工作主場

優先級最高，是要改的 repo 本身。

- **A. 既有 Amplitude SDK 設定**
  - SDK 怎麼初始化？是否開啟 `defaultTracking.sessions`？（spec §B.1 直接問這件事）
  - User property 目前送哪些？跟 `../confluence/VCAET/user-properties.md` 的差距為何？
  - 既有事件命名（spec §B.1 提到「之前已埋過」的 App Launched 命名要調整）
- **B. 登入流程**
  - 入口在哪？目前的登入種類（SSO / email / QR / stay signed in）怎麼分流？
  - 登入成功後拿到的 user 物件包含什麼？哪些欄位可以直接組成 user property？
  - 登入失敗的 error code / message 來自哪一層（network / OIDC / business）？
- **C. Beta Program「Join」按鈕**
  - 按鈕已經做了嗎？在哪個畫面？對應 widget 是什麼？
  - 按下去之後做什麼動作（純導頁 / 呼叫後端 / 寫名單）？email 屬性要從哪拿？
- **D. App 開啟 / 結束的 lifecycle hook**
  - 目前有沒有現成的 app lifecycle observer？
  - `end reason` 在 Flutter 端能不能分辨「主動關閉 / 被系統殺掉 / 切到背景」？spec 自己也標註「不確定是否可以抓取」

### 2.2 cs Android（ragdoll-cat）— 對齊參考

cs 已經實作了完整 user properties，是「對的答案」的主要來源。

- **E. cs 怎麼在 Login / Login Error 兩個事件帶 user property**
  - 找 Amplitude wrapper / tracking class，看 user identity / current org 等屬性如何注入
  - 「login method」cs 用 `ClassLink / ViewSonic / QR code / Google / Microsoft / Automatic`，但 mvbf spec 寫 `sso / email / qrcode / stay signed in` + `sso provider`。**這兩套要不要對齊？** → Q1
- **F. cs 對 backend 的依賴**
  - cs 拿 `current_org_*`、`sign_up_*` 等屬性是哪個 API？fields 是什麼？
  - 這份 API 在 mvbf 直接呼叫有沒有限制（authn / scope）？

### 2.3 cs 後端（`ocelot`，offloaded）

User Properties 文件大量點名「按資料庫 `users.user_id` / `users.created_at` / `organization.*`」。需要釐清：

- **G. 哪些 user property 是 server-side 從 cs DB 直接寫 Amplitude**（spec 標 "Server 端發送事件才有"），哪些是 client 端呼叫 API 拿到後自己 set
- **H. 是否有「User Property Updated」事件由 cs backend 直接發**（spec 提到的 `[User Property Updated]`）。如果有，mvbf 端只要送 client 自己負責的部分即可
- **G/H 都需要 onload `ocelot` 後才能查**

### 2.4 mvb 後端（edu-mvb-api-core / edu-mvb-auth-oidc / edu-mvb-backend-libs）

從 mvbf 的角度，這是「可以拿來組 user property 的資料來源」。

- **I. 登入流程**：OIDC 在 `edu-mvb-auth-oidc`？token 拿到後 mvbf 怎麼換 user info？這支 API 回傳什麼欄位？
- **J. Org / Plan 資料**：mvb 後端是否有 endpoint 可以拿到 user 所屬 org 列表、plan、role？還是要走 cs backend？
- **K. Beta Program 名單**：點擊 Join Beta 時，是只寫 Amplitude，還是另外打 mvb API 加入 beta program 名單？

### 2.5 mvbw（`edu-sparrow-app`，已 onload）

題目敘述兩次標 Android + Windows 都要做：

- Beta Program 的 Notes 寫「Windows / Android 都有」
- App Launched / App Ended 不分平台

**現況**（見 `findings.md` §6，已重新調查最新版 2026-05-27）：
- mvbw 自己跑了一個 `[VSFT-8267][Data] MVBW data tracking`，已遷移到 cs Amplitude project + 事件命名對齊 spec
- 但仍缺 App Launched / App Ended / Beta 埋點，且 user properties 大半沒實作（含 `role`）

### 2.6 cs Windows（maine-coon-cat / balinese-cat，皆 offloaded）

- `maine-coon-cat` = Electron 新版（`electron-builder.{stg,rc,prod}.yml`）
- `balinese-cat` = WPF 舊版（`SWIFT_WPF/Swift/ClassSwift/Features.ViewBoard/`）
- 如果想看 cs Windows 端怎麼處理 user property（spec User Properties 對 Windows 有特別備註：`login method=ViewSonic`、`platform=Windows`），主看 `maine-coon-cat` 即可，`balinese-cat` 舊版只在歷史對照需要時看

## 3. 跨產品的關鍵疑問（需要 Jay 決定方向）

| # | 問題 | 影響 |
| --- | --- | --- |
| **Q1** | `login method` 的 enum：mvbf spec 寫 `sso/email/qrcode/stay signed in`+`sso provider`；cs user properties 寫 `ClassLink/ViewSonic/QR code/Google/Microsoft/Automatic`。要哪一套？ | 影響 mvbf 事件實作。建議找 Zoe（reporter）對焦 |
| **Q2** | mvbf 事件要送進 cs 那個 Amplitude project（spec 明寫「事件改和 classswift project 放在一起」）。那 mvbf 用的 Amplitude API key 要換嗎？ | 影響 mvbf SDK 初始化參數 |
| **Q3** | spec 的 User Properties 大量倚賴 cs DB；如果 mvbf 登入走 mvb OIDC，要怎麼拿到「user is teacher / current org / plan」？是 cs backend 開 API 給 mvbf 拿，還是 user-property-updated 由 cs server 端統一寫？ | 影響需不需要 cs backend 配合 |
| **Q4** | Beta Program 按鈕已經做了嗎？如果還沒，這個 ticket 也要包含 UI 實作嗎，還是只埋點 | 影響 scope |
| **Q5** | `end reason` spec 自己標「不確定是否可以抓取」。在 Flutter 內可分辨的程度（主動關閉 vs 被殺）有上限，要明確問 Zoe「無法分辨時可不可以乾脆不送」 | 影響埋點細節 |

## 4. 我建議的調查順序

1. **mvbf**（已在本機）— 先看既有 Amplitude / 登入流程現況 → 寫初版「mvbf 目前埋了什麼」
2. **cs Android (ragdoll-cat)**（已在本機）— 看 Amplitude wrapper，確認 user property 的組成方式 → 對照 spec 找 Q1 答案
3. **mvb 後端**（`edu-mvb-api-core` ✅、`edu-mvb-auth-oidc` ✅）— 確認登入流程跟可用 API
4. **cs 後端 `ocelot`**（offloaded，待 onload）— Q3 的答案在這（哪些 user property server-side 發）
5. **cs Windows `maine-coon-cat`**（offloaded，可選 onload）— 對齊 Windows 端 user property
6. **mvbw `edu-sparrow-app`**（已 onload + pull 最新）— 透過 VSFT-8267 自行對齊大半
