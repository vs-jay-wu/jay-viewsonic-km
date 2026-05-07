# [Android Integration] Phase3 - Question / Quiz Collection

> 來源：https://viewsonic-vsi.atlassian.net/wiki/spaces/myViewboar/pages/489259385/Android+Integration+Phase3+-+Quesion+Quiz+Collection  
> 最後更新（Confluence）：2026-05-04  
> Clone 日期：2026-05-06

---

|  **Driver** | @Fred |
| --- | --- |
| **Contributors (FE)** | 星期六浩克 scrum team - EDU |
| **Contributors (Design)** | @Hsuan Lee |
| **Contributors (QA)** | @張政揚 |
| **UI Figma Link** | Question: [node-id=1698-71915](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=1698-71915&p=f&version-id=2344465911753128092&focus-id=7624-238778&view=focus&m=dev)<br><br>Close question: https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3563-59518&p=f&version-id=2346932927529601611&focus-id=3581-126751&view=focus&m=dev<br><br>Quiz collection: https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=1698-71916&p=f&version-id=2346937802333228783&focus-id=9200-160086&view=focus&m=dev<br><br>Quiz collection / Details: https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=2999-100543&p=f&version-id=2346934116695014269&focus-id=9200-178274&view=focus&m=dev |
| **Platform** | Android |

**Change Log**

| **Owner** | **Description** | **Date** |
| --- | --- | --- |
| @Fred | | |

---

## VSDS Dialog Box 元件說明

