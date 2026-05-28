# Findings：MVBF Data Tracking 跨產品調查結果

> **mvbf 端基礎實作已完成**（見 `../user-properties-sources.md`）。本文件記錄調查當下的「現況」與
> 「可能的方向」；VSFT-8368 的最終形態仍待 `../open-questions.md` 的決策題定案（屆時可能再調整實作）。
>
> 對應 `investigation.md` 提出的問題。每個 repo 一節，最後是跨產品結論。
> 所有 file:line 都可直接複製到 IDE。
>
> 調查日期：2026-05-27（如後續 repo 有變更，需重新對應確認）

---

## TL;DR — 三個最關鍵的發現

1. **mvbf 已經有 Amplitude SDK 且 6 個事件都實作了**（包括 Beta 按鈕）。VSFT-8368 的工作主要是**修補既有實作**，不是從零建。
2. **ocelot（cs backend）完全不發 user property 事件**。spec 提到的 `[User Property Updated]` 不在後端 → 所有 user property 必須 **client-side 自己組**。Q3 答案明確。
3. **mvbf 跟 cs 的 `login method` enum 完全不同**（spec 用 `sso/email/qrcode/...`，cs Android 用 `ViewSonic/ClassLink/Google/...`），這是 Q1 必須先決定的關鍵分歧。

---

## 1. mvbf（edu-droid-flutter）— 既有實作意外完整

**Amplitude SDK：**
- `amplitude_flutter: ^4.0.0`（`pubspec.yaml:46`）
- 初始化：`AmplitudeHelper.ensureInitialized()`（`lib/util/amplitude/amplitude_helper.dart:20`）
- **`defaultTracking.sessions` 沒開** — 只有 bare `Configuration(apiKey:...)`
- **API key 已對齊 cs project**（`lib/util/amplitude/amplitude_config.dart:9-10`）：
  - dev/stage → `26b3e0c38269655e5c54d80633e1cdf4`（CS Stage）
  - beta → `9f6538c594445d3e51c139ba2ecf2360`（CS RC）
  - prod → `a3e2838b6b4f0417e21cef1b1c51b7c5`（CS Prod）

**已實作的事件（`lib/util/amplitude/track_event_factory.dart`）：**

| 事件 | 行號 | 屬性 | 狀態 vs spec |
| --- | --- | --- | --- |
| `App Launched` | 1202-1203 | 無 | spec 也要求無 unique props ✓，但 device user property 是否帶齊待補 |
| `App Ended` | 1209-1215 | `end reason: 'close app'` | ✓ |
| `Login Method Selected` | 1222-1232 | `login method`, `sso provider` | enum 值跟 cs 不同（見 §1.x） |
| `Login` | 1239-1249 | `login method`, `sso provider` | 同上 |
| `Login Error` | 1258-1272 | `login method`, `sso provider`, `error code`, `error message` | **`error code` 目前沒從 exception 抽出** |
| `Beta Program Joined Clicked` | 1276-1277 | 無 | **缺 `email` 屬性**（spec 明寫要帶 email） |

**User Properties 注入點（`lib/util/amplitude/amplitude_user_properties.dart`）：**
- `device()`（line 22-31）：instance id / platform / device model / app version / model series / device type — App 啟動時
- `onLogin(loginMethod, ssoProvider)`（line 39-54）：user id / email / display name / login method / sso provider / is_login / role(hardcoded `'Teacher'`) / current org id / is internal user — 登入成功時
- `onLogout()`（line 58-69）：清空

**登入流程：**
- 入口：`lib/widget/dialog/sign_in_out/sign_in_overlay.dart`
- 支援 4 種：Email/Password、SSO（Google/Microsoft/Apple/MOE Taiwan/NYC）、QR Code、Stay Signed In
- Login Handler：`login_handler.dart:53-69` 走 `CurrentUser.signInWithToken(userID, token, agent)` → 設 `CurrentUser.userData = {id, email, displayName, entityId}`

