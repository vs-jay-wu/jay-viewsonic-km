# App Launch & Login

<!--
==============================================================
SOURCE TRACKING — 更新 Confluence 後請同步更新此區塊與內文
==============================================================

page_id:        525729796
url:            https://viewsonic-vsi.atlassian.net/wiki/spaces/myViewboar/pages/525729796/AppLaunch+Login
space:          myViewboar
cloned_version: 17
cloned_at:      2026-05-27

Maintenance rule: 每次重新 clone 時，先 commit「同步前差異」說明，再覆寫此檔；
                  版號跟 cloned_at 要同步更新，commit 訊息附 Confluence URL。
==============================================================
-->

> | 來源頁面 | page_id | clone 版本 | clone 日期 |
> |---|---|---|---|
> | [App Launch & Login](https://viewsonic-vsi.atlassian.net/wiki/spaces/myViewboar/pages/525729796/AppLaunch+Login) | 525729796 | v17 | 2026-05-27 |

---

| 欄位 | 內容 |
| --- | --- |
| 埋點目的 | 追蹤「開啟 → 登入 → 回訪」漏斗，量化 App 採用基礎與留存底層健康度，作為其他功能指標的分母 |
| 假設 | 老師從下載到穩定回訪之間，會在啟用、登入、首次成功使用三個節點各自流失，且三段流失原因不同（情境、流程、價值），需分別優化 |
| Action Item | 啟用率偏低 → 優化下載後第一畫面；登入率偏低 → 優化 Onboarding 流程；D7/D30 回訪率偏低 → 強化 onboarding 與第一次成功使用體驗 |

## 1. App Launched

- 之前已埋過此 Event，本次主要改動是：**命名調整**（事件名沒有底線且大寫；事件改和 classswift project 放在一起）
- 跟 Amplitude 自動送的 `Start Session` 有重疊，~~可調整 sdk 設定把預設 timeout 改成 30 分鐘~~
- 用於 active engagement 分析、DAU、retention、漏斗
- **Amplitude SDK 目前有開啟 `defaultTracking.sessions` 嗎？**
  - 沒開 → `session_start` / `session_end` 事件根本不存在，只有 `session_id` 欄位
  - 開了 → 才會跟 App Launched / Ended 有重複問題

| 欄位 | 內容 |
| --- | --- |
| Event Name | **App Launched** |
| Definition | 使用者成功打開 mvb app |
| Trigger Conditions | App 啟用（用戶不需其他行為） |
| Platform | MVB App |
| Common Properties | User Property |
| Unique Properties | N/A |

## 2. App Ended

> 和 App Launched 一起看可檢視 overall 產品使用時長。

- 跟 Amplitude 自動送的 `End Session` 有重疊，~~可調整 sdk 設定把預設 timeout 改成 30 分鐘~~
- 用於 active engagement 分析、DAU、retention、漏斗

| 欄位 | 內容 |
| --- | --- |
| Event Name | **App Ended** |
| Definition | 使用者結束使用 mvb app |
| Trigger Conditions | App 關閉；~~待機時間超過半小時或是進入休眠模式（通常 Amplitude SDK 預設 session 是 5 分鐘 inactive 即結束）~~ |
| Platform | MVB App |
| Common Properties | User Property |
| Unique Properties | See Below |

| Attribute | Data Type | Value | 定義 | Remark |
| --- | --- | --- | --- | --- |
| end reason | String | close app | 定義 user 結束 session 的方式與原因 | **不確定是否可以抓取這樣的資料** |

## 3. Login Method Selected

> 了解登入偏好。

| 欄位 | 內容 |
| --- | --- |
| Event Name | **Login Method Selected** |
| Definition | 使用者選擇 Login 方式登入 mvb app |
| Trigger Conditions | 使用者點擊任一個登入選項或掃 QR code |
| Platform | 登入偏好（原文如此） |
| Common Properties | User Property |
| Unique Properties | See Below |

| Attribute | Data Type | Value | 定義 | Remark |
| --- | --- | --- | --- | --- |
| login method | String | sso / email / qrcode | 登入方式 | 點擊 SSO、輸入 email、QR code 掃描 |
| sso provider | String | apple / google / microsoft / edu cloud | 不同的 SSO | 紀錄是哪一個 SSO 登入，以便確認使用率＆找出優化問題 |

## 4. Login

> 登入體驗品質；推算「啟用 → 登入」轉換。

| 欄位 | 內容 |
| --- | --- |
| Event Name | **Login** |
| Definition | 使用者成功登入 mvb app |
| Trigger Conditions | 使用者登入後跳出成功畫面 |
| Platform | MVB App |
| Common Properties | User Property |
| Unique Properties | See Below |

| Attribute | Data Type | Value | 定義 | Remark |
| --- | --- | --- | --- | --- |
| login method | String | sso / email / qrcode / stay signed in | 登入方式 | 使用 SSO、輸入 email、QR code 掃描、設定自動登入 |
| sso provider | String | apple / google / microsoft / edu cloud | 不同的 SSO | 紀錄是哪一個 SSO 登入 |

## 5. Login Error

> 用於找最不穩定的登入方式；驅動登入重設計。

| 欄位 | 內容 |
| --- | --- |
| Event Name | **Login Error** |
| Definition | 使用者登入 mvb app 時失敗 |
| Trigger Conditions | 使用者登入失敗 |
| Platform | MVB App |
| Common Properties | User Property |
| Unique Properties | See Below |

| Attribute | Data Type | Value | 定義 | Remark |
| --- | --- | --- | --- | --- |
| login method | String | sso / email / qrcode / stay signed in | 登入方式 |  |
| sso provider | String | apple / google / microsoft / edu cloud | 不同的 SSO |  |
| error code | String | invalid password / network timeout | 登入失敗原因 |  |
| error message | String | password wrong | 登入失敗原因 |  |
