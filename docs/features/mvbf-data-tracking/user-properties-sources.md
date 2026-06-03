# mvbf User Property 逐欄位來源與現況

> 對 `confluence/VCAET/user-properties.md`（cs Amplitude User Properties，v95）的每一個欄位，
> 列出 mvbf 端的：1) 來源（API path / OIDC token / Flutter plugin / 寫死 / 缺失）、
> 2) 目前狀態（已實作 / 部分 / 未實作）、3) 落差。
>
> 調查日期：2026-05-27。基於 `edu-droid-flutter` 工作分支當下 code。
>
> 圖例：✅ 已實作 / ⚠️ 部分實作 / 🔴 缺失 / ❌ Spec 標 server-side 但實際無人實作

> 📌 **mvbf／mvbw 沒有學生端／老師端區分**：spec 表格欄位若標「Only 學生端」或「Only 老師端」（如 §3 `is login`、§4 Current Org Data、§5 Orgs Detail Data、§6 User Preference），都是 cs 的設計前提；**mvbf 跟 mvbw 純粹是教師端產品但無端別切換**，相關欄位若資料拿得到就一律送，不依 spec 的端別註記跳過。各段標題仍維持 spec 原文（含「Only 老師端」等字眼）方便對照。

> 📌 **命名規範（重要）**
> - **Amplitude user property key 一律用「空白」命名**：`user id` / `current org id` / `orgs detail` / `sign up timestamp` / `org is individual` / `plan end date`…（Amplitude 實際資料、cs Android 常數、mvbf code 三方一致）
> - **DB 欄位 / 後端 API field 才用 snake_case**：`users.created_at` / `account_pii.country_code` / `role_name` / `org_id`…
> - 本文若出現 snake_case 的 Amplitude property 名（如 `sign_up_timestamp`），是沿用 spec 範例 JSON 的不一致寫法，**實際送 Amplitude 時應為空白命名**（如 `sign up timestamp`）。spec 的 User Properties 頁面表格用空白、範例 JSON 用 snake，自己就不一致；**以空白為準**。

---

## 0. mvbf 既有的兩個 User Property 注入點

| Trigger | 函式 | 程式位置 |
| --- | --- | --- |
| App 啟動 | `AmplitudeUserProperties.device()` | `lib/helper/amplitude/amplitude_user_properties.dart:22-32` |
| 登入成功（含 stay-signed-in） | `AmplitudeUserProperties.onLogin()` | `lib/helper/amplitude/amplitude_user_properties.dart:39-55` |
| 登出 | `AmplitudeUserProperties.onLogout()` | `lib/helper/amplitude/amplitude_user_properties.dart:58-70` |

呼叫處：
- App 啟動：`lib/widget/screen/main_screen.dart:289`
- email 登入：`lib/widget/dialog/sign_in_out/sign_in_overlay.dart:452`
- SSO / QR：`lib/helper/login_handler.dart:93-96`
- Stay signed in：`lib/helper/ifp_account_manager.dart:139-141`
- 登出：`lib/widget/dialog/account_menu/account_menu_dialog_model.dart:236`

---

## 1. User Data

