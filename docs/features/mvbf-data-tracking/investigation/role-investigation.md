# Role User Property 詳細調查

> 把 `role` 一個 user property 在 mvb / cs / Amplitude 上的全部資訊集中於此。
> 上層摘要在 `../user-properties-sources.md` §2；決策議題在 `../open-questions.md#Q10` 與 `#Q11`。
>
> 調查日期：2026-05-27（Amplitude MCP 實測 + 各 repo grep）

---

## 0. 背景

cs spec User Properties（`../confluence/VCAET/user-properties.md` §Role）定義一個 `role` 屬性，給定 5 個值：`Student / Teacher / Admin / Owner / VIP`，並備註「部分資料從 ClassSwift Database 而來的 role 資料（[User Property Updated] 寫入）」。

mvbf 為了符合這個 spec 在做 VSFT-8368 時遇到問題：mvb 後端沒有「課堂角色」的概念，只有「組織權限」。因此引發以下調查。

---

## 1. mvb 後端 role enum

來源：`edu-mvb-api-core/models/public/entity_account.ts:16-21`

```typescript
export enum EntityRoleDef {
  SUPER_ADMIN = 0,
  OWNER = 1,
  ADMIN = 2,
  USER = 3,
}
```

- DB table：`entity_role`（`models/public/entity_role.ts`），`name` 欄位（VARCHAR(32)，unique index）存的就是這些值
- API 回傳路徑：`apps/mvb-app-api/src/module/me/entity.service.ts:84` 用 `entity_account → entity_role.name` join 出 `role_name`
- DTO：`apps/mvb-app-api/src/module/me/dto/res-body.dto.ts:24` 宣告 `role_name: string`
- DB 存的值全部是**大寫**（DB seed 預設值即如此，API 不做轉換直接送）

語意：**組織內權限**（誰能管組織）。

---

## 2. cs role 三個定義位置

### (a) cs spec — 首字大寫，5 項

來源：`../confluence/VCAET/user-properties.md` §Role

```
Student / Teacher / Admin / Owner / VIP
```

Spec 註解：
> Student：以學生角度加入 ClassSwift（Join Class or …），登入或訪客
> Teacher：選取組織後確認為 Teacher 角色
> Admin：選取組織後確認為 Admin 角色
> 部分資料從 ClassSwift Database 而來的 role 資料（[User Property Updated] 寫入）

語意：**課堂角色**（誰是老師、誰是學生）。

### (b) cs backend DB seed — 全小寫，5 項

來源：`ocelot/seed/versions/2024_06_11_0918-30c4e70a1c5c_role.py:29-60`

| role_id | role_name |
| --- | --- |
| 1 | `student` |
| 2 | `teacher` |
| 3 | `admin` |
| 4 | `owner` |
| 5 | `vip` |

### (c) cs backend Python enum — 全小寫，5 項

`ocelot/app/lib/constants.py:194-199`（`RoleType`，role_id 對應）：

```python
class RoleType(Enum):
    STUDENT = "1"   # 值是 role_id 字串
    TEACHER = "2"
    ADMIN = "3"
    OWNER = "4"
    VIP = "5"
```

`ocelot/app/lib/constants.py:1423-1430`（`ClassSwiftRole`，role_name 對應）：

```python
# ClassSwift role names (matching values in the `role` table)
# value from RoleType.name.lower()
class ClassSwiftRole(str, Enum):
    STUDENT = "student"
    TEACHER = "teacher"
    ADMIN = "admin"
    OWNER = "owner"
    VIP = "vip"
```

→ cs 後端跟 cs spec **項目跟語意都對應**，只差大小寫字面（後端小寫、spec 首字大寫）。

---

## 3. 三套 role 比較

| 維度 | mvb 後端 | cs 後端 | cs spec |
| --- | --- | --- | --- |
| 項目數 | 4 個 | 5 個 | 5 個 |
| 值（不論大小寫） | `super_admin / owner / admin / user` | `student / teacher / admin / owner / vip` | `student / teacher / admin / owner / vip` |
| 語意 | 組織權限 | 課堂角色 | 課堂角色 |

> 大小寫不是問題 —— client 端可以自由 normalize，Amplitude 送出的值不必跟後端字面一致。
> 真正的衝突在**項目跟語意**。

### 項目對照表

