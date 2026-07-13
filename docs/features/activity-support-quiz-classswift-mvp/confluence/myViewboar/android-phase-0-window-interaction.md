<!--
==============================================================
SOURCE TRACKING — 更新 Confluence 後請同步更新此區塊與內文
==============================================================

page_id:        482148681
url:            https://viewsonic-vsi.atlassian.net/wiki/spaces/myViewboar/pages/482148681
space:          myViewboar
cloned_version: 10
cloned_at:      2026-07-10

Maintenance rule: 每次重新 clone 時，先 commit「同步前差異」說明，再覆寫此檔；
                  版號跟 cloned_at 要同步更新，commit 訊息附 Confluence URL。
==============================================================
-->

> | 來源頁面 | page_id | clone 版本 | clone 日期 |
> |---|---|---|---|
> | [[Android] Phase 0 - 視窗交互行為](https://viewsonic-vsi.atlassian.net/wiki/spaces/myViewboar/pages/482148681) | 482148681 | v10 | 2026-07-10 |

> 被 [Story 4-3（結束派題回到簡報）](activity-support-1-2-quiz-classswift-mvp.md) 的 Remark 引用：「ClassSwift 視窗依 **Phase 0 規則收合**，ClassSwift Toggle 不會自動關閉」。此頁定義 mVB toolbar 上 CS 視窗的最小化 / 前景化 / 收合等交互行為。

---

| **Driver** | @Fred |
| --- | --- |
| **Contributors (FE)** |  |
| **Contributors (Design)** | @Hsuan Lee |
| **Contributors (QA)** | @張政揚 |
| **wireframe** |  |
| **UI Figma Link** |  |
| **Platform** |  |
| **Ticket / Status** |  |

none

**Change Log**

| **Owner** | **Description** | **Date** |
| --- | --- | --- |
| @Fred | 1.Story 1-1 更改視窗 selected 的狀態下，點擊應最小化  2.Story 1-2更新最小化視窗後的新設計  3.Story 2-1 join class 視窗不在被動縮小的範圍 |  |
| @Fred | Story 2-1 新增 magic box / file management 也要觸發視窗最小化的 event |  |

## mVB toolbar 上的 ClassSwift 視窗交互行為定義

### Story 1-1: mVB toolbar 呼叫 CS 視窗行為

* As a PM
* When 老師點擊 mVB 上與 CS 相關的功能時，定義明確的體驗流程
* so that 老師可以在不被干擾的狀態，啟用互動功能

| **when** | **given** | **then** | **備註** | **QA testing result** |
| --- | --- | --- | --- | --- |
| 在mVB cs按鈕 enable 的情況 | 如果有任一 CS 視窗顯示 | 相對應 mVB toolbar 狀態為 selected。如果點擊 selected 的按鈕 該對應視窗 ~~bring to top~~，最小化並顯示最小化狀態 |  |  |
| 在mVB cs在按鈕 enable 的情況 | 如果有任一 CS 視窗關閉 | 相對應的 mVB toolbar 狀態為 unselected |  | Pass |
| 在mVB cs按鈕 enable 的情況 | 當 CS 學生清單頁顯示時 | Toolbar Class 按鈕切為 Selected 狀態，點擊時將 CS 學生清單頁最小化並顯示最小化狀態 |  |  |
| 在mVB cs按鈕 enable 的情況 | 當 CS 學生清單頁關閉時 | Toolbar Class 按鈕切為 Unselected 狀態，點擊時開啟 CS 學生清單頁 |  | Pass |
| 在mVB cs按鈕 enable 的情況 | 點擊 Toolbar Quiz 按鈕時 | MVB 開啟 Quiz Submenu（[Figma](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=1814-86281)）image-20260311-062953.png |  | Pass |
| 在mVB cs按鈕 enable 的情況 | **CS 有任一題型或任務、batch quiz 進行中** | **Toolbar Quiz 按鈕切為 Selected 狀態，點擊時將相對應題型或任務最小化並顯示最小化狀態** |  | 目前有 [Bug (CLSWAN-1245)](https://viewsonic-vsi.atlassian.net/browse/CLSWAN-1245) |
| 在mVB cs按鈕 enable 的情況 | **CS 沒有題型或任務、batch quiz 進行中** | **Toolbar Quiz 按鈕切為 Unselected 狀態，點擊時 MVB 開啟 Quiz Submenu** |  | Pass |
| 在mVB cs按鈕 enable 的情況 | 當 CS Quiz Collection 頁顯示時 | Toolbar Quiz Collection 按鈕切為 Selected 狀態，點擊時將 CS Quiz Collection 頁最小化並顯示最小化狀態 |  |  |
| 在mVB cs按鈕 enable 的情況 | 當 CS Quiz Collection 頁關閉時 | Toolbar Quiz Collection 按鈕切為 Unselected 狀態，點擊時開啟 CS Quiz Collection 頁 |  | Pass |
| 在mVB cs按鈕 enable 的情況 | 當使用者從 CS Quiz Collection 頁派題時 | * Toolbar Quiz Collection 按鈕切為 Unselected 狀態，視窗關閉，可再點擊 toolbar 開啟 CS Quiz Collection 頁 <br> * Toolbar Quiz 按鈕切為 Selected 狀態，點擊時將相對應題型或任務最小化並顯示最小化狀態 |  |  |

### Story 1-2: minimize 視窗行為優化

* As a 老師
* When CS 視窗被縮小時，希望有明確的縮小顯示
* so that 意識到視窗被縮小，並快速叫回視窗

| **Given** | **When** | **Then** | **備註** |
| --- | --- | --- | --- |
| 在 toolbar 位於上/下/左/右的位置下 | 使用者主動點擊 CS 視窗縮小或被動縮小 (story2-1) | * CS 視窗顯示縮小動畫（動畫依照 toolbar 位置動態調整）* toolbar 上顯示縮小後的狀態 | 縮小狀態會增加點擊展開的範圍，Android 無 hover 狀態 image-20260413-035751.png |

### Story 1-3: 使用者沒使用 mVB 狀態下

* As a 教師，
* when I 當我在 IFP 上切換畫面至首頁或開啟外部程式時
* so that ClassSwift 不能影響操作

| **when** | **given** | **then** | **QA testing result** |
| --- | --- | --- | --- |
| 在 mVB 與 CS 同時存在的情況下 | 當 mVB app 沒有在視窗前景 | ClassSwift 自動隱藏，若恢復前景則顯示 | Pass |

### Story 2-1: 降低 CS 視窗干擾 mVB 的操作體驗

* As a 教師，
* when I 同時操作 myViewBoard (mVB) 與 ClassSwift (CS) 時，我需要良好的 UX 體驗
* so that 避免 CS 面板遮擋 mVB 功能造成操作不便。

| **when** | **given** | **then** | **備註** | **QA testing result** |
| --- | --- | --- | --- | --- |
| CS 的視窗開啟（不含 select class / join class）兩個視窗 | 點擊 mVB 的 [背景管理] [頁面管理] image-20260401-040250.png / [筆] [橡皮擦] [形狀] [線條] [文字] [便利貼] [My Class] [Question] [Quiz Collection] image-20260401-040238.png / [帳號與設定] image-20260401-040227.png / [X] - 主程式 image-20260401-040306.png / [X] - tab image-20260401-040334.png | CS 畫面自動最小化，toolbar 顯示最小化狀態 | 現階段 windows 可接受在 select org 畫面，若畫布有內容，點擊 [X] 仍然被擋住。新增 [magic box] [file Management]、[Embedded browser] [Screenshot] |  |
| 在使用者叫出遮罩情境下 |  | 所有 ClassSwift 的視窗最小化（包含 join class / select org） |  |  |