**Beta 按鈕：**
- Widget：`lib/widget/dialog/account_menu/widget/account_menu_beta_program_promotion.dart:14-80`
- 字串：`S.join_beta_program = "Join beta program"`
- 觸發：`account_menu_dialog_model.dart:746-762` → 先送 `Beta Program Joined Clicked` 再開 `BetaDialogView()`

**App Lifecycle：**
- `MainScreenState` 用 `WidgetsBindingObserver`（`main_screen.dart:161`）
- `detached` 觸發 `appEnded()`（`main_screen.dart:515-520`）
- ⚠️ Flutter 限制：**無法分辨「主動關閉 / 系統殺掉 / 切到背景」**，只有 resumed/paused/detached

**mvbf 已有 vs spec 差距總結：**
1. `error code` 沒從 `VSBaseException.resultCode` 抽出（只送 message）
2. `Beta Program Joined Clicked` 沒帶 `email`
3. `login method` 用 `sso/email/qrcode/...`，跟 cs Android 不同 → Q1
4. App Launched 沒帶 user property 上下文（仍在等 user 登入後另外 set）

---

## 2. cs Android（ragdoll-cat）— Amplitude wrapper 完整，但跟 mvbf spec 不同步

**Wrapper 架構（`app/src/main/java/com/viewsonic/classswift/manager/amplitude/`）：**
- `AmplitudeManager.kt:13-58` — 核心包裝，所有事件多加 `SOURCE_PROJECT: "Android"`、`firebase installation id`
- `AmplitudeEventBuilder.kt` — fluent builder
- `AmplitudeFactory.kt` — `EventPropertyType` / `UserPropertyType` enum → 屬性產生器

**cs Android 實際送出的 login method 值（`AmplitudeConstant.kt:88-105`）：**
```kotlin
object Value {
    const val VIEW_SONIC = "ViewSonic"
    const val CLASS_LINK = "ClassLink"
    const val GOOGLE = "Google"
    const val MICROSOFT = "Microsoft"
    const val QR_CODE = "QR code"
    const val AUTOMATIC = "Automatic"
}
```

**完全沒有 `sso provider` 這個屬性。** SSO 種類直接靠 `login method` 區分。

**事件命名差異：**
- cs Android：`Login` / `Login Failed` / `Login Method Selected`
- mvbf spec：`Login` / `Login Error` / `Login Method Selected`
- → **cs 用 `Login Failed`，spec/mvbf 用 `Login Error`**（又一個 Q1 級的命名衝突）

**Login Failed 的 `failed message` 值（`AmplitudeConstant.kt:60-64`）：**
`GET_PKCE_FAILED` / `GET_LOGIN_URLS_FAILED` / `GET_QRCODE_URL_FAILED` / `GET_REFRESH_TOKEN_FAILED` / `GET_USER_INFO_FAILED`
（業務語意分類，不是 spec 範例的 `invalid password` / `network timeout`）

**User Properties cs Android 自己組（`AmplitudeFactory.kt`）：**
- LOGIN_DATA（line 98-104）：`user id` / `display name` / `classswift country`
- USER_DATA（line 105-109）：`login method`
- CURRENT_ORG_DATA（line 110-123）：`current org id` / `current org name` / `current org is individual` / `current plan type` / `current plan end date`
- ORGS_DETAIL_DATA（line 124-128）：`orgs detail`（整個 JSON serialize）
- 都從 `accountManager` 拿，根源 API：`getAccountInfo()`（`AccountManager.kt:271-295`） / `getLoginUrls()`（`AccountManager.kt:484-498`）

**Beta Program：cs Android 沒有實作**（grep 過，無相關 event 或 button）

---

## 3. mvb 後端（edu-mvb-auth-oidc + edu-mvb-api-core）— 拿 user properties 的 API 清單