| mvb `EntityRoleDef` | cs role（後端／spec） | 對應關係 |
| --- | --- | --- |
| `super_admin` | — | mvb 獨有，cs 完全沒對應 |
| `owner` | `owner` | 字面對得上，語意可能不一樣（mvb 組織擁有者 vs cs 課堂 owner） |
| `admin` | `admin` | 同上 |
| `user` | — | **mvb 獨有的「一般使用者」（你看到的 `USER`）**，cs 完全沒對應；mvbf 的 `user` 該歸到 cs 哪個 role 不清楚（推測是 Teacher，但需要確認） |
| — | `teacher` | cs 獨有 |
| — | `student` | cs 獨有 |
| — | `vip` | cs 獨有 |

---

## 4. mvbf 端 API 來源細節

mvbf 透過 `GET /api/v1/application/me/entity`（`vs_urls.dart:238` dev URL）拿 entity list，比對 `userData.entityId` 找當前 entity 的 `role_name`。

回傳範例（`rest_api_helper.dart:1082`）：
```json
{"cur":1,"count":1,"total":1,"list":[{"domain":null,"role_id":2,"id":"...","name":"LorenEntity","organization":"LorenEntity","role_name":"ADMIN","beta_program":false}]}
```

mvbf 既有方法 `RestApiHelper.isEligibleForBetaProgram()`（`rest_api_helper.dart:1063-1093`）已經在用這支 API，但**只讀 `beta_program` 不讀 `role_name`**。

新加的方法 `getCurrentEntity()`（`rest_api_helper.dart:~1097-1135`）讀 `list[].role_name` + `name`，role 直接送大寫值（`USER / ADMIN / OWNER / SUPER_ADMIN`）給 Amplitude。

呼叫方式：`AmplitudeUserProperties.scheduleServerSidePropsRefresh(_analytics)` fire-and-forget（同時補 role / current org name / current plan type），從三個登入路徑（email / SSO・QR / stay-signed-in）觸發。

---

## 5. Amplitude 實測：誰真的在送 `role`

> 由 Amplitude MCP 實測 CS-Prod (695317) 與 CS-Stag (695318)，2026-05-27。
>
> ⚠️ **前提：mvbf 還沒進 CS-Prod / CS-PreProd**（才剛加進 cs Amplitude project，只有 CS-Stag 有 debug 帳號）。
> 所以下面 CS-Prod 的值**全部是 cs 送的**，不含 mvbf；mvbf 實際會送的值要看 code（§4，mvb 大寫 `USER/ADMIN/...`）。

### CS-Prod 過去 30 天 `gp:role` 值分布

| Role 值 | 平均每日 user 數 |
| --- | --- |
| **Student** | ~500/day（最多） |
| `(none)` | ~100/day（沒設 role） |
| **Teacher** | ~70/day |
| **Admin** | 偶爾 ≤1/day |
| **Owner** | 偶爾 ≤1/day |

全部值都是 cs spec 首字大寫格式。

### CS-Prod 過去 7 天 `role=Student` 來源（SDK library）

```
amplitude-ts/2.17.3, 2.18.1   ← 全部來自 web app
```
→ **沒有 mvbf 也沒有 cs Android**。Student 全來自 cs Web 前端（最可能是 `fishing-cat` = `learn-swift` 學生端 web）。

### CS-Prod 過去 7 天 `role=Teacher` 來源

```
http/2.0                                ← server-side HTTP 直送（最大宗 ~55/day）
amplitude-ts/2.17.x / 2.18.x            ← web app
```
→ **沒有 `amplitude-flutter`（mvbf）也沒有 `amplitude-android`（cs Android）出現**

### CS-Stag 過去 30 天 `role=Teacher` 來源

```
http/2.0                                                          ← server-side ~45/day
amplitude-ts/2.17.x / 2.18.x / 2.34.0                            ← web app
amplitude-flutter/4.5.0_amplitude-analytics-android/1.27.0       ← mvbf，5 個 user
```
→ **mvbf 確認在 CS-Stag 有送 Teacher**（過去寫死 `'Teacher'` 留下的），量極小

### 結論：誰真的在送

