# Engagement Tools Event Tracking

<!--
==============================================================
SOURCE TRACKING — 更新 Confluence 後請同步更新此區塊與內文
==============================================================

page_id:        602669510
url:            https://viewsonic-vsi.atlassian.net/wiki/spaces/myViewboar/pages/602669510/EngagementToolsEvent+Tracking
space:          myViewboar
cloned_version: 6
cloned_at:      2026-08-19

Maintenance rule: 每次重新 clone 時，先 commit「同步前差異」說明，再覆寫此檔；
                  版號跟 cloned_at 要同步更新，commit 訊息附 Confluence URL。
==============================================================
-->

> | 來源頁面 | page_id | clone 版本 | clone 日期 |
> |---|---|---|---|
> | [Engagement Tools Event Tracking](https://viewsonic-vsi.atlassian.net/wiki/spaces/myViewboar/pages/602669510/EngagementToolsEvent+Tracking) | 602669510 | v6 | 2026-08-19 |

---

**埋點目的**：量化「Increase class engagement」六個課中互動工具（Timer / Throw / Dice / Participate Mode / Flashcards / Sticky Note）的實際使用率，作為課中 engagement 指標的組成；同時驗證老師「課中與學生互動」的需求強度。

**假設**：有真實互動需求的老師會反覆使用這些工具；單機型工具（Timer / Dice / Flashcards / Sticky Note）與學生裝置參與型工具（Throw / Participate Mode）反映不同深度的互動需求，需分開看。

**Action Item**：

* 整體使用率低 → 先用入口曝光數據判斷是「不知道有」還是「不需要」
* Throw / Participate 使用率高 → 佐證學生端互動（ClassSwift 整合）的投資方向
* 單一工具使用率特別低 → 檢視該工具的入口與首次使用體驗

以下事件的 User Properties 請參考 [User Property](../VCAET/user-properties.md)。事件命名依循既有慣例：無底線、每字大寫（如 App Launched）。

---

### 1. Timer Started

> 觀察老師課堂節奏管理需求（倒數計時 vs 碼表），與常用時長分佈。

| 欄位 | 內容 |
| --- | --- |
| **Event Name** | **Timer Started** |
| Definition | 使用者成功開始 Timer 計時（倒數或碼表）。 |
| Trigger Conditions | 使用者按下 Play 且計時成功開始。每次開始計時記一次；僅把 Timer 加到畫布不算。 |
| Platform | Windows / Flutter / Mac |
| Common Properties | User Property |
| Unique Properties | See Below |

| Attribute | Data Type | Value | 定義 | Remark |
| --- | --- | --- | --- | --- |
| timer mode | String | count down / stopwatch | 使用倒數或碼表 | 對應 code 的 countDown / countUp 兩種模式 |
| preset seconds | Integer | 300 | 倒數設定的秒數 | 預設 5 分鐘、上限 99:59:59；stopwatch 不帶此值。可分析常用時長 |

---

### 2. Throw File Imported

> 學生裝置參與型：學生掃 QR code / 輸入網址，把自己裝置上的檔案上傳到白板 session，老師再匯入畫布。此事件是「師生內容互動」的直接證據。

| 欄位 | 內容 |
| --- | --- |
| **Event Name** | **Throw File Imported** |
| Definition | 老師把學生上傳的檔案成功匯入畫布。 |
| Trigger Conditions | 從 Throw 面板（雙擊或多選匯入）或通知中心點擊，檔案成功下載並放上畫布。 |
| Platform | Windows / Flutter / Mac |
| Common Properties | User Property |
| Unique Properties | N/A |

---

### 3. Dice Rolled

> 觀察隨機抽選/遊戲化需求；自訂面（文字/圖片）使用率反映進階自訂需求。

| 欄位 | 內容 |
| --- | --- |
| **Event Name** | **Dice Rolled** |
| Definition | 使用者成功擲出骰子。 |
| Trigger Conditions | 點擊骰子成功擲出（roll）。每次擲出記一次；僅把 Dice 加到畫布不算。 |
| Platform | Windows / Flutter / Mac |
| Common Properties | User Property |
| Unique Properties | See Below |

| Attribute | Data Type | Value | 定義 | Remark |
| --- | --- | --- | --- | --- |
| dice type | String | classic / text / image | 骰面類型 | 對應編輯器的三種類型；text / image 使用率可反映自訂需求 |
| dice count | Integer | 1–9 | 一次擲出的骰子數量 | code 上限 9 顆，預設 1 |

---

### 4. Participate Mode Used

> 單機分割畫布：螢幕分成 1–6 格獨立白板，多位學生同時上台書寫。觀察「多人上台」情境的真實需求。

| 欄位 | 內容 |
| --- | --- |
| **Event Name** | **Participate Mode Used** |
| Definition | 使用者成功使用 participate mode（有實際書寫才算）。 |
| Trigger Conditions | 成功打開 participate mode 且有書寫（老師或學生寫皆算），一個 session 記一次。 |
| Platform | Windows / Flutter / Mac |
| Common Properties | User Property |
| Unique Properties | See Below |

| Attribute | Data Type | Value | 定義 | Remark |
| --- | --- | --- | --- | --- |
| board count | Integer | 1 / 2 / 3 / 4 / 6 | 該 session 的分割格數 | code 僅支援這五種格數（無 5），預設 4。反映同時上台人數 |

---

### 5. Flashcard Flipped

> 單張卡片為獨立畫布物件（無牌組概念）。翻面是 flashcard 的核心使用動作。

| 欄位 | 內容 |
| --- | --- |
| **Event Name** | **Flashcard Flipped** |
| Definition | 使用者成功翻面 flashcard。 |
| Trigger Conditions | 雙擊卡片成功翻面（flip）。每張卡片首次翻面記一次；僅把卡片加到畫布、尚未翻面不算。 |
| Platform | Windows / Flutter / Mac |
| Common Properties | User Property |
| Unique Properties | N/A |

---

### 6. Sticky Note Created

> 入口與其他工具不同：在 main tool bar，不在 magic box。觀察便利貼在腦力激盪/意見蒐集情境的使用。

| 欄位 | 內容 |
| --- | --- |
| **Event Name** | **Sticky Note Created** |
| Definition | 使用者成功建立便利貼並輸入內容。 |
| Trigger Conditions | 成功新增便利貼且有輸入內容（文字或手寫任一）。新增後未輸入任何內容不算。 |
| Platform | Windows / Flutter / Mac |
| Common Properties | User Property |
| Unique Properties | N/A |