### 3.1 auth-oidc — 標準 OIDC + QR Code grant
- Login flow：`GET /oidc/v1/auth/identifier` → form → `POST .../login` → authorization code（`routes/standard.js:433-566`）
- QR code grant type：`urn:mvb-exchange`（`index.js:95`、`qrcode-verify.__test__.js:51-78`），body 帶 `pass_code + interaction_id + user_id`
- Token：access_token + refresh_token + id_token
- **access_token claims**（`config/oidc.js:258-266`）：`email`, `first_name`, `last_name`
- **id_token claims**（profile scope，`config/oidc.js:273-279`）：`id`, `email`, `last_name`, `first_name`, `name`, `mvb_name`, `locale`, `default_entity`, `picture`, `isUse`, `isLock`, `isInitial`, `shard_region`, `third_id`, `lang_code`
- **`/oidc/v1/me` userinfo endpoint 有開**（`config/oidc.js:280-283`）
- ⚠️ **以上是 mvb-auth-oidc 的 OIDC token 結構，不等於 mvbf 拿到的 sign-in API response**。mvbf 走 `signInPermission` API（回 `DotComHostConfig` 格式），2026-05-28 實測 raw JSON 只有 `name` 一個姓名欄位，**沒有** `first_name` / `last_name` / `mvb_name` / `display_name`。如果 mvbf 之後想用 first+last 組 display name，需要改走 OIDC userinfo endpoint 或請 mvb backend 在 sign-in API response 補欄位

### 3.2 api-core — mvbf 拿 user property 的 endpoint
所有 endpoint 都在 `/api/v2/application/`，用 OIDC JWT Bearer 鑑權（無 session cookie 耦合）：

| Endpoint | 用途 | 回傳 | mvbf 用得到？ |
| --- | --- | --- | --- |
| `GET /me` | user info | `id, email, first_name, last_name` | ✓ 但 **mvbf 沒用** —— mvbf 走 `signInPermission` 拿登入資料（只回 `name`，不回 `first_name`/`last_name`）。若要用 `first + last` 組 display name 需要改走這支或請 backend 補欄位 |
| `GET /me/entity` | 列 user 所屬 org | `list: [{id, domain, organization, name, beta_program, role_id, role_name}, ...]` | ✓ orgs_detail / role / current org / **beta_program 旗標** |
| `POST /subscription/plan` | 拿 plan 資訊（body 帶 userId + entityId） | `PersonalSubscriptionResponseDto`（plan_type, plan_end_date 等） | ✓ current_plan_type / current_plan_end_date |
| `GET /subscription/entity/:eid/account/:aid/subscriptions` | 完整訂閱物件 | 詳細訂閱資料 | 視需要 |

**~~沒有 「join beta program」 endpoint~~**（**2026-05-27 更新：已過時**）。原本 `beta_program` 只是 entity 唯讀旗標，但重新 pull 後發現 mvb backend（branch `dev`）已新增 **`POST /v1/entity/beta-program/register`**（含 email drip scheduler + `beta-program-enrollment` model + migration `20260522.sql`）。mvbf 端是否呼叫此 endpoint **不在 VSFT-8368 範圍**（涉及行銷 drip 啟動決策），詳見 `../out-of-scope-suggestions.md` §1。

**沒有「current org + orgs list + plan」單一 endpoint** — mvbf 至少要打 2 支（`/me/entity` + 每個 entity 的 `/subscription/plan`）才能組出完整 user property。

---

## 4. ocelot（cs backend）— 跟 user property 完全無關

**關鍵發現：ocelot 只發 6 個 Amplitude 事件，且全是業務事件，無 user property。**

走 SQS 而非直接打 Amplitude API（`app/lib/amplitude_event_emitter.py`、`config/aws.py: AMPLITUDE_SQS_URL`）。

事件清單（`app/enums/amplitude_event.py:62-78`）：
1. `Teacher Imported`
2. `Lesson Summarized`
3. `Import Error`
4. `Import Quiz Created`
5. `Import Quiz Saved`
6. `Grade Sync Completed`

→ **完全沒有 `[User Property Updated]` 事件、沒有任何 user identity / org / plan 的 server-side push**。

**spec User Properties 中標「Server 端發送事件才有」的 `sign_up_timestamp` / `sign_up_datetime`、與「[User Property Updated] only」的 `is internal user`、和「[User Property Updated] 寫入」的 `role` — 全部在 ocelot 找不到實作。**