| Spec 欄位 | Spec source | mvbf 對應來源 | mvbf 狀態 | 落差 |
| --- | --- | --- | --- | --- |
| `user id` | `users.user_id` | `CurrentUser.userData.id` ← `UserData.fromJson` ← `signInPermission` API 回的 `id` 欄位（`user_data.dart:183`、`current_user.dart:759`） | ✅ | 已正確帶 |
| `sign up timestamp` | `users.created_at`（**Server 端發送事件才有**） | **無**：mvbf API 沒回 `created_at`；ocelot 也沒發 server-side event 帶這欄 | ❌ | 整個 cs 生態都沒實作（見下方 §A） |
| `sign up datetime` | 同上 | 同上 | ❌ | 同上 |
| `display name` | `users.first + " " + users.last` | `CurrentUser.userData.displayName` ← `UserData.displayName` getter（`user_data.dart:112-119`）優先用 `mvbName`，否則 `email` | ⚠️ | mvbf 用 `mvbName`（後端 `name` 欄）。**spec 字面的 `first + " " + last` 在 mvbf 不可能實作** —— 2026-05-28 實測 mvb sign-in API raw JSON，回傳**只有 `name` 一個姓名相關欄位**，沒有 `first_name` / `last_name` / `mvb_name` / `display_name` 任何一個（雖然 mvb-auth-oidc 的 id_token claims 文件聲稱會回 `first_name` / `last_name`，但 mvbf 用的是 `signInPermission` API 不是 OIDC userinfo endpoint）。若 backend `name` 為空 fallback 成 email |
| `classswift country` | `users.country` | **目前沒帶**（`AmplitudeUserProperties` 註解明寫「先省略，留待後續補」） | 🔴 | **mvb backend 沒提供 user country 給 client**：DB 有資料但在 `account_pii.country_code`（PII 表，未公開 endpoint）跟 `entity_profile.country`（組織國家不是 user 國家），`GET /me` 用 `getByIdExcludeSensitive` 不回 PII。cs Android 走 cs backend 的 `getLoginUrls()` 拿，mvbf 沒走 cs backend。**替代方案**：直接用 Amplitude SDK 自動偵測的 IP-based `country`（Amplitude 已自動帶，但概念是「user 當下位置」不是「帳號國別」） |
| `joined from` | LMS roster（ClassLink / Canvas / Google Classroom） | mvbf 不適用（mvbf 沒有 LMS 入口） | — | 跳過（spec 也只在 Teacher Import 事件才需要） |
| `email` | user email | `CurrentUser.userData.email` ← `signInPermission` API 的 `email` 欄位 | ✅ | 已帶（注意 spec 只在 `Subscription Opened` / `User Property Updated` / **`Beta Program Joined Clicked`** 才送） |
| `Version` | App version | `ApplicationInfo.getInstance().version` | ✅ | mvbf 在 `device()` 同時送 `'app version'` 和 `'Version'` 兩個 key |
| `is internal user` | email domain 是否為 `viewsonic.com` / `yopmail.com` | `_isInternalEmail(email)`（`amplitude_user_properties.dart:175-178`） | ✅ | mvbf 自己組 |

---

## 2. Role

> **詳細內容（mvb / cs 各位置定義、Amplitude 實測誰在送、Jay debug 帳號 raw、`gp:` 前綴真相）獨立放在 [`investigation/role-investigation.md`](investigation/role-investigation.md)。**
>
> 決策議題在 `open-questions.md#Q10`（mvbf 怎麼送）、`#Q11`（哪個 server 在 push）。

### 一句話總結

- mvbf 不是唯一送 `role` 的 client（先前 code-review 結論錯）。Amplitude 上 `role` 主要由 server-side 服務跟 cs Web 在送，值是符合 spec 的 `Student / Teacher / Admin / Owner`
- mvbf 目前實作走 fire-and-forget API fetch 送 mvb 大寫值（`USER / ADMIN / OWNER / SUPER_ADMIN`），跟 cs spec 值不對齊；若改成寫死 `'Teacher'` 就能對齊
- `gp:` 前綴是 Amplitude UI 端顯示加的，raw key 沒有，mvbf 不需要動 key 名

### 摘要表

| Spec 欄位 | Spec source | mvbf 對應來源 | mvbf 狀態 | 落差 |
| --- | --- | --- | --- | --- |
| `role` | cs 課堂角色 `Student / Teacher / Admin / Owner / VIP` | 目前實作：背景非同步打 `GET /me/entity` 拿當前 entity 的 `role_name`（`amplitude_user_properties.dart:scheduleServerSidePropsRefresh` L106 + `rest_api_helper.dart:getEntities` L1105；fetch 後 L118-121 比對 `entityId` 找對應 entity，把 `role_name` 直接設成 `role` user property） | ⚠️ | 目前送的是 mvb 大寫 `USER / ADMIN / OWNER / SUPER_ADMIN`（mvb API raw 範例 `"role_name":"ADMIN"`），跟 Amplitude 現有資料（cs spec 值 `Student/Teacher/Admin/Owner`）不對齊。拿不到就不設（Amplitude Identify merge，不會清掉舊值）。詳見 `investigation/role-investigation.md` 跟 `open-questions.md#Q10` |