> Figma 來源：[Design-Kit---VSDS node-id=4474-609094](https://www.figma.com/design/T01QmXmsYxEPcZT53UHkco/Design-Kit---VSDS?node-id=4474-609094&m=dev)

本規格中多處提及「確認關閉 dialog」，統一採用 VSDS 設計系統的 `dialog-box` 元件（Size = small）。

### 元件結構

```
┌─────────────────────────────────────┐
│ [Banner 圖片區 - 選用]          [X] │
│                                     │
│ 🔔 Title                            │
│ Description 說明文字                │
│ ┌──────────────────────────────┐   │
│ │  Content replacement area     │   │  ← 選用自訂內容插槽
│ └──────────────────────────────┘   │
│ ─────────────────────────────────  │
│ [Action3]  ℹ Info  [Action2] [Action1] │
└─────────────────────────────────────┘
```

### 各區塊說明

| 區塊 | 說明 |
| --- | --- |
| Close [X] | 右上角 ghost icon-only 按鈕（xs size），點擊等同取消 |
| Banner | 選用頂部圖片，不使用時省略 |
| Title | 粗體標題（headline/sm bold），可附前置 icon |
| Description | 說明文字（body/xs regular，色調 text-200 灰色） |
| Content replacement area | 虛線框自訂內容插槽，不需自訂內容時省略 |
| Divider | footer 上方的水平分隔線 |
| Action3（左側） | outlined 次要動作，例如「第三選項」，非必要可省略 |
| Information（左側） | ℹ icon + 文字說明，非必要可省略 |
| Action2（右側） | ghost/text 按鈕，通常為「取消（Cancel）」 |
| Action1（右側） | primary filled 主要動作，通常為「確認（Confirm）」 |

### 本功能的「確認關閉 dialog」配置

適用場景：Question 視窗 / 監控視窗 / 公布答案階段，點擊 \[Cancel question\]、\[X\] 後出現的二次確認 dialog。

| 欄位 | 內容 |
| --- | --- |
| Banner | 不顯示 |
| Icon | 無 |
| Title | 待 UX/設計確認（參考舊版文案） |
| Description | 提示「關閉後題目將取消，無法復原」等說明文字 |
| Content replacement area | 不使用 |
| Action2 | `Cancel`（ghost，點擊關閉 dialog，保留原視窗） |
| Action1 | `Confirm`（primary，確認後關閉視窗並重置 toolbar 狀態） |

---

## Architecture Note

> **Standalone vs MVB UI 分離原則**
>
> - **Standalone 模式**（從 ClassSwift class management 等非 MVB 入口開啟）：使用**舊的** quiz edit windows（TrueFalseEditWindow、MultipleChoiceEditWindow、PollQuizEditWindow 等）
> - **MVB 模式**（從 MVB whiteboard 的 ClassSwift toggle 開啟）：使用**新的** `MvbQuestionWindow`，所有題型（是非、選擇、簡答、聲音、投票）統一進入同一個 Question window，再依題型顯示對應設定區

### 舊 UI Layout 檔案（Poll 投票題）

| 用途 | 檔案 |
| --- | --- |
| Edit Window（設定頁） | `window_poll_quiz_edit.xml` |
| Start Window（派送頁） | `window_poll_start_quiz.xml` |

---

## Background

目標：老師在 MVB 課堂上開啟 ClassSwift toggle，透過截圖派題功能或備課題庫，快速派發題目給學生，即時了解學生的知識掌握度。

---

## User Story

### Feature 1：截圖題 (Screenshot Quiz)

#### 階段一：準備與派送 (Preparation & Distribution)

老師可從 MVB 課堂畫面截圖，選擇題型（選擇、是非、聲音、簡答、投票、畫圖），設定條件並派送給學生。

* **US-1:** [VSFT-7261](https://viewsonic-vsi.atlassian.net/browse/VSFT-7261) Capture Screen & Configure Quiz Settings

    * **As a** 老師
    * **I want to** 從 MVB 畫面截取圖片，選擇題型並設定條件後派送給學生
    * **So that** 學生可以即時作答，了解學生的知識掌握度
    * **Acceptance Criteria:**

| **Given** | **When** | **Then** | **Figma** | **備註** |
| --- | --- | --- | --- | --- |
| (v)在 main toolbar 上 | 點擊 Question 按鈕 | Question 按鈕狀態變為 selected（藍色背景）<br>\- 展開題型 submenu，分三類顯示題型：<br>**Quick checks**：True or false、Multiple choice<br>**Creative expressions**：Audio、Short answer、Sketch response<br>**Opinion and engagement**：Poll | [@node-id=1814-86281](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=1814-86281&m=dev) | |
| (v)在 question 的 submenu 內 | 點擊任一題型 | submenu 關閉<br>\- 畫面出現全螢幕遮罩（overlay）<br>\- 隱藏 ClassSwift panel<br>\- 使用者可自由選取截圖範圍 | [@node-id=1816-88797](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=1816-88797&m=dev) | |
| (-) 在 question 的 submenu 內 | 點擊任一題型 | submenu 關閉 - 畫面出現全螢幕遮罩（overlay）<br>\- 隱藏 ClassSwift panel<br>\- 使用者可自由選取截圖範圍<br>下方顯示可以取消的按鈕 | [@node-id=3739-273976](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3739-273976&m=dev) | 目前有，但是ui是舊的需要換 |
| (-)截圖範圍確認後 | 截圖完成 | 開啟 Question 視窗<br>\- Header：「Question」標題 + icon、\[−\] 最小化、\[X\] 關閉<br>\- Preview 區顯示截圖內容，疊加上傳 loading 狀態<br>\- Preview 右下角顯示 \[Capture again\]<br>\- Footer：\[Cancel question\]（outlined）、\[Start question\]（disabled，灰色） | [@node-id=3426-16323](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3426-163231&m=dev) | 上傳完成前，\[Start question\] 為 disabled |
| (-)在 Question 視窗內，圖片上傳中 | 圖片上傳失敗 | 顯示失敗提示<br>\- 出現 \[Retry\] 供重新上傳<br>\- \[Start question\] 維持 disabled | [@node-id=3426-163590](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3426-163590&m=dev) | |
| (-)在 Question 視窗內，圖片上傳完成 | 上傳成功 | loading 消失，Preview 正常顯示截圖 - \[Capture again\] 維持顯示於右下角 - \[Start question\] 變為 enabled（primary 藍色） | [@node-id=3426-162928](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3426-162928&m=dev) | |
| (-)在 Question 視窗內 | 點擊 \[Capture again\] | 回到截圖流程<br>\- 新截圖結果替換原本內容 | | 對應到舊的ui的\[重新選取\] button |
| (-)在 Question 視窗內 | 點擊 \[Cancel question\] 或 \[X\] | 顯示確認關閉 dialog<br>\- 確認後關閉視窗<br>\- main toolbar Question 按鈕狀態回到 unselected | [@node-id=3426-162928](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3426-162928&m=dev) | 對應到舊的ui的右上角關閉\[x\]按鈕 |
| (-)在 Question 視窗內 | 點擊 \[-\] 最小化按鈕 | 畫面縮小 | [@node-id=3426-162928](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3426-162928&m=dev) | 對應到舊的ui的右上角最小化\[-\]按鈕 |
| (-)在 Question 視窗內，\[Start question\] 為 enabled | 點擊 \[Start question\] | 派送成功：題目發送至學生端，老師端進入作答監控視窗<br>\- 派送失敗：顯示 error toast | [@node-id=3426-162922](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3426-162922&m=dev) | |

* **US-2:** [VSFT-7262](https://viewsonic-vsi.atlassian.net/browse/VSFT-7262) Set Answer Options & Question Type

    * **As a** 老師
    * **I want to** 在截圖上傳完成後，設定選擇題的答案選項與答題類型
    * **So that** 學生可以依照設定完成選擇題作答
    * **Acceptance Criteria:**

| **Given** | **When** | **Then** | **figma link** | **備註** |
| --- | --- | --- | --- | --- |
| (-)老師已完成截圖，且選擇的題型為「Multiple choice（選擇題）」 | 截圖上傳成功，Question 視窗顯示選擇題設定區 | 顯示截圖預覽與 \[Capture again\] 按鈕<br>\- 顯示 4 個預設答案選項卡片（編號 1–4）<br>\- 每張卡片右上角有刪除圖示按鈕<br>\- 顯示 \[+\] 新增選項按鈕<br>\- 顯示「Answer types」與「Answer options」下拉選單<br>\- 底部顯示 \[Cancel question\] 與 \[Start question\]（enabled） | [@node-id=3215-35929](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3215-35929&m=dev) | 僅選擇題才出現此設定區 |
| (-)老師已完成截圖，且選擇的題型為「Poll（投票題）」 | 截圖上傳成功，Question 視窗顯示投票題設定區 | 顯示截圖預覽與 \[Capture again\] 按鈕<br>\- 顯示 4 個預設答案選項卡片（編號 1–4）<br>\- 每張卡片右上角有刪除圖示按鈕<br>\- 顯示 \[+\] 新增選項按鈕<br>\- 顯示「Answer types」與「Answer options」下拉選單<br>\- 底部顯示 \[Cancel question\] 與 \[Start question\]（enabled） | | 投票題設定區與選擇題相同 |
| 在 Question 視窗選擇題設定區 | 點擊 \[+\] 新增選項按鈕 | 新增一張空白答案選項卡片<br>\- 卡片依序編號遞增 最多 6 張 | [@node-id=3215-35929](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3215-35929&m=dev) | |
| 在 Question 視窗選擇題設定區，已有多張答案選項卡片 | 點擊某張卡片右上角的刪除按鈕 | 該選項卡片移除<br>\- 剩餘卡片重新排序編號 最少 2 張 | [@node-id=3215-35929](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3215-35929&m=dev) | |
| (-)在 Question 視窗選擇題設定區 | 點擊「Answer types」下拉選單 | 展開答題類型選項供老師選擇 123/abc | [@node-id=3666-39719](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3666-39719&m=dev) | |
| 在 Question 視窗選擇題設定區 | 點擊「Answer options」下拉選單 | 展開選項，包含「Single-select」與「Multi-select」供老師選擇 | [@node-id=3666-39719](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3666-39719&m=dev) | |
| 在 Question 視窗投票題設定區 | 點擊「Answer options」下拉選單 | 展開選項，包含「Single vote」與「Multiple votes」供老師選擇（投票題專屬，非 Single-select / Multi-select） | [@node-id=3271-35185](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3271-35185&m=dev)<br>[@node-id=3271-108963](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3271-108963&m=dev) | |
| 老師已設定好選項內容與答題類型 | 點擊 \[Start question\] | 題目連同答案選項與答題類型派送給學生<br>\- 老師端進入作答監控視窗 | | |

---

#### 階段二：監控與檢視 (Monitoring & Review)

* **US-2-1:** [VSFT-7263](https://viewsonic-vsi.atlassian.net/browse/VSFT-7263) Teacher Console — Real-time Answer Progress

    * **As a** 老師
    * **I want to** 在老師端控制台看到全班學生的作答狀況
    * **So that** 我能快速掌握學生答題進度，並給予即時指導
    * **Acceptance Criteria:**

| **Given** | **When** | **Then** | **Figma** | **備註** |
| --- | --- | --- | --- | --- |
| (-)題目已派送，進入 Quizzing 階段 | 老師端顯示監控視窗 | Header 顯示「Question」+ \[-\] 最小化 + \[X\] 關閉<br>\- 計時 00:00 開始<br>\- 左側顯示題型名稱（如 Multiple choice）<br>\- 顯示截圖預覽<br>\- 顯示 Options 區：每個題目選項<br>\- 底部顯示 \[End and review question\] | [@node-id=3215-33808](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3215-33808&m=dev) | |
| (-)在監控視窗 | 學生作答中 | 每位學生以卡片呈現：<br>\- 已作答：狀態藍色<br>\- 未作答：狀態藍色<br>\- 缺席：灰底 + Absent 學生作答人數計算: {已回答}/{全班人數} | [@node-id=3215-33808](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3215-33808&m=dev) | |
| (-)在監控視窗 | 點擊已作答學生卡片 | 顯示學生作答結果 再次點擊顯示已作答狀態 | [@node-id=3215-33815](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3215-33815&m=dev) | |
| (-)在控視窗 | 點擊 \[Refresh\] | 重新同步學生作答狀態 | [@node-id=3215-33815](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3215-33815&m=dev) | |
| (-)在監控視窗 Quizzing 階段 | 點擊 \[End and review question\] | 選擇題、是非題：進入 show answer 階段（US-3-1） | | 新版本沒有加分的邏輯 |
| (p)在監控視窗 Quizzing 階段 | 點擊 \[End and review question\] | 投票、聲音、簡答等其他題型：直接進入 Result (view student's response) 階段（US-3-2） | | ~~新版本沒有加分的邏輯 (這階段只處理選擇是非）~~ |
| (-)在監控視窗 | 點擊 \[X\] 關閉 | 彈出確認關閉 dialog<br>\- 確認後關閉視窗，main toolbar Question 按鈕回到 unselected | [@node-id=3581-120650](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3581-120650&m=dev) | |
| 在監控視窗 | 點擊 \[-\] 最小化 | 縮小, mvb要有藍點 | [@node-id=3581-120650](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3581-120650&m=dev) | |

* **US-2-2:**

    * **As a** 學生
    * **I want to** 在介面中作答老師派送的題目
    * **So that** 我能即時回應老師的測驗
    * **Acceptance Criteria:**

| **Given** | **When** | **Then** | **備註** |
| --- | --- | --- | --- |
| 學生加入教室後 | 當學生收到老師發送的題目 | 畫面顯示題目（原 ClassSwift 流程） | |
| 在題目畫面 | 學生進行作答並提交 | 提交後不可再編輯（原 ClassSwift 流程） | |

---

#### 階段三：公布答案與結果檢視 (Disclose & Result Review)

* **US-3-1:** [VSFT-7264](https://viewsonic-vsi.atlassian.net/browse/VSFT-7264) Reveal Correct Answer

    * **As a** 老師
    * **I want to** 公布正確答案
    * **So that** 學生可以知道正確答案，了解自身學習狀況
    * **Acceptance Criteria:**

| **Given** | **When** | **Then** | **Figma** | **備註** |
| --- | --- | --- | --- | --- |
| (-)進入 show answer階段（是非題） | 老師端視窗切換至公布答案 | 左側顯示「Select the correct answer」區域<br>每個答案選項（T/F）右上角出現圓形radio button<br>所有 radio button 預設為 unchecked<br>底部 \[Show question(s) result\]為 disabled（灰色） | [@node-id=3215-33822](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3215-33822&m=dev) | |
| (-)進入 show answer階段（單選題） | 老師端視窗切換至公布答案 | 左側顯示「Select the correct answer」區域<br>每個答案選項（ex:A,B,C,D）右上角出現圓形radio button<br>所有 radio button 預設為 unchecked<br>底部 \[Show question(s) result\]為 disabled（灰色） | [@node-id=3215-35950](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3215-35950&m=dev) | |
| (-)進入 show answer階段（多選題） | 老師端視窗切換至公布答案 | 左側顯示「Select the correct answer」區域<br>每個答案選項（ex:A/B/C/D）右上角出現 checkbox<br>所有 checkbox 預設為 unchecked<br>底部 \[Show question(s) result\]為 disabled（灰色） | [@node-id=3215-20351](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3215-20351&m=dev) | |
| (-)在公布答案階段 (是非題） | 點擊某選項的 radio | 該選項 radio 變為 checked（藍色填滿）<br>底部按鈕 \[Show question(s) result\]從（disabled）切換為（enable） | [@node-id=3215-33829](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3215-33829&m=dev) | |
| (-)在公布答案階段 (單選題） | 點擊某選項的 radio | 該選項 radio 變為 checked（藍色填滿）<br>底部按鈕 \[Show question(s) result\]從（disabled）切換為（enable） | [@node-id=3215-35957](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3215-35957&m=dev) | |
| (-)在公布答案階段 (多選題） | 點擊某選項的checkbox | 該選項 checkbox 變為 checked（藍色填滿）<br>可複選多個選項<br>底部按鈕 \[Show question(s) result\]從（disabled）切換為（enable） | [@node-id=3215-20928](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3215-20928&m=dev) | |
| (-)在公布答案階段，已選擇正確答案 | 點擊 \[Show question(s) result\] | 正確答案公布給學生<br>\- 進入 Result 階段（US-3-2） | | |
| (-)在公布答案階段 | 點擊 \[X\] 關閉 | 彈出確認關閉 dialog<br>\- 確認後關閉視窗，main toolbar Question 按鈕回到 unselected | [@node-id=3581-120649](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3581-120649&m=dev) | |

* **US-3-2:** [VSFT-7265](https://viewsonic-vsi.atlassian.net/browse/VSFT-7265) Result Page — Class-wide Statistics

    * **As a** 老師
    * **I want to** 在結果頁面檢視全班學生答題統計
    * **So that** 我能了解全班的學習狀況
    * **Acceptance Criteria:**

| **Given** | **When** | **Then** | **Figma** | **備註** |
| --- | --- | --- | --- | --- |
| 進入 Result 階段 (是非題＋單選） | 老師端顯示結果視窗 | 左側顯示 Options 區：<br>\- 有正確答案題型：選項以長條圖呈現作答分佈，正確答案標示「Correct answer」chip（綠色），錯誤選項以紅色長條顯示<br>\- 提示文字「Click an option to highlight students」<br>\- 右側 Responses 區提供「Student responses」/「Overview」兩個 tab<br>\- 預設 OverView tab | 是非題 [@node-id=6668-173835](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=6668-173835&m=dev)<br>單選題 [@node-id=3215-64370](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3215-64370&m=dev) | |
| 進入 Result 階段（選擇題，多選） | 老師端顯示結果視窗 | 左側顯示 Options 區：<br>\- 有正確答案題型：選項以長條圖呈現作答分佈，正確答案標示「Correct answer」chip（綠色），錯誤選項以紅色長條顯示<br>\- 右側 Responses 區提供「Student responses」/「Overview」兩個 tab<br>\- 預設 OverView tab | [@node-id=3215-64370](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3215-64370&m=dev) | |
| (p)進入 Result 階段（文字題 and rest） | 老師端顯示結果視窗 | 左側顯示 Options 區：<br>\- 有正確答案題型：選項以長條圖呈現作答分佈，正確答案標示「Correct answer」chip（綠色），錯誤選項以紅色長條顯示<br>\- 無正確答案題型（如 Short answer）：顯示 Submitted / Not submitted 數量與長條圖<br>\- 提示文字「Click an option to highlight students」<br>\- 右側 Responses 區提供「Student responses」/「Overview」兩個 tab<br>\- 預設 OverView tab | [@node-id=3215-64370](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3215-64370&m=dev) | 這個sprint18先pending |
| (-)在 Result視窗，Overview tab(是非題） | 老師端顯示結果視窗 | 右側-overview -有正確答案題型<br>\- 顯示統計：Answered correctly/ Answered incorrectly / not submitted<br>\- 顯示圓餅圖（綠=答對、紅=答錯、灰=未提交） | 是非題 [@node-id=6668-173835](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=6668-173835&m=dev) | |
| (-)在 Result視窗，Overview tab(單選題） | 老師端顯示結果視窗 | 右側-overview -有正確答案題型<br>\- 顯示統計：Answered correctly/ Answered incorrectly / not submitted<br>\- 顯示圓餅圖（綠=答對、紅=答錯、灰=未提交） | 單選題 [@node-id=3215-64370](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3215-64370&m=dev) | |
| (-)在 Result視窗，Overview tab(多選題） | | 右側-overview -有正確答案題型<br>\- 顯示統計：Answered correctly/ Answered incorrectly / not submitted<br>\- 顯示圓餅圖（綠=答對、紅=答錯、灰=未提交） | 多選題 [@node-id=3215-22094](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3215-22094&m=dev) | |
| (p)在 Result視窗，Overview tab(文字題，語音等其他） | | 右側-overview -無正確答案題型<br>\- 顯示統計：submitted / not submitted<br>\- 顯示圓餅圖（綠=提交、灰=未提交） | [@node-id=3271-37303](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3271-37303&m=dev) | sprint 18先pending |
| (-)在 Result 視窗，切換至Student responses tab (是非題） | 老師檢視個別學生作答 | 學生卡片顯示名字 header 狀態有四種：<br>答對：綠色 顯示學生選的答案ex:"T"<br>答錯：紅色，顯示學生選的答案ex:"F"<br>未作答：灰色，顯示"Not submitted"<br>缺席：灰色，顯示"Absent" | [@node-id=3215-58874](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3215-58874&m=dev) | |
| (-)在 Result 視窗，切換至Student responses tab (單選題） | 老師檢視個別學生作答 | 學生卡片顯示名字 header 狀態有四種：<br>答對：綠色，顯示學生選的答案ex:A (有外圈的）<br>答錯：紅色，顯示學生選的答案ex:A (有外圈的）<br>未作答：灰色，顯示"Not submitted"<br>缺席：灰色，顯示"Absent" | [@node-id=6668-179481](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=6668-179481&m=dev) | |
| 在 Result 視窗，切換至Student responses tab (多選題） | 老師檢視個別學生作答 | 學生卡片顯示名字 header 狀態有四種：<br>答對：綠色，顯示學生選的答案ex:A,B,C (有外圈的）<br>答錯：紅色，顯示學生選的答案ex:B,C(有外圈的）<br>未作答：灰色，顯示"Not submitted"<br>缺席：灰色，顯示"Absent" | [@node-id=3215-60961](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3215-60961&m=dev) | |
| (p)在 Result 視窗，切換至Student responses tab (其他） | 老師檢視個別學生作答 | 簡答題/聲音題 顯示「Show students' name」toggle<br>\- Toggle ON：學生卡片顯示名字 header（選擇題：綠色=答對、紅色=答錯；簡答：綠色=有作答）+ 作答內容<br>\- Toggle OFF：學生卡片隱藏名字，僅顯示作答內容<br>\- 未作答：灰色 "Not submitted"<br>\- 缺席：灰色 "Absent" | [@node-id=3844-62352](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3844-62352&m=dev) | sprint 18先pending |
| (-)在 Result 視窗，Student responses tab | 老師點擊左側 Options 某個長條 | 右側學生名單 highlight 顯示選擇該選項的學生 | [@node-id=3448-188569](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3448-188569&m=dev) | @Hsuan Lee 取消的狀態定義 |
| (p)在 Student responses tab，題型為簡答題 | 點擊學生回答卡片 | 畫面中央彈出答案 Popup<br>Popup 顯示該學生的完整作答內容（文字）<br>底部顯示「Show students name」toggle（狀態與上一層同步）<br>底部顯示學生姓名（如 Ruby）及左右導航箭頭「<」「>」<br>點擊「<」「>」：切換至上/下一位學生答案，只有有答案的學生會被切換到<br>第一位/最後一位學生，「<」「>」不可點擊<br>點擊「X」 Popup 關閉，回到 Result 階段主畫面，Student responses 列表保持不變 | [@node-id=3844-62364](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3844-62364&m=dev) | sprint 18先pending<br>show student name只有在簡答題跟聲音題嗎 |
| (-)在 Result 視窗 | 點擊 \[X\] 關閉 | 關閉視窗，myviewboard main toolbar Question 按鈕回到 unselected | | 行為跟目前的\[TrueFalseQuizResultsOverview\]一樣 |

* **US-3-3:** [VSFT-7272](https://viewsonic-vsi.atlassian.net/browse/VSFT-7272) Result Page — WCAG Accessibility — Color-Independent Status Indication

    * **As a** PM
    * **I want to** 滿足WCAG的條款
    * **So that** 在設計上，需要有無法辨別顏色但可以辨識狀態的設計。
    * **Acceptance Criteria:**

| **Given** | **When** | **Then** | **備註** |
| --- | --- | --- | --- |
| 在結果頁中 | 顯示長條圖的結果 | 針對答對/答錯/有提交/未提交 UI 顯示符合 WCAG 的設計 | |
| 在結果頁中 | 顯示圓餅圖的結果 | 針對答對/答錯/有提交/未提交 UI 顯示符合 WCAG 的設計 | |

---

### Feature 1-Poll：截圖題 — 投票題（Poll）

| **Ticket** | **說明** |
| --- | --- |
| [VSFT-7597](https://viewsonic-vsi.atlassian.net/browse/VSFT-7597) | Capture Screen & Configure Quiz Settings |
| [VSFT-7598](https://viewsonic-vsi.atlassian.net/browse/VSFT-7598) | Set Answer Options & Question Type After Screenshot Upload |
| [VSFT-7599](https://viewsonic-vsi.atlassian.net/browse/VSFT-7599) | Teacher Console — Real-time Class Answer Progress View |
| [VSFT-7600](https://viewsonic-vsi.atlassian.net/browse/VSFT-7600) | Reveal Correct Answer to Students |
| [VSFT-7601](https://viewsonic-vsi.atlassian.net/browse/VSFT-7601) | Result Page — Class-wide Answer Statistics |

---

### Feature 2：備課題庫 (Quiz Collection)

#### 階段一：瀏覽題庫 (Browse Quiz Collection)

老師可使用備課的素材，快速派發給學生，即時了解學生的掌握度。

* **US-1:** [VSFT-7266](https://viewsonic-vsi.atlassian.net/browse/VSFT-7266) Browse Lesson Preparation Questions

    * **As a** 老師
    * **I want to** 開啟 Quiz Collection 並瀏覽備課題目
    * **So that** 我可以快速找到備課素材並派發給學生
    * **Acceptance Criteria:**

| **Given** | **When** | **Then** | **Figma** | **note** |
| --- | --- | --- | --- | --- |
| 在 main toolbar | 點選 Quiz Collection (QC) | 打開 QC panel 並 loading 結果，main toolbar QC 狀態為 selected<br>如果 API 取得資料夾或題目結果失敗，點擊 refresh 重打<br>預設顯示 default 資料夾 | [@node-id=2093-110799](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=2093-110799&m=dev)<br>[@node-id=2093-115440](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=2093-115440&m=dev) | |
| 在 Quiz Collection 視窗內 | 點擊 \[X\] | 視窗關閉，所有狀態清除<br>main toolbar QC 狀態為 unselected | | |
| 在 Quiz Collection 視窗內 | 縮小 \[-\] | 縮小視窗 mvb icon要有一個點（縮小的樣式） | | |
| 在 Quiz Collection 視窗內 | 老師想檢視課前準備的題目 | 所有題目皆儲存在資料夾內<br>\- default：預設資料夾<br>\- 其他資料夾：由老師在 hub 新增 | [@node-id=2035-27467](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=2035-27467&m=dev) | |
| 在 Quiz Collection 視窗內 | 如果 API 取得資料夾或題目結果失敗 | 顯示失敗畫面<br>\- 可點擊 refresh 重試 | [@node-id=2093-115440](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=2093-115440&m=dev) | |
| 在 Quiz Collection 視窗內 | 任一資料夾（包含 default）沒有任何題目 | 顯示空狀態 | [@node-id=2084-24127](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=2084-24127&m=dev) | |
| 在 Quiz Collection 視窗內 | 任一資料夾（包含 default）有題目 | 最多顯示 24 筆 - 超過 24 筆則 loading 後接續顯示<br>題目屬性：題型、科目、standard 數量 | [@node-id=2261-33365](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=2261-33365&m=dev) | |
| ~~在 Quiz Collection 視窗內~~ | ~~能看到 standards 的使用者~~ | ~~顯示 search 功能~~<br>~~search 的範圍包含題幹/tagging code/tagging description~~ | ~~[@node-id=2060-50478](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=2060-50478&m=dev)~~ | (pending) |
| 在Quiz Collection 視窗內 | 不論Quiz Collection內的Quiz有無設定答案 | 能顯示所有Quiz，不論有無答案 | | 這是為了對齊Windows的行為 後端給的題目 Filter 在後端，將條件拿掉 |

---

#### 階段二：篩選題目 (Filter Questions)

* **US-2:** [VSFT-7267](https://viewsonic-vsi.atlassian.net/browse/VSFT-7267) Filter Questions for Quick Discovery

    * **As a** 老師
    * **I want to** 使用篩選功能快速找到想要的題目
    * **So that** 我可以快速派送合適的題目給學生
    * **Acceptance Criteria:**

| **Given** | **When** | **Then** | **Figma** | **note** | **QA test result** |
| --- | --- | --- | --- | --- | --- |
| 若組織為美國或馬來西亞，在 Quiz Collection 的篩選中 | 顯示 standards 和 question type | 點擊 Standards：展開 filter 內容<br>Standards = 國家 / 洲 美國各州 馬來西亞 MY<br>Subjects = 科目 依照 Standards 所選條件顯示<br>Grades = 年級 依照 Subjects 所選條件顯示<br>點擊 Question type（選擇、是非、聲音、投票、簡答）<br>若不選擇預設都是 All<br>選擇後打 API 撈取對應資料，最多顯示 24 筆<br>點擊 Quiz Collection 空白處取消選取 filter | [@node-id=2035-37154](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=2035-37154&m=dev)<br>[@node-id=2084-22998](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=2084-22998&m=dev) | | |
| 若組織非美國或馬來西亞，在 Quiz Collection 的篩選中 | 顯示 question type 和 Time | 點擊Question type（選擇、是非、聲音、投票、簡答）<br>點擊 Time（7天、30天、6個月） | | | |
| 在 Quiz Collection 視窗內 | 當使用者點擊清除篩選功能 | 回到預設狀態（全選，all） | [@node-id=2035-37153](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=2035-37153&m=dev)<br>[@node-id=2261-35622](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=2261-35622&m=dev) | | |

#### 階段三：題目細節確認與發送 (Question Detail & Launch)

* **US-3:** [VSFT-7268](https://viewsonic-vsi.atlassian.net/browse/VSFT-7268) Preview Details & One-tap Dispatch
* As a 老師
* I want to 查看 Quiz Collection 中選定題目的詳細內容並一鍵派送
* So that 我可以確認題目內容適合後，快速派發給學生進行作答

| **Given** | **When** | **Then** | **Figma** | **備註** |
| --- | --- | --- | --- | --- |
| 老師已在 Quiz Collection 題庫列表，點擊某題目 | 進入題目詳情頁 | 顯示「← Back」返回按鈕<br>顯示題型 chip（如 True or false）<br>左側顯示題目完整預覽圖<br>右側顯示 Options 區域，含對應答案選項卡片（如 T / F 或 O / X）<br>無正確答案題目不顯示<br>右下角顯示 \[Start question(s)\] 按鈕（primary blue, enabled） | [@node-id=3333-40322](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3333-40322&m=dev)<br>[@node-id=3754-184744](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3754-184744&m=dev) | |
| 老師在題目詳情頁，目前無進行中的題目 | 點擊 \[Start question(s)\] | 題目成功派送，進入 Quizzing 監控階段<br>Quiz Collection panel 關閉<br>Question console 顯示並開始計時 | | |
| 老師在題目詳情頁，點擊 \[Start question(s)\] 後系統發生錯誤 | 派送失敗 | 顯示錯誤提示：「Failed to start question(s). Please try again.」<br>\[Start question(s)\] 按鈕保持可點擊 | [@node-id=3588-162184](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3588-162184&m=dev) | |
| 老師在題目詳情頁 | 點擊 \[Start question(s)\]成功 | toolbar 的 Quiz Collection 變成 unselected，Question 變成 selected | | |
| 老師在題目詳情頁，背景已有另一題目正在進行中 | 點擊 \[Start question(s)\] | 顯示錯誤提示：「Another question is currently ongoing. Please end the question before starting a new one.」<br>\[Start question(s)\] 按鈕保持可見 | [@node-id=3588-159089](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3588-159089&m=dev) | 需先結束當前題目才可發送新題目 conflict 部分先跳toast. |
| 老師在題目詳情頁 | 點擊「← Back」 | 返回 Quiz Collection 題庫列表頁面<br>列表狀態（篩選條件、捲動位置）維持不變 | | |

#### 階段四：文字題目派送

* As a 老師
* I want to 透過 Quiz Collection 派送文字題的題目
* So that 我可以用更多元的方式檢測學生程度

| **Given** | **When** | **Then** | **Figma** | **備註** |
| --- | --- | --- | --- | --- |
| 在 Quiz Collection 視窗內 | 點擊 start qusetion(s) 派送題目成功 | 流程同 Question US 2-1，但題目從截圖變更為文字 | [node-id=3320-75841](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3320-75841&m=dev) | |
| 文字題若有正確答案 (是非/選擇) | 從 US 2-1 接到 US 3-1，顯示 suggested 的按鈕，點擊後 | 正確答案被選取<br>如果有詳解，顯示選項的詳解內容 | [node-id=3320-75873](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3320-75873&m=dev) | |
| 文字題若有正確答案 (是非/選擇) | 揭露正確答案後，接到 US 3-2 流程 | 顯示題目結果 | [node-id=3320-75865](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3320-75865&m=dev) | |
| 文字題若沒有正確答案 (簡答) | 從 US 2-1 接到 US 3-2 | 顯示題目結果 | [node-id=3778-79560](https://www.figma.com/design/4C21d9puOZJcUyUR26oibd/-VSDS--UI-Design---ClassSwift-Toggle?node-id=3778-79560&m=dev) | |