**`create_from = "mvb"` 確實存在**（`app/lib/constants.py: UserCreateFrom.MVB`、`app/services/account/user_service.py:1221`），但**從未送進 Amplitude**，純內部分類用。

→ **這直接回答 Q3**：mvbf 必須 client-side 自己組所有 user property。「server 端有寫的」只是 spec 紙上設計，沒真的實作過。

---

## 5. cs Windows（maine-coon-cat）— Electron 端 Amplitude 半實作狀態

**Setup：**
- Main process：`@amplitude/analytics-node`（`src/main/utils/analytics/amplitude.ts:2`）
- Renderer process：`@amplitude/analytics-browser`（`src/utils/analytics/amplitude.ts:2`）
- API key 跟 cs Android / mvbf 相同（`a3e2838b6b4f0417e21cef1b1c51b7c5` for prod）
- deviceId 走 `node-machine-id` 套件的 `machineIdSync()`（`src/main/utils/analytics/amplitude.ts:13`）

**事件：**
- `Login`（`src/utils/analytics/trackLoginWithUserData.ts:34`）
- `Login Failed`（`src/renderer/pages/SplashScreen/index.tsx:194`）— 帶 `'failed message'`
- **沒有 `Beta Program Joined Clicked`**

**login method enum：**
- Type 宣告只有 `'ViewSonic' | 'ClassLink'`（`src/utils/analytics/types.ts:133`）
- ⚠️ **但實際上 code 從來沒設過 `login method`**（types 只是 stub，`trackLoginWithUserData.ts:23-29` 只設 `userId/displayName/email/isInternalUser/classswiftCountry`）
- `platform / role / login from` 也是 type stub，未實際設值

→ **maine-coon-cat 的 Amplitude 對 login method / platform 是不完整的**，不適合當 mvbf 的對齊範本。

---

## 6. mvbw（edu-sparrow-app）— 已遷移到 cs Amplitude project，**仍部分完成**

> 2026-05-27 重新調查：commit `f965b4805 [VSFT-8267][Data] MVBW data tracking`（2026-05-22）做了完整改寫，**先前文件對 mvbw 的描述全部失效**。

**Setup（`src/Sparrow.UWP/Services/EventTracking/AmplitudeAnalytics.cs:16-24`）**：
- **✅ 已遷移到 cs Amplitude project**，API key 與 mvbf 完全一致：
  - PRODUCTION → `a3e2838b6b4f0417e21cef1b1c51b7c5`（CS-Prod）
  - PREPRODUCTION → `9f6538c594445d3e51c139ba2ecf2360`（CS-RC）
  - DEBUG → `26b3e0c38269655e5c54d80633e1cdf4`（CS-Stag）
- Endpoint：`https://api2.amplitude.com/2/httpapi`（直打 HTTP API，這就是 Amplitude 顯示的 `library = http/2.0` 來源候選 → 見 Q11）
- `PlatformData = "Windows"` 寫死
- Session timeout：30 分鐘（`SESSION_TIMEOUT_MS`）

**已有事件**：

| 事件 | 路徑 | 屬性 | 對應 cs/mvbf spec |
| --- | --- | --- | --- |
| `Login Method Selected` | `SignInOutViewModel.cs:398` | `login method` = `"email"` | ✅ 命名對齊 |
| `Login` | `SignInOutViewModel.cs:426`（email）、`:578`（stay signed in） | `login method` = `"email"` / `"stay signed in"` | ✅ 命名對齊 |
| `Login Error` | `SignInOutViewModel.cs:448` | `error_code`, `error_message` | ✅ 命名對齊 |

**login method 值**：`"email"` / `"stay signed in"`（**僅這兩種，缺 `sso` 跟 `qrcode`**；舊版的 `Email / Auto / SSO / Qrcode` 已被取代）

**UserPropertyData 全部欄位**（`AmplitudeAnalytics.cs:44-67`）：