---

## 3. Login Data

| Spec 欄位 | Spec source | mvbf 對應來源 | mvbf 狀態 | 落差 |
| --- | --- | --- | --- | --- |
| `login method` | client 點擊分支 | `loginMethod` 參數從 `onLogin()` 傳入；spec 用 `sso/email/qrcode/stay signed in`，cs Android 用 `ViewSonic/ClassLink/Google/...` | ⚠️ | enum 三套不一致，見 `open-questions.md#Q1` |
| ~~`login from`~~ | spec 已劃線 | — | — | spec 已廢棄 |
| ~~`platform`~~ | spec 已劃線（改放 Device Data） | — | — | spec 已廢棄此欄；但 `device()` 仍送 `platform`，跑 Device Data 規則 |
| `is login` | client | 登入：`'is login': true`（`amplitude_user_properties.dart:88` onLogin map）；登出：`'is login': false`（`analytics_helper.dart:logout()` 內，clearAll + setUserId(null) 之後設） | ✅ | spec 標「Only 學生端使用」（cs 學生端有訪客模式），mvbf **沒有學生／老師端區分**，登入登出都明確標記，可在 Amplitude 區分「未登入狀態下的事件」（如 splash / onboarding） |

---

## 4. Current Org Data（Only 老師端）

> org = mvb 的 **entity**。目前實作了背景非同步補欄位：`scheduleServerSidePropsRefresh`
> 一次 `GET /me/entity` 同時拿 `role` + `current org name` + `orgs detail`（三者共用同一次呼叫），
> 再打 `getUserPlanName` 拿 `current plan type`。

> ⚠️ **架構落差：cs `organization` ⊋ mvb `entity`（cs org 是超集）**
>
> spec 的「Current Org Data」是照 **cs 的 org 模型**設計的，但 cs org 跟 mvb entity 不是 1:1：
>
> | cs `organization`（用 `is_individual` 區分） | 對應 mvb |
> | --- | --- |
> | `is_individual=True` 個人組織（`org_type=""`，每個 cs 用戶自動有一個） | ❌ mvb 沒對應（mvb 不把個人當 org） |
> | `is_individual=False` 實體組織（`org_type="entity"`） | ✅ 對應 mvb `entity`（真實組織） |
>
> 證據：cs `organiztion.py` 的 `org_type` doc：「individual org would be empty string, while entity org should be **entity**」。
>
> 兩邊**都有組織方案**（mvb plan enum 含 `Entity / Entity Standard / Entity Premium`，且有 `entitySubscription`；cs 有 `plans` 表 keyed by org_id）。落差在：cs 連「個人組織」都當 org、都有 plan 跟 `is_individual` / 到期日；mvb entity 只涵蓋實體組織那一半，個人用戶在 mvb 是拿 `is_fictitious` 虛擬 entity、無 `is_individual` 旗標。

