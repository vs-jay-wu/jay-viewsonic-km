# Beta Program

<!--
==============================================================
SOURCE TRACKING — 更新 Confluence 後請同步更新此區塊與內文
==============================================================

page_id:        529629261
url:            https://viewsonic-vsi.atlassian.net/wiki/spaces/myViewboar/pages/529629261/BetaProgram
space:          myViewboar
cloned_version: 17
cloned_at:      2026-05-28

Maintenance rule: 每次重新 clone 時，先 commit「同步前差異」說明，再覆寫此檔；
                  版號跟 cloned_at 要同步更新，commit 訊息附 Confluence URL。
==============================================================
-->

> | 來源頁面 | page_id | clone 版本 | clone 日期 |
> |---|---|---|---|
> | [Beta Program](https://viewsonic-vsi.atlassian.net/wiki/spaces/myViewboar/pages/529629261/BetaProgram) | 529629261 | v17 | 2026-05-28 |

---

### 指標：用戶對 Beta 的認知與興趣強度

Beta Beta 為 MVB 整合 ClassSwift 功能，主打「師生互動」場景。本指標數據同時是新策略服務的驗證起點

| 埋點目的 | 想要知道有多少使用者點擊 Join Beta 這個按鈕，驗證用戶對 MVB 整合 ClassSwift（Beta 主打的師生互動服務）感知 → 興趣轉換。 |
| --- | --- |
| 假設 | 若服務內容對老師有共鳴，曝光累積後會看到明顯的點擊轉換 若宣傳/ 曝光足夠但點擊低迷、調整內外部宣傳後也不見起色，代表整合的價值主張沒接到用戶需求，是策略方向的早期警訊，而不是後段體驗問題。 |
| Action Item | * 點擊率可接受 → 需求方向被驗證，繼續推進到 Beta 內的體驗驗證，並整理出名單做為行銷使用。 * 點擊率偏低 → 調整對內/ 外溝通 * 調整後仍極低 → 早期警訊，策略定位需要重新檢視主打 ClassSwift 功能，強調「學生與老師互動」。本指標數據同時是新策略服務的驗證起點 |
| Remark | 1. 需要在 5/20 sprint 開始做埋點 2. 以下事件的 user properties 請參考: [👨‍👩‍👧‍👦 User Properties - VSX ClassSwift Amplitude Event Tracking - ViewSonic Confluence](https://viewsonic-vsi.atlassian.net/wiki/spaces/VCAET/pages/96043154) |

| 欄位 | 內容 |
| --- | --- |
| **Event Name** | **Beta Program Joined Clicked** |
| Definition | 使用者有點擊 Join beta program app 按鈕。 |
| Trigger Conditions | 點擊Join beta program app按鈕。 |
| Notes | 用於追蹤有點擊的使用者名單。Windows/ Android 都有。 |
| Platform | MVB APP |
| Common Properties | User Property |
| Unique Properties | N/A |

| Attribute | Data Type | Value | 定義 | Remark |
| --- | --- | --- | --- | --- |
| email | String | 12345@gmail.com | 使用者信箱 | 從後端database拿取user id的email |

![image-20260519-074533.png](https://viewsonic-vsi.atlassian.net/wiki/download/attachments/529629261/image-20260519-074533.png?version=1&modificationDate=1779176736669&cacheVersion=1&api=v2)