| Field | JsonProperty key | 備註 |
| --- | --- | --- |
| `UserId` | `"user id"` | ✅ |
| `DeviceModel` | `"device model"` | ✅ |
| `AppVersion` | `"app version"` | ✅ |
| `InstancedId` | `"instance id"` | ✅ |
| `DeviceBrand` | `"device brand"` | ✅ |
| `DeviceType` | `"device type"` | ✅ |
| `ModelSeries` | `"model series"` | ✅ |
| `OSVersion` | `"os version"` | ✅ |
| `Edid` | `"edid"` | ✅ |

**缺漏的 user property 欄位（spec 要求但 sparrow 沒實作）**：
- `role`、`email`、`display name`、`current org id/name`、`current plan type/end date`
- `is internal user`、`is login`、`login method`（**只在 event property 帶，沒當作 user property 設**）、`sso provider`
- 登入流程僅呼叫 `SetAuthenticatedUserID()`（`SignInOutViewModel.cs:426, 585`），**user identity / org / plan 一個都沒 populate**

**仍未實作**：
- ❌ `App Launched` event（沒程式碼）
- ❌ `App Ended` event（`App.xaml.cs:343` 仍只 flush queue，沒送 end event）
- ❌ SSO 登入流程
- ❌ QR code 登入流程
- ❌ `Beta Program Joined Clicked` event（按鈕本體存在但沒埋點）

**對 mvbf VSFT-8368 的意義**：
- ✅ **Amplitude project 對齊**：mvbf 跟 mvbw 同 cs project，分析資料可以混在一起看
- ✅ **事件命名對齊**：cs spec 的 `Login Method Selected` / `Login` / `Login Error` 名稱已被 mvbw 採用
- ⚠️ **但 mvbw 進度比 mvbf 還慢**：沒設 `role` / `email` / `display name` / org / plan、缺 SSO/QR/App Launched/App Ended/Beta — mvbf VSFT-8368 不能照抄
- ⚠️ Q1（login method enum）對 mvbw 影響：mvbw 只送 `email` / `stay signed in`，跟 spec 要求的 `sso/email/qrcode/stay signed in` 部分對得上，但沒 sso 跟 qrcode

---

## 7. 跨產品總結：每個 user property 該由誰提供

| User Property | Source | mvbf 可拿的方式 |
| --- | --- | --- |
| `user id` | OIDC id_token / `GET /me` | 已有（CurrentUser.id） |
| `email` | OIDC id_token / access_token claim | 已有（CurrentUser.email） |
| `display name` | `GET /me` → first_name + " " + last_name | API 補：目前已用 `CurrentUser.displayName` |
| `sign up timestamp` / `sign up datetime` | **無 API 提供**（spec 寫「Server 端發送」但 ocelot 不送，後端 `GET /me` 也不回） | ⚠️ **需要新 API 或放棄** |
| `classswift country` | `getLoginUrls()` 在 cs Android 拿到 | mvbf 要打對應 mvb endpoint 或重用 cs 機制 |
| `joined from` | LMS 場景才有，mvbf 用戶通常 N/A | 跳過 |
| `is internal user` | client-side 判斷 email domain | mvbf 自己組 |
| `Version` | client app version | 已有 |
| `role` | `GET /me/entity` → `role_name` | API 補（目前 mvbf 寫死 `'Teacher'`） |
| `login method` | client-side 點擊分支 | 已有（但 enum 待對齊，見 Q1） |
| `is login` | client-side | 已有 |
| `current org id/name/is individual` | `GET /me/entity` 過濾 current | mvbf 補 |
| `current plan type/end date` | `POST /subscription/plan` | mvbf 補 |
| `orgs detail` | `GET /me/entity` 全部 + 每筆 plan | mvbf 補 |
| device data (platform / model / app version / instance id / brand / os version / edid) | client-side | mvbf 已有大部分 |

---

## 8. 關鍵疑問狀態（調查階段結論）

> 詳細的「需要他人決策」內容請見 `../open-questions.md`，此處僅標狀態。