| Spec 欄位 | Spec source | mvbf 對應來源 | mvbf 狀態 | 落差 |
| --- | --- | --- | --- | --- |
| `current org id` | `organization.org_id` | `CurrentUser.userData.entityId` ← `signInPermission` 回的 `default_entity` 欄位（`user_data.dart:184`） | ✅ | 已帶（注意：是 user 預設 entity，不一定等於 user 當下選的） |
| `current org name` | `organization.name` | `GET /me/entity` 比對 entityId → `name`（fallback `organization`），由 `RestApiHelper.getEntities()` L1105 取、`scheduleServerSidePropsRefresh` 在 `amplitude_user_properties.dart:122-123` 設 | ✅ **已實作** | — |
| `current org is individual` | `organization.is_individual` | **沒帶** | 🔴 | **mvb 根本沒存這個資料**：entity 表無 `is_individual` 欄位，`entity_type` enum 也沒有 individual（regular/reseller/asp/partner/msp/district...）；最接近的 `is_fictitious` 概念不同。**cs (ocelot) 才有**：`organization.is_individual` Boolean（`organiztion.py:21`，spec 來源） |
| `current plan type` | 組織方案 | `RestApiHelper.getUserPlanName()`（`GET /api/account/subscription/plan` → `message`），由 `scheduleServerSidePropsRefresh` 設 | ⚠️ **已實作但值不對齊** | mvbf 會送 mvb plan 詞彙（`Standard/Premium/Pro/Entity*`，看 code）。**Amplitude 現有值是 cs 詞彙**（`Advanced/Lite/Basic/...`）但那全是 cs 送的 —— **mvbf 還沒進 prod/preprod**。兩套詞彙無法對應 → 跟 role (Q10) 同類，見 `open-questions.md#Q12`。舊註解顯示可能帶後綴（`"Premium (free year)"`），值待實測 |
| `current plan end date` | 組織方案到期 | **沒帶** | 🔴 | **mvb 沒存也沒 surface**：mvb 自己 DB 無 plan model，串接外部 VS adaptor 的 `PersonalSubscriptionResponseDto` 也無到期日欄位（只有 `plan`/`subscribeState`/`serviceInstanceId`）。**cs (ocelot) 才有**：`plans.end_date` BigInteger（`plans.py:26`，有 org_id+end_date index） |

備註：
- `GET /api/v1/application/me/entity`（`vs_urls.dart:247` dev URL／L606 `get_user_entity` getter）：`{cur, count, total, list: [{domain, role_id, id, name, organization, role_name, beta_program}]}`（**無 is_individual**）
- `GET /api/account/subscription/plan`（`vs_urls.dart:238` dev URL／L605 `get_user_plan` getter，後端 `mvb-legacy subscription.controller.ts:21`）：回 `SubscriptionPlan { message }` —— **只有 tier 名稱字串，無 end_date**
- `GET /api/account/subscription/plan/detail?entity_id=`（後端同 controller:29）：回外部 adaptor 的 `result.data`，shape 未確認，可能含到期日 → 待查（見 `open-questions.md`）

---

## 5. Orgs Detail Data（Only 老師端）

> **`orgs detail` ≠ Current Org Data 重複。** Current Org Data = 當前選中的**單一** org；
> `orgs detail` = 使用者所屬**全部** org 的陣列，每筆帶自己的 is_individual / plan / end_date。
> 一個老師可同時屬於多個 org（含一個 cs 個人 org + N 個實體 org）。

| Spec 欄位 | Spec source | mvbf 對應來源 | mvbf 狀態 | 落差 |
| --- | --- | --- | --- | --- |
| `orgs detail` | `[{org id, org name, org is individual, plan type, plan end date}, ...]` | `RestApiHelper.getEntities()`（`GET /me/entity` 整包），由 `scheduleServerSidePropsRefresh` 設，每筆只帶 `org id` + `org name` | ⚠️ **已實作但欄位殘缺** | mvbf 送的每筆只有 `org id` + `org name`，**缺 `org is individual` / `plan type` / `plan end date`**（同 Current Org Data 的缺口，乘以全部 org）。cs 是用 `getAccountInfo()` 一次拿完整 org list（含這些欄位），mvb `/me/entity` 沒這些欄位 |

