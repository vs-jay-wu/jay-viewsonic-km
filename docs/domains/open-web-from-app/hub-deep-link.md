# Hub 給 mVB 的 deep-link 入口

myViewBoard Hub 提供一個專門給 App 用的進入點，讓 App 可以把使用者「帶著身分」送到 Hub 的某一頁。

```
{HUB}/signin?orgId=<orgId>&userId=<userId>&returnTo=<path>
```

Hub 端的說明在 `african-golden-cat` 的 `docs/knowledge/features/auth.md`
（節名「mVB Deep Link 登入」）。以下是使用端（Android）需要知道的部分。

---

## 為什麼不直接開目標頁

直接開 `{HUB}/myclass` 只在一種情況下正確：**瀏覽器剛好已經用同一個帳號、同一個 org 登入 Hub**。

| 情況 | 直接開 `/myclass` | 走 deep link |
|---|---|---|
| 瀏覽器沒登入 | route guard → `/signin`，**不帶 returnTo** → 登入後落**首頁** | 參數寫進 OIDC `state`，登入後落 `/myclass` |
| 登的是**別的帳號** | **安靜地顯示別人的班級** | 靠 `userId` 對帳，不符就強制登出重登 |
| 同帳號、不同 org | 看到錯的 org 的班級 | `setCurrentOrg(orgId)` 後再落 |
| 全部一致 | 正常 | 直接 navigate，不觸發登入流程 |

第二列是共用裝置（IFP）上真實會發生的情境，而且**沒有任何錯誤徵兆**。

---

## Hub 端的四條分支

| 狀態 | Hub 做什麼 |
|---|---|
| 未登入 | 顯示 Sign In 按鈕（**不自動觸發**登入）；點下去時三個參數一併寫進 OIDC `state` |
| 已登入，`userId` 不符 | `signOut({ returnTo })` → 重新登入 → 落 `returnTo` |
| 已登入，同帳號不同 org | `setCurrentOrg(orgId)` → `navigate(returnTo)` |
| 已登入，同帳號同 org | 直接 `navigate(returnTo)` |

「未登入時不自動觸發登入」是刻意的 —— 使用者要自己按 Sign In。

---

## 使用端要注意的三件事

### 1. `returnTo` 由 App 負責提供合法路徑

Hub 端**不驗證** `returnTo`（該文件寫明「Phase 1 由 mVB App 端負責提供合法路徑，Hub 端不驗證」）。
給一個不存在的路徑，使用者會落到 Hub 的 catch-all，通常再被丟回 `/signin` ——
表現成「明明已登入卻被踢回登入頁」的假性 bug。

**所以路徑要對照 Hub 的實際 route 確認**，不要照票面文字猜。查證方式：Hub repo 的 e2e 測試
（例如 `toHaveURL(/.*\/myclass/)`）比 UI 更可靠。

### 2. 取不到身分時「不帶參數」，不要送空字串

```kotlin
accountManager.userInfo.userId.takeIf { it.isNotBlank() }
    ?.let { appendQueryParameter("userId", it) }
```

送空的 `userId` 會被 Hub 拿去跟登入中的帳號比對、判定**不符**，於是把使用者原本好好的
session 登出。不帶參數則退化成單純的「登入後落目標頁」，仍然比開首頁好。

訪客、或 `/account/info` 還沒回來時就會是空的。

### 3. 用 `Uri.Builder`，不要字串相接

```kotlin
BuildConfig.CLASS_SWIFT_HUB_URL.toUri().buildUpon()
    .appendPath("signin")
    .appendQueryParameter("returnTo", "/myclass")
    .build().toString()
```

`returnTo` 的值含 `/`，需要 percent-encoding（實際送出是 `returnTo=%2Fmyclass`）。
字串相接還要自己處理 base URL 有沒有結尾斜線 —— 有的話會變成 `//signin`。

---

## 實測（2026-09-02，staging）

用 `admin-swift.aps1.classswift-stg.com` 打，瀏覽器未登入：

1. `{HUB}/signin?returnTo=%2Fmyclass&lang=en`
   → 跨網域重導到 `hub.stage.myviewboard.com/signin?lang=en&returnTo=%2Fmyclass`，**四個參數全保留**
2. 按 Sign In → OIDC 授權頁，`state` 內容是
   `{"subDomain":"hub","returnTo":"/myclass"}` ← **`returnTo` 確實被帶進 state**
3. 完成登入 → 落在 `hub.stage.myviewboard.com/myclass` ✅

**對照組**：直接開 `{HUB}/myclass` 未登入時同樣顯示 Sign In 畫面，但 URL 裡沒有任何
`returnTo`，登入後落在首頁。

> 這個對照在真機上也重現過：裝著「直接開 `/myclass`」版本的 APK，登入後沒有回到 My Class。

**已登入分支**：把 App 實際送出的 URL（帶真實 `orgId` / `userId`）貼進已用同一帳號登入的
瀏覽器 → **直接落 `/myclass`**，org 正確，不觸發任何登入流程。對應 Hub 的
「同帳號同 org → 直接 navigate」。

**真機上 App 送出的 URL**（`adb shell dumpsys activity recents` 撈 intent，logcat 的
`START u0` 那行會截斷）：

```
{HUB}/signin?orgId=<uuid>&userId=<uuid>&returnTo=%2Fmyclass&lang=en
```

---

## 相關

- [README.md](README.md) — Custom Tabs / WebView / 系統瀏覽器怎麼選
- Hub 端契約：`african-golden-cat` 的 `docs/knowledge/features/auth.md`
- 實作：ragdoll-cat `SelectOrgAndSelectClassWindow.buildHubMyClassUrl()`（VSFT-10108）