| # | 問題 | 狀態 | 結論 / 去向 |
| --- | --- | --- | --- |
| **Q1** | `login method` enum 取 mvbf spec 還是 cs Android？ | 🔴 待決策 | 兩套（mvbf spec / cs Android）不同；mvbw 已部分對齊 spec（`email` / `stay signed in`，缺 sso/qrcode）。詳見 `../open-questions.md#Q1` |
| **Q2** | Amplitude project / API key？ | ✅ 已確認 | mvbf 已用 cs project 的 API key（dev/beta/prod 各一），不用換 |
| **Q3** | user property 由 client 還是 server 寫？ | ✅ 已確認 | ocelot 完全不發 user property 事件，spec 的「Server 端發送」設計從未實作。**全部由 client 自己組** |
| **Q4** | Beta 按鈕 UI 要做嗎？ | ✅ 已確認 | mvbf 已有 button + dialog，event 也已發。差別只在欄位 |
| **Q5** | `end reason` Flutter 抓得到嗎？ | 🔴 待決策 | Flutter 無法分辨主動關閉 vs 系統殺掉。詳見 `../open-questions.md#Q5` |
| **Q8** | 範圍是否包含 mvbw？ | 🟡 已部分自行處理 | mvbw 已透過 VSFT-8267 改用 cs project + 事件命名對齊，但 user properties 跟 App Launched/Ended/Beta 仍缺。詳見 `../open-questions.md#Q8` |
| **Q9** | cs Windows 的 login method 沒實作要不要一起補？ | 🟢 低優先 | 不在 mvbf 範圍。詳見 `../open-questions.md#Q9` |
| **Q10** | mvbf 目前的 API fetch 路線會送 mvb role 值、打破現有 Amplitude `role` 對齊 | 🔴 待決策 | Amplitude MCP 實測：`role` 一直被多 client 送（Student/Teacher/Admin/Owner，cs spec 值）；mvbf 若寫死 `'Teacher'` 剛好對齊，目前的 API fetch 會送 `USER/ADMIN/OWNER` 打破對齊。詳見 `../open-questions.md#Q10` |
| **Q11** | Amplitude library `http/2.0` 大量送 `role=Teacher` 到 CS-Prod (~55/day) 的來源 | 🟡 待調查 | sparrow 用 HttpClient 直打 Amplitude HTTP API（library 也會顯示 `http/2.0`）但 **sparrow 不設 `role`**（已重新調查確認），所以單看 sparrow 解釋不了 role=Teacher。可能是 cross-client 同 amplitudeId 累積。其他 server 候選：`ocelot-socket` / `bay-cat` / 某 Lambda |

---

## 9. 假如要動 mvbf，可動範圍盤點（純參考，非工作清單）

> **此節僅列「技術上可動什麼、依賴什麼」**，不是工作 commitment。實際是否進行需待 Q1/Q5/Q8 定案。

**A. 不依賴外部決策的修補**
- ✅ `Beta Program Joined Clicked` 補 `email` 屬性（`track_event_factory.dart:1275-1284`，已實作）— 純 client 補欄位、無爭議；register endpoint 呼叫見 `../out-of-scope-suggestions.md` §1
- `Login Error` 從 `VSBaseException.resultCode` 抽 `error code`（目前只送 message）
- `App Launched` 補 device user property 注入時序（確認啟動時 device props 已就位）

**B. 純 client work，但要打新 API**
- `AmplitudeUserProperties.onLogin()` 補打 `GET /me/entity` 取 `role_name` / `beta_program` / 全部 orgs，再對每個 entity 打 `POST /subscription/plan`
- `role` 不再寫死 `'Teacher'`（`amplitude_user_properties.dart:39-54`），改用 API 回傳

**C. 必須等決策才能動**
- 任何 `login method` enum 相關（Q1）
- `end reason` 行為（Q5）
- ~~`sign_up_*` 欄位~~（已結案：spec + 實證一致 server-only，mvbf 不送，詳見 `../user-properties-sources.md` §A）

**D. 已知技術限制**
- Flutter `AppLifecycleState` 無法區分主動關閉 / 系統殺掉（Q5）