> ⚠️ **key 命名不一致警告**：Amplitude 上同時存在 `gp:orgs detail`（空白，spec 標準）與 `gp:orgsDetail`（camelCase，off-spec）兩個 key。
> - **`orgs detail`（空白）** = mvbf / cs Android (`AmplitudeConstant.kt`) / cs Windows Electron (`maine-coon-cat`，`SelectOrg/index.tsx:160`) 都用 spec 標準
> - **`orgsDetail`（camelCase）** = **Hub (`african-golden-cat`，`trackingProps.ts:23`) 獨家**，唯一偏離 spec —— 應是早期 typo / code 慣性，spec 統一空白後沒同步改
> - 其他 cs web 前端（fishing-cat / puma / marbled-cat / siamese-cat / panthera / Meriti）都不送 orgs detail
>
> mvbf 用空白版正確；分析時要小心兩個 key 都查（或建議 Hub 統一）

### cs 實際送的 orgs detail（Amplitude 實測，cs Teacher `fred.cy.lin`，2026-05-27）

```json
"orgs detail": [
  {"org name":"QA_US_org001",         "org id":"36a87e93-...", "org is individual":"False", "plan end date":"2028/12/31", "plan type":"schools&districts"},
  {"org name":"ViewSonic Advance",    "org id":"b4a98199-...", "org is individual":"False", "plan end date":"1970/01/01", "plan type":"trainer"},
  {"org name":"ViewSonic Corporation","org id":"80834047-...", "org is individual":"False", "plan end date":"1970/01/01", "plan type":"lite"},
  {"org name":"Fred",                 "org id":"63fd9f77-...", "org is individual":"True",  "plan end date":"1970/01/01", "plan type":"basic"}
]
```

每筆欄位：`org name` / `org id` / `org is individual`（字串 "True"/"False"）/ `plan end date`（"YYYY/MM/DD"）/ `plan type`（cs plan 詞彙）。

- 該 user 同時屬於 4 個 org，`current org id = 80834047`（ViewSonic Corporation）就是其中第 3 筆
- 最後一筆 `"Fred"`（org id = user id、`is individual = True`）= **cs 個人組織**
- cs 端來源：`AccountInfoResponse.Organization`（`ragdoll-cat`，含 `org_id/org_name/org_display_name/is_individual/package/package_code/end_date/roles/...`），由 `AmplitudeFactory.kt:124-128` 把 `organizationList` 整包 serialize

---

## 6. User Preference

| Spec 欄位 | Spec source | mvbf 對應來源 | mvbf 狀態 | 落差 |
| --- | --- | --- | --- | --- |
| `teacher standard set` | 教師課綱（CCSS / NGSS / 108） | **無**（mvbf 沒有此設定） | 🔴 | 需要新介面或讀 cs backend 設定 |
| `teacher subjects` | 教師科目陣列 | **無** | 🔴 | 同上 |
| `teacher grades` | 教師年級陣列 | **無** | 🔴 | 同上 |

備註：mvbf 是 myViewBoard 主 app，沒有「教師個人 profile 設定 standard/subject/grade」的 UI 或資料表，這三欄需要 cs Hub 那側才有。**對 mvbf 屬於遠期 scope**，VSFT-8368 範圍應該不含。

---

## 7. Device Data

