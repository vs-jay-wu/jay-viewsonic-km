<!--
==============================================================
SOURCE TRACKING — 更新 Confluence 後請同步更新此區塊與內文
==============================================================

page_id:        567050261
url:            https://viewsonic-vsi.atlassian.net/wiki/spaces/myViewboar/pages/567050261/Android+Activity+Support+1-2+Quiz+ClassSwift+MVP
space:          myViewboar
cloned_version: 2
cloned_at:      2026-07-02

Maintenance rule: 每次重新 clone 時，先 commit「同步前差異」說明，再覆寫此檔；
                  版號跟 cloned_at 要同步更新，commit 訊息附 Confluence URL。
==============================================================
-->

> | 來源頁面 | page_id | clone 版本 | clone 日期 |
> |---|---|---|---|
> | [Android [Activity Support] 1-2 切到 Quiz 課件頁可喚起 ClassSwift 並進行一鍵派題 (MVP)](https://viewsonic-vsi.atlassian.net/wiki/spaces/myViewboar/pages/567050261) | 567050261 | v2 | 2026-07-02 |

# Android [Activity Support] 1-2 切到 Quiz 課件頁可喚起 ClassSwift 並進行一鍵派題 (MVP)

|  | Draft | 16falsedefaultlisttrue |
| --- | --- | --- |
|  | Refinement |
|  |  |
| - | Internal Discussion/ Implementation Stage |

|  |  |
| --- | --- |
| Driver | @Fred |
| Designer | @Hsuan Lee |
| Devs |  |
| Figma | [Figma - mVB 3.0 Windows](https://www.figma.com/design/AucsvzyEE5bD0NEuL8lvD3/-temp--UI-Design---myViewBoard-3.0--Windows-?node-id=40008676-80515&t=2nRnPrcsQmXmzYw8-0) |

---

Background
==========

**Objective**

* 當切換至 Quiz 課件頁時，於畫布右下角新增「開始派題」按鈕，以引導用戶使用 ClassSwift 互動功能。
* 點擊後自動喚起 ClassSwift，並依老師當下的登入 / 班級狀態決定是否需要登入或選取班級；待學生加入後，由 myViewBoard 將該課件頁上的題目走 ClassSwift 既有派題能力派發：

  + 該頁僅 1 題 → 走 Single Dispatch（沿用 Single Quiz spec 的 `create_quiz` socket）
  + 該頁 2 ~ 20 題 → 走 Batch Quiz（沿用 Batch Quiz spec的 `POST /lessons/{lesson_id}/quizzes/batch_quizzes`）
* 派題結束後 ClassSwift 視窗收回，老師回到 myViewBoard 的原課件頁繼續授課。

**Why we need to do this**

* 降低操作摩擦力：自動串接 Quiz 頁面與 ClassSwift 互動功能，省去手動建題流程，達成「隨切隨派」的無縫教學體驗。
* 延伸 Activity Layer 價值：直接調用 Activity Layer 既有題目作為派題素材，將靜態課件即時轉化為互動資源，提升數位資產利用率。
* 整合既有能力，降低認知與開發成本：直接複用 ClassSwift 既有 API 實現單題與批量派題，在不增加開發負擔的情況下，確保用戶體驗的一致性。

---

Solution Overview
=================

**1. 7 階段流程對應表**

依 [Figma 流程](https://www.figma.com/board/WZePH9pdDLnOfxesQhRx91/-Zoe-?node-id=1-71801)，本 spec 的 User Stories 對應到下列 8 個階段：

| 階段 | 說明 | 對應 Story |
| --- | --- | --- |
| 1 | 開啟檔案 | (前置條件，1-1 之前) |
| 2 | Quiz 課件頁，點選「開始派題」**（派題類型決策點見** **2. 派題類型分流****)** | Story 1-1, 1-2 |
| 3 | 啟用 ClassSwift（含 ClassSwift updating loading 畫面） | Story 2-1 |
| 4 | 選擇班級（未登入 / 已登入選班級兩分支） | Story 2-2, 2-3 |
| 5 | 學生加入並開始作答（join class + 派題視窗並列） | Story 2-4, 2-5 |
| 6 | 結束問答並 review（檢討題目） | Story 2-5 |
| 7 | 結束派題（關閉 Quiz 視窗），回到簡報 | Story 4-3 |

**2. 派題類型分流（Single Dispatch vs Batch Quiz）**

系統自動偵測 Quiz 課件頁的題目數，決定派題流程。判定時機在點擊「開始派題」當下、由 Activity Layer parser 提供 N 即可決策：

| # | 該頁可派題目數 N | 派題類型 | 觸發 API / Socket | 來源規則 |
| --- | --- | --- | --- | --- |
| MVP | N = 1 | Single Dispatch | `create_quiz` socket | Single Quiz spec |
| 2 ≤ N ≤ 20 | Batch Quiz | `POST /lessons/{lesson_id}/quizzes/batch_quizzes` | Batch Quiz spec「題目 ≥ 2 且 ≤ 20 才可派 batch」 |
| Editor 會擋，不會在 App 出現這些情境 | N = 0 | - | - | ~~mVB app 開啟空白 (背景+課件底色白色），但不顯示 start question~~ |
| N > 20 | - | - | ~~Batch Quiz 既有行為：交互 (disable勾選框當滿20題時）、引導 (提示限制20題)~~ |

> 設計原則：
>
> * 判定 = 階段 2 點擊當下：由 parser 解析該頁可派題目數 N 即決策。
> * 執行 = 階段 5 派題視窗呈現：依 N 對應的 API 送出。
> * 本 spec 主路徑為 Batch Quiz（N ≥ 2）；Single Dispatch 子路徑沿用 Single Quiz spec 既有行為，於各 Story 以分流 AC 標示。

‌

**3. 階段 5 Path A / Path B 判斷分支 (Phase 2 Scope)**

「學生加入並開始作答」分為兩條路徑，由系統依 session 狀態自動判斷。Path B 觸發條件採「全部成立」邏輯：

| 條件（全部 AND 成立 → Path B；任一條件不成立 → Path A） | 判斷依據 |
| --- | --- |
| 同份 OLF 未關閉 | OLF session lifecycle |
| 已完成選班且 lesson 未變 | ClassSwift lesson\_id |
| 學生已 join 過該 lesson **或** 已派過 ≥ 1 輪題目 | ClassSwift 班級 + 派題狀態 |

> * Path A：首次派題、學生未加入過、或上述任一條件不成立 → join class + 派題視窗並列，join class 在最上層。
> * Path B：上述條件全部成立 → 跳過 join class，直接顯示派題視窗。
> * Session 重設條件：OLF 關閉、ClassSwift 端切到另一 lesson → 任一發生即 invalidate，下次回 Path A。

‌

**4. 核心設計目標**

* 單一入口：Quiz 課件頁固定提供「開始派題」按鈕，可見性與 Activity Layer 的 `quiz` 標記綁定。
* 零手動步驟：該頁全部題目自動成為派題範圍，不需手動勾選。
* 題數感知分流：N=1 走 single、N≥2 走 batch，老師端體驗一致（同樣的按鈕、同樣的流程感）。
* 狀態感知 Path A/B：依班級啟用與學生加入狀態自動判斷。
* 走既有 API：完全沿用 Single Quiz / Batch Quiz API 與既有 socket events，不新增 endpoint。
* 跨平台一致：Windows / Flutter (Android) 兩平台行為一致。

---

User Flow
=========

![image-20260507-084008.png](https://viewsonic-vsi.atlassian.net/wiki/rest/api/content/567050261/child/attachment/att567050291/download)

---

User Stories & AC
=================

| Story | Phase 1 處理範圍 | 分類（§2 對照） |
| --- | --- | --- |
| Story 1-1 — Quiz CTA | 必出現於 Quiz 課件頁，含 UI 簡化、答案揭示、單/多題視覺一致 | 🔴 完全新增 |
| Story 1-2 — 點擊觸發 | toggle 觸發、Loading、派題類型決策、流程交棒、15s timeout、失敗回復 | 🔴 完全新增 |
| Story 2-1 — 自動喚起 ClassSwift | mVB 呼叫 protocol handler，沿用 ClassSwift 喚起既有行為 | 🟡 主要沿用 |
| Story 2-2 — 登入 / 班級判斷 | mVB 端依 ClassSwift status 判斷分支 | 🟠 部分沿用 |
| Story 2-3 — 選擇組織 / 班級 | 完全沿用 Windows Integration Phase 1，僅銜接 | 🟢 完全沿用既有 |
| Story 2-4（僅 Path A）— 派題視窗呈現 | Path A × Single + Path A × Batch，視窗位置由 ClassSwift 控制 | 🟠 部分沿用 |
| Story 2-5.A — Single Dispatch | 完全沿用 Single Quiz spec，mVB 僅呼叫 | 🟢 完全沿用既有 |
| Story 2-5.B — Batch Quiz | 完全沿用 Batch Quiz spec，mVB 僅呼叫 | 🟢 完全沿用既有 |
| Story 2-5.C — 共通邊界 | 完全沿用 socket reconnect + Phase 0 | 🟢 完全沿用既有 |
| Story 3-1 — 題型對應（4 種） | mVB 端打包邏輯 | 🟠 部分沿用 |
| Story 4-1（最小集）— 按鈕狀態 | 派題狀態保留 + 重派觸發 | 🔴 完全新增 |
| Story 4-2（最小集）— 錯誤處理 | 顯示錯誤後 abort，不做 retry | 🟠 部分沿用 |
| Story 4-3 — 結束派題 | 派題收合沿用 Phase 0；對話框 + 按鈕復原為新增 | 🟠 部分沿用 |

### Story 1-1：（🔴 完全新增）App 切到 Quiz 課件頁顯示「開始派題」CTA

> As a 老師   
> I want 在切換到 Quiz 課件頁時，畫布上自動出現「開始派題」按鈕   
> So that 我能立即認知到這是一個可互動派題的課件

依 [Figma - Start question from slide](https://www.figma.com/design/AucsvzyEE5bD0NEuL8lvD3/-temp--UI-Design---myViewBoard-3.0--Windows-?node-id=44-528&p=f&t=idFaoGYonOv2YHpD-0) 說明，Quiz 課件頁在 App 的呈現如下：

![image-20260506-050044.png](https://viewsonic-vsi.atlassian.net/wiki/rest/api/content/567050261/child/attachment/att567050306/download)

| # | 變更 | 說明 |
| --- | --- | --- |
| 1 | 新增 | Client side 切換到 Quiz 課件頁時顯示「開始派題」CTA |
| 2 | 移除 | 原 Hub 課件頁中「帳號」、「編輯」、「刪除頁面」、「解析」（Phase 1 不提供）相關 CTA 不顯示 |
| 3 | 保留 | 「答案」按鈕，點擊則顯示答案（多選/ 單選/ 是非)；「答案」按鈕不顯示 (簡答) |

**Acceptance Criteria**

| Topic | Given | When | Then | Remark | **QA test result** |
| --- | --- | --- | --- | --- | --- |
| 派題入口顯示 | 已開啟一份含有 Quiz 課件的 OLF 檔案 | 用戶切到 Quiz 課件頁 | 顯示「開始派題」按鈕 | [課件+開始派題按鈕尺寸](https://www.figma.com/design/AucsvzyEE5bD0NEuL8lvD3/-temp--UI-Design---myViewBoard-3.0--Windows-?node-id=40008676-80515&t=2nRnPrcsQmXmzYw8-0) |  |
| 入口可見性收斂 | 已開啟一份 OLF 檔案 | 用戶切到非 Quiz 課件頁（e.g. Phet、純內容） | 不顯示「開始派題」按鈕 |  |  |
| UI 簡化 | 在 Quiz 課件頁 | 渲染右上角工具列 | 不顯示「帳號」、「編輯」、「刪除頁面」、「解析」CTA |  |  |
| 答案揭示 | 在 Quiz 課件頁 | 老師點擊「答案」CTA | 切換為顯示正解模式（含已標示正解 highlight） |  |  |
| 與圖層規格對齊 | 在 Quiz 課件頁 | 老師在頁面上書寫 (Inking) 或新增 Element | 「開始派題」按鈕仍可點，不被其他物件遮擋 |  |  |
| Prepare / Present Mode 一致 | 在 Quiz 課件頁 | 切換 Edit / Present 模式 | 兩種模式下按鈕可見性與行為一致 |  |  |
| 單題分流 | 該頁含 1 題（N = 1） | 老師看到按鈕 | 與多題情境視覺一致；點擊走 Single Dispatch | 老師端不需感知差異 |  |
| 多題分流 | 該頁含多題（N > 1） | 老師逐題瀏覽 | 按鈕始終可見且狀態一致；點擊走 Batch Quiz | 該頁 N 題視為單一 batch |  |

---

### Story 1-2：（🔴 完全新增）點擊「開始派題」開啟 ClassSwift toggle

> As a 老師   
> I want 點擊按鈕後系統能立即回饋並開啟 ClassSwift 派題流程   
> So that 我能確定點擊已被接收，後續流程由 ClassSwift 接手

**Acceptance Criteria**

| Topic | Given | When | Then | Remark | **QA test result** |
| --- | --- | --- | --- | --- | --- |
| Toggle 觸發 | 「開始派題」按鈕為可點狀態（enblaed) | 用戶點擊「開始派題」按鈕 | 「開始派題」按鈕進入 disable 狀態，觸發 ClassSwift Toggle 開啟 | 截圖 2026-05-07 下午4.54.54-20260507-085520.png |  |
| 失敗回復 | 「開始派題」按鈕已 loading | 任一階段失敗 | 「開始派題」按鈕回復可點 (enabled)，toast / dialog 顯示錯誤 | toast 顯示秒數 flutter 原本定義 |  |

---

### Story 2-1：（🟠 部分沿用）自動喚起 ClassSwift

> As a 老師   
> I want 點擊後 mVB 能自動喚起 ClassSwift   
> So that 我不需要手動切換 App 即可開始派題

**Acceptance Criteria**

| Topic | Given | When | Then | Remark | **QA test result** |
| --- | --- | --- | --- | --- | --- |
|  | 不論用戶是否登入，點擊開始派題後 | 喚起 ClassSwift 時 | 打開 loading 視窗，完成 OTA, token 交換, 等相關判斷 | [Android] 啟動 ClassSwift (開關定義)  細節參考 | 沿用 |

---

Story 2-2.A（🟠 部分沿用）已登入 → 取得班級列表並選班
----------------------------------

> As a 老師 / I want 已登入時系統自動取得班級列表並引導我選班 / So that 派題能正確掛在我指定的班級上

| **Topic** | **Given** | **When** | **Then** | **Remark** |
| --- | --- | --- | --- | --- |
| 已登入 | 已登入並打開 CS | 系統取得班級列表 | 引導建立班級後或使用 one-time class | 沿用 |
| API 失敗處理 | 班級列表 API 取得失敗 | 系統嘗試取得 | 顯示錯誤 + 重試按鈕 | 沿用 |

---

Story 2-2.B（🟠 部分沿用）未登入 → 直接派題，不走選班
----------------------------------

> As a 老師 / I want 未登入時也能直接派題 / So that 我不需要先登入即可快速開始互動

| Topic | Given | When | Then | Remark |
| --- | --- | --- | --- | --- |
| 未登入直接派題 | 未登入用戶 | 點擊「開始派題」 | **不取班級列表、不進選班**，直接進入派題視窗呈現 |  |

---

### Story 2-4：（🟠 部分沿用）首次派題視窗呈現（Path A）

> As a 老師   
> I want 首次派題時系統能同時呈現 join class 視窗與派題視窗（並列），讓學生加入班級並開始作答   
> So that 課堂上可以順利完成「老師派題 → 學生加入 → 學生作答」的開場流程

**Acceptance Criteria**

| Topic | Given | When | Then | Remark | **QA test result** |
| --- | --- | --- | --- | --- | --- |
|  | 已登入或未登入的使用者 | 進入班級成功後 | 顯示 quizzing 視窗 + join class 視窗 (可能不顯示) | quzzing 視窗顯示取決是單題或多題派送分別顯示  Join Class 視窗的顯示取決於 (學生清單已加入 > 1) |  |

---

### Story 4-1：（🔴 完全新增）派題期間的按鈕狀態管理

> As a 老師   
> I want 派題期間 mVB 的「開始派題」按鈕能反映當前狀態   
> So that 我不會在同一頁重複派題造成衝突

**Acceptance Criteria**

| Topic | Given | When | Then | Remark | **QA test result** |
| --- | --- | --- | --- | --- | --- |
| 派題狀態保留 | Single / Batch quiz 進行中（status = OPEN） | 切離再切回該頁 | 「開始派題」按鈕呈現 disabled，無法重複派題 | new |  |

---

### Story 4-2：（🟠 部分沿用既有）網路與 API 失敗處理並反應在 mVB

> As a 老師   
> I want 網路或 API 異常時系統能給予清楚的提示   
> So that 我能在課堂中快速判斷是否需要等待或改用其他方式

**Acceptance Criteria**

| Topic | Given | When | Then | Remark | **QA test result** |
| --- | --- | --- | --- | --- | --- |
| 連線異常 | mVB ↔ ClassSwift 通訊中斷 | 用戶點擊「開始派題」 | 顯示連線錯誤 + abort；不送 single 或 batch API | * myViewBoard ↔ ClassSwift AppServiceConnection: 事件 / Action 清單 - IPC 通訊事件 / 中斷情境 | Pass |
| Single API 失敗 | Single `create_quiz` socket 失敗 | 系統送出 | 顯示錯誤 + abort；不顯示派題進行中 UI | * Single Quiz API Spec - Single API error responses | N/A |
| Batch 後端錯誤 | Batch API 5xx | 系統送出 | 顯示伺服器忙碌 + abort | * Batch Quiz API Spec - Batch API error codes | N/A |
| 異常退出處理 | 派題流程中 mVB 異常退出 | 用戶重啟 | 不主動重送；按鈕依當前派題 status 決定 | * myViewBoard ↔ ClassSwift AppServiceConnection: 事件 / Action 清單 - status sync events | Pass |

---

### Story 4-3：（🟠 部分沿用既有）結束派題回到簡報

> As a 老師   
> I want 派題結束、檢討完題目後，ClassSwift 視窗能收回，讓我回到原本的課件頁繼續授課   
> So that 派題結束後我能無縫回到簡報，不需手動關閉 ClassSwift

**Acceptance Criteria**

| Topic | Given | When | Then | Remark | **QA test result** |
| --- | --- | --- | --- | --- | --- |
| 派題收合 | Single / Batch quiz 已 FINISH + REVEAL/DISCLOSED | 老師點擊 ClassSwift 端「結束派題」 | mVB 活動頁上的開始派題按鈕由 disable 轉變成 enable |  | Pass |
| 強制結束確認 | Single / Batch 進行中（status = OPEN）有學生未答完 | 老師主動點擊 ClassSwift 端「結束派題」 | mVB 活動頁上的開始派題按鈕由 disable 轉變成 enable |  | Pass |

---

Scope
=====

| 階段 | Phase 1（MVP） | Phase 2（留存體驗） | Phase 3（市場擴張） |
| --- | --- | --- | --- |
| 核心目標 | 在 Windows 平台跑通「Quiz 課件頁 → CTA → ClassSwift 派題 → 學生作答 → 揭示答案 → 結束回 mVB 簡報」完整 happy path，驗證老師直接從課件頁派題的真實需求 | 強化連續使用與異常處境，讓反覆派題、課堂網路抖動、跨頁切換、長時間 Late Join 都不掉鏈 | 擴大題型與平台覆蓋，把 ClassSwift 派題從 Windows + 4 種題型延伸到更多教學情境與裝置 |
| 範圍 | ・mVB 端整合 + CTA 入口 ・Single / Batch 派題類型自動分流 ・4 種題型打包 ・沿用現行 ClassSwift / Single Quiz / Batch Quiz 視窗交互（不動既有邏輯） ・N=1 與 N≥2 課件頁皆支援 | ・Path B shortcut（連續派題免重新 join class） ・完整 retry 機制 ・多頁狀態獨立 ・Late Join 長時間驗證 ・部分 invalid UX | ・Phase 2 題型啟用（投票單 / 投票多 / 錄音） ・Android Flutter 平台 ・跨裝置同步 |
| 商業價值 | ・覆蓋主路徑：N=1 / N≥2 課件頁皆能用，不因題目數 block 老師 ・零 regression 風險：只新增 mVB 整合代碼，不動既有 ClassSwift / Quiz 邏輯 ・延伸 Activity Layer 價值：靜態課件即時轉化為互動資源，提升 mVB Hub 內容資產利用率 | ・第二次派題不重等學生加入 ・課堂網路抖動不掉鏈 ・提升老師連續使用意願與課堂韌性 | 拓展題型廣度與平台廣度，覆蓋更多教學情境與更多裝置使用者 |
| 成功驗證 | 4 週內交出可用版本，邀請種子學校試用，測量「老師從 Quiz 課件頁直接派題」的真實使用率，作為決定是否投資 Phase 2 / 3 的依據 | 連續派題完成率、Late Join 成功率、retry 觸發率等指標 | 新題型使用分布、Android 安裝與留存、跨裝置同步成功率等 |

---
