# open-web-from-app domain

**App 要把使用者交給一個網頁時，有哪些方式、各自帶不帶得走登入狀態。**

這個 domain 記錄的是跨 repo 的通用知識（Android 端 CS / mVB、以及 Hub 那一側的接口約定），
不綁單一 repo。由 VSFT-10108「選班畫面空狀態的 Open myViewBoard Hub」實作時整理。

| 文件 | 內容 |
|---|---|
| 本頁 | 三種開網頁的方式怎麼選、session 帶不帶得走 |
| [hub-deep-link.md](hub-deep-link.md) | Hub 給 mVB 的 `/signin?orgId&userId&returnTo` 入口與實測 |

---

## 三種方式，先分清楚兩件不同的事

討論這題最容易混淆的是把**「怎麼開」**和**「開哪個 URL」**當成同一個選擇。它們是獨立的兩軸：

- **怎麼開** → 決定 cookie / session 從哪來
- **開哪個 URL** → 決定使用者最後落在哪一頁

以下先講第一軸。

| 方式 | 是什麼 | Cookie / session |
|---|---|---|
| **WebView** | App 內嵌的瀏覽器引擎，畫面是 App 的一部分 | **獨立的 cookie jar**，跟使用者平常用的瀏覽器完全不共用 |
| **Custom Tabs** | 由系統上的瀏覽器（通常是 Chrome）渲染，但外觀嵌在 App 的流程裡 | **與該瀏覽器共用**同一份 cookie / session |
| **系統瀏覽器**（`ACTION_VIEW`） | 直接跳出去開瀏覽器 App | 同上 |

### 關鍵：Custom Tabs 就是外部瀏覽器

這是最常被誤解的一點。Custom Tabs **不是** WebView 的皮膚版本 —— 它是「請已安裝的瀏覽器
幫我渲染這個網址，但長得像我的 App 的一部分」。因此：

- 使用者在 Chrome 登過的網站，Custom Tabs 打開就是登入狀態
- 網站設的 cookie，之後在 Chrome 也看得到

「共用 cookie 與權限」正是 Custom Tabs 相對 WebView 的主要賣點。

### 程式碼上怎麼分辨

```kotlin
val intent = CustomTabsIntent.Builder().setShowTitle(true).build()
intent.intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
intent.launchUrl(context, url.toUri())
```

`CustomTabsIntent` 本質上是一個帶了額外 extras 的 `ACTION_VIEW` intent。

- **沒有 `setPackage()`** → 由系統解析到**預設瀏覽器**。該瀏覽器若支援 Custom Tabs 就以
  Custom Tabs 呈現，不支援就是開一個普通分頁。**兩種結果都是外部瀏覽器，都共用 session。**
- 想指定瀏覽器才需要 `setPackage()`（少見，通常不該做 —— 使用者的預設瀏覽器才是他登入的那個）

### `FLAG_ACTIVITY_NEW_TASK` 不是可選的

從**非 Activity 的 context** 呼叫 `startActivity`（浮動視窗、Service、Application context）
少了這個 flag 會直接丟：

```
Calling startActivity() from outside of an Activity context requires the FLAG_ACTIVITY_NEW_TASK flag
```

CS 的視窗框架（`IWindow`）不是 Activity，所以每一個外開點都必須帶。

### 兩個實務上會炸的地方

**1. 裝置上沒有任何 https handler** → `launchUrl` 丟 `ActivityNotFoundException`。

IFP 這種客製 Android 上真的會發生（有些機型沒有預裝瀏覽器）。如果那條路是畫面上**唯一的出口**，
炸掉等於使用者卡死，要 `runCatching` 接住並降級成 toast。

**2. 共用裝置的殘留 session** —— 見下一節，這是選 URL 時的關鍵。

---

## 第二軸：開哪個 URL

Session 共用是把雙面刃。IFP 是**共用裝置**，瀏覽器裡可能留著別人（或自己另一個帳號）的登入。

於是「直接開目標頁」有兩個問題：

| 情況 | 直接開 `/target` |
|---|---|
| 瀏覽器沒登入 | 網站的 route guard 把人丟到登入頁，而那條路**不知道原本要去哪**，登入完落在首頁 |
| 瀏覽器登的是**別的帳號** | **安靜地顯示別人的資料** —— 沒有錯誤訊息，內容就是不對 |

第二列特別危險，因為它不會 crash、不會有 toast，看起來一切正常。

**解法是網站提供一個 deep-link 入口**，讓 App 把「我是誰、我要去哪」一起送過去，由網站做對帳。
myViewBoard Hub 的做法見 [hub-deep-link.md](hub-deep-link.md)。

---

## 怎麼選

```
要嵌在 App 畫面裡、需要 JS 橋接（例如注入 access token）？
  └─ 是 → WebView（session 獨立，身分要自己傳）
  └─ 否 → Custom Tabs
            └─ 目標是網站的特定頁面，且該網站需要登入？
                  └─ 是 → 走該網站的 deep-link 入口，別直接開目標路徑
                  └─ 否 → 直接開就好
```

ragdoll-cat 兩種都有用：

- **WebView**：Leaderboard（網頁透過 JS 橋回頭跟 App 要 access token）
- **Custom Tabs**：Leaderboard 的 view full record、My Class 的 Hub 連結、選班卡空狀態的 Open Hub

---

## 相關

- [hub-deep-link.md](hub-deep-link.md) — Hub 的 `/signin?orgId&userId&returnTo` 契約與實測結果
- [[mvbf]] / [[cs]] skill — 動這些程式碼前要讀的 repo 規範