| Spec 欄位 | Spec source | mvbf 對應來源 | mvbf 狀態 | 落差 |
| --- | --- | --- | --- | --- |
| `country` | 使用者國家 | **Amplitude 自動偵測**（IP geo）；mvbf 沒手動帶 | ✅ | Amplitude SDK 預設會帶 |
| `city` | 城市 | Amplitude 自動偵測 | ✅ | 同上 |
| `platform` | `Windows / MacOS / ChromeOS / Android` | `UtilityHelper.getPlatformName()`（`amplitude_user_properties.dart:31`） | ✅ | 已帶 |
| `device model` | IFP model 如 `IFP5550-5` | `_deviceModelString()`（set 點 `amplitude_user_properties.dart:32`、函式 L145-151） | ✅ | 已帶；非 IFP 帶 `'na'` |
| `app version` | App 版本 | `ApplicationInfo.getInstance().version`（`amplitude_user_properties.dart:34`，同時 L35 送 `Version` key 重複） | ✅ | 已帶 |
| `instance id` | mvb 安裝唯一 ID | `MvbActivator.getInstance().getInstanceID()`（`amplitude_user_properties.dart:30`） | ✅ | 已帶 |
| `device brand` | ViewSonic / Acer | `_deviceBrand()`（set 點 `amplitude_user_properties.dart:33`、函式 L62-65）：取 `UtilityHelper.brandName`（= `DeviceInfoVs.brand` 真實品牌字串），空值 omit | ✅ **已實作（送真實品牌）** | 送真實品牌（`ViewSonic` / `BenQ` / `Promethean` / `samsung`…），可區分非 VS 裝置，達成 spec「識別非 ViewSonic 裝置佔比」。空字串（iOS/macOS）omit → Amplitude `(none)`。先前粗略版（只 ViewSonic vs none）已升級 |
| `device type` | `ifp / desktop / laptop / tablet / phone` | `_deviceType()`（set 點 `amplitude_user_properties.dart:37`、函式 L157-173） | ⚠️ 粒度待重評估 | IFP → `ifp`；mac/windows → `desktop`；iOS/Android → `tablet`；其他 → `na`。**spec Device Data 段是 v91 新增（早於 mvbf 開始實作）**，當時 mvbf 在已知 spec 的情況下選擇了粗粒度分類（不分 phone / laptop）。原 Q14（基於「mvbf 不知道 spec」的錯誤前提）已撤；分類細緻度待重新評估，見 `next-actions.md` |
| `model series` | IFP 系列數字 | `AmplitudeHelper.getModelSeries()`（set 點 `amplitude_user_properties.dart:36`、函式 `amplitude_helper.dart:92`） | ✅ | 已帶；非 IFP 回 `'N/A'`（spec 範例也接受 `N/A`） |
| `os version` | `Windows 11 23H2` | **不做自訂** —— 靠 Amplitude SDK 內建 `os` property 自動帶 | ✅ 內建取代 | Amplitude 內建 `os` 已自動帶 OS+版本（mvbf 實測 `"os":"android 16"`，cs 實測 `Microsoft Windows NT 10.0.26200.0` / `Chrome 147` 等）。`gp:os version` 自訂 property 在 CS-Prod **根本不存在**（全 cs 沒人送）→ mvbf 也不需自訂。待 Zoe 確認用內建 `os` 即可 |
| `edid` | model key（如 `4019`） | `DeviceHelper.getEDIDForA31()` + `scheduleDeviceEdidRefresh`（背景 async） | ✅ **已實作（限 A31）** | 走 native channel `com.viewsonic.droid/monitor_edid`，async 背景補不卡啟動。**此限制是 mvbf（Android）端**：因技術限制目前只有 IFPA31 拿得到 EDID（已向相關同仁確認），其他機型留空（`(none)`）。⚠️ 不適用 mvbw —— sparrow 走 Windows `DisplayMonitor` EDID descriptor，不限 A31（實測送過 `VSC0739`/`VSC3A9C` 等） |

---

## A. 補充：`sign_up_timestamp` / `sign_up_datetime` 為何標「Server 端發送事件才有」

**結論（2026-05-28 完整實證）：spec 字面 + 實證完全一致 —— 只有 server-side 在送，所有 client 都不送。mvbf 不需送。**

| 位置 | 結果 |
| --- | --- |
| african-golden-cat（cs Hub web，reference impl） | ❌ 沒設 |
| fishing-cat / puma / panthera / marbled-cat / siamese-cat / Meriti-AI-Tools / iriomote-cat | ❌ grep 全空 |
| maine-coon-cat（cs Windows Electron） | ❌ `types.ts:106` 只有 type 宣告，無賦值 |
| ragdoll-cat（cs Android） | ❌ `AmplitudeConstant.kt` 無此 key |
| sparrow（mvbw） | ❌ grep 無 |
| ocelot（cs backend） | ❌ grep 全 codebase 無 `sign_up_*` / `set_user_properties` |