| Client | 是否送 `role` | 值 | 量級 |
| --- | --- | --- | --- |
| 某 server-side 服務（透過 Amplitude HTTP API） | ✅ 大量送 | `Teacher`（CS-Prod ~55/day） | **目前 Teacher 主要來源**。哪個服務在送待查 → 見 `../open-questions.md#Q11` |
| cs Web app（`amplitude-ts` SDK，最可能是 `fishing-cat`） | ✅ 有送 | `Student / Teacher / Admin / Owner` | Student 唯一來源 |
| mvbf（`amplitude-flutter`） | ✅ 有送 | **目前實作 = 選項 B**（API fetch `GET /me/entity` 送 `USER / ADMIN / OWNER / SUPER_ADMIN`）。選項 A 為寫死 `Teacher`（對齊 cs spec） | CS-Stag 量極小；**選項 A 對齊、選項 B 打破對齊** |
| cs Android (ragdoll-cat) | ❌ 完全沒設 | — | 全 codebase grep 確認（`AmplitudeConstant.kt` UserProperties.Key 沒列 role；`SocketManager.kt` / `LessonApiService.kt` 的 role 是業務字串） |
| cs Windows (maine-coon-cat, Electron) | ⚠️ type 定義有但 code 沒設 | — | 但 `amplitude-ts/2.34.0` 出現在 stage，**可能是它**（待查） |
| mvbw (sparrow / edu-sparrow-app) | ❌ 未設 | — | 2026-05-27 重新調查（VSFT-8267 commit `f965b4805` 後）：`UserPropertyData` 完全沒 `role` 欄位（`AmplitudeAnalytics.cs:44-67`），登入流程也沒設。但 sparrow 已遷移到 cs Amplitude project（API key 與 mvbf 一致） |

**先前「mvbf 是唯一送 role 的 client」結論是錯的。** mvbf 存在感很小，server-side 與 cs Web 才是大宗來源。

---

## 6. Jay 的 mvbf debug 帳號 raw user properties

實際 `get_user_profile` 結果（CS-Stag 2026-05-27，userId = `vsft8368-debug`）：

```json
{
  "role": "USER",                                 ← fire-and-forget API fetch 已寫入 mvb 後端大寫值
  "user id": "539bc98f-dc99-456e-8c9b-cf2e6bff4381",
  "current org id": "0268c150-a8d7-4d43-ab1f-2f0c0e3d3c41",
  "email": "jay.wj.wu@viewsonic.com",
  "platform": "android",
  "Version": "3.7.6",
  "app version": "3.7.6",
  "is login": true,
  "display name": "StageClassroomXX",
  "device type": "tablet",
  "device model": "na",
  "is internal user": true,
  "login method": "qrcode",
  "instance id": "1EC60F9AD756C715F0E24C934FBCC890",
  "model series": "N/A"
}
```

兩個關鍵觀察：

1. **raw key 沒有 `gp:` 前綴**（詳見 §7）
2. **`role = "USER"`** —— fire-and-forget API fetch 已經把 mvb 後端原始大寫值寫進去；跟其他 client 送的 `Student / Teacher / Admin / Owner` 不對齊

---

## 7. 關於 `gp:` 前綴的真相

**`gp:` 是 Amplitude UI / Taxonomy / Chart 端自動加的顯示前綴，不是真實 key。**

證據：
- mvbf code 送 `'role'` → Amplitude raw 存 `role`（無前綴），但 Taxonomy / Chart 查詢時叫 `gp:role`
- §6 Jay 的 mvbf debug 帳號 `customProperties` 沒有任何 `gp:` 前綴
- 同理 `gp:user id` / `gp:platform` / `gp:login method` 等都一樣 raw 沒前綴

可能解釋：
- cs Amplitude project 有某個設定，把 customer-sourced user property 一律加 prefix 歸入 group-like namespace
- 但 raw data 不受影響

**對 mvbf 的影響**：不需要 client 端 code 配合改 key 名稱，繼續送 `'role'` 即可被認為是 `gp:role`。

---

## 8. 結論與後續

### 立即結論

1. ✅ **mvb 後端 role 跟 cs spec role 是兩個不同概念**（組織權限 vs 課堂角色），項目跟語意都不一致
2. ✅ **mvbf 不是唯一送 role 的 client**：server-side 服務跟 cs Web 才是主力，mvbf 量極小
3. ✅ **mvbf 目前實作 = 選項 B（API fetch 送 mvb 大寫值）**：會跟現有 Amplitude 資料分歧。選項 A 為寫死 `Teacher`（跟其他 client 一致）。mvbf 還沒進 prod，兩個方向都還能切換
4. ⚠️ **server-side 也有人在 push role**（透過 Amplitude HTTP API），但**不是 ocelot**（先前已完整 grep 過）—— 哪個服務待查

### 待決策議題（已分別獨立成 open-question）

- **Q10**（`../open-questions.md#Q10`）：mvbf 要怎麼處理 mvb 大寫值與 cs spec 的不對齊？revert 寫死 / mapping / 改 key 名稱 / 維持現狀
- **Q11**（`../open-questions.md#Q11`）：哪個 server-side 服務在 push `role=Teacher` 到 Amplitude？需要查