**Amplitude 實證**：CS-Prod 30 天有 `sign up timestamp` 的 user 依 library 分布 —
- `http/2.0`：660 users（server-side 直送，**唯一真實來源**，非 ocelot）
- `amplitude-ts`：470 users（cs web，但 web code 沒設 → 歷史殘留或被 server-side 套上去的值）
- `amplitude-analytics-android` / `amplitude-flutter`：**0 users**（mobile 完全不碰）

→ 唯一在 push 的是某個 server-side 服務（候選：`bay-cat` / `ocelot-socket` / 外部 Account Portal / Lambda），追查記在 `open-questions.md#Q11`，**不影響 mvbf 決策**。

**對 mvbf 的決定**：🟢 **不送**（spec 字面就是 server-only，所有 client 也都不送，mvbf 對齊既有行為即可）。本節即完整調查紀錄；原 `open-questions.md#Q6` 已移除（不是 open question，是釐清題，結論明確）。

---

## B. 總結：mvbf 端需要的後端能力清單

依「補上 spec 要求」需要的後端工作排序：

| 需求 | 已有 API | 狀態 / 缺什麼 |
| --- | --- | --- |
| `role`（不寫死 Teacher） | ✅ `GET /me/entity` 回 `role_name` | ✅ 已實作（`getEntities` + `scheduleServerSidePropsRefresh`）。但值是 mvb 大寫，見 Q10 |
| `current org name` | ✅ `GET /me/entity` 回 `name` | ✅ 已實作（同上一次呼叫） |
| `current plan type` | ✅ `GET /api/account/subscription/plan` 回 `message` | ✅ 已實作（`getUserPlanName`）。user-level tier 名稱 |
| `current org is individual` | 🔴 缺 | **mvb 沒存此欄位**（entity 無 is_individual、entity_type 無 individual）。cs `organization.is_individual` 才有。要這欄得走 cs backend 或 mvb 加欄位 |
| `current plan end date` | 🔴 缺 | **mvb 沒存也沒 surface**（VS adaptor DTO 無到期日）。cs `plans.end_date` 才有。要這欄得走 cs backend |
| `orgs detail` | ⚠️ 已實作但殘缺（`getEntities` 整包 → 每筆 `org id`+`org name`） | 缺每筆的 `org is individual` / `plan type` / `plan end date`（mvb `/me/entity` 沒這些欄位） |
| `classswift country` | 🔴 缺 | mvb backend 有資料（`account_pii.country_code`）但**沒公開 endpoint**；替代用 Amplitude built-in IP `country` |
| `sign_up_timestamp` / `sign_up_datetime` | 🔴 缺 | 見 §A，建議跟 Zoe 對焦 |
| Beta Program 加入名單 | ✅ **新增** `POST /v1/entity/beta-program/register` | mvb backend 2026-05 已加 enrollment endpoint，但**不在 VSFT-8368 範圍**（見 `out-of-scope-suggestions.md` §1）。mvbf 端僅補 `Beta Program Joined Clicked` event 的 email 屬性 |
| `device brand` | — | ✅ 已實作（ViewSonic IFP 帶 `ViewSonic`，其他 omit） |
| `os version` | ✅ Amplitude 內建 `os` 取代 | 不做自訂（cs 也沒自訂；內建已涵蓋） |
| `edid` | ✅ 已實作（限 A31） | 走既有 `getEDIDForA31`；技術限制只有 A31 拿得到，其他機型留空 |

mvbf 自己組得到（不需後端配合）的：
- 全部 Device Data 都已涵蓋：`os version` 用內建 `os`、`device brand`（真實品牌）、`edid`（IFP 背景讀）皆已實作
- `is internal user` / `is login` / `login method` / `email` / `user id` / `Version`

需要後端配合：
- Role / Current Org / Orgs Detail / Country
- Sign up 兩欄（如果決定要做）
