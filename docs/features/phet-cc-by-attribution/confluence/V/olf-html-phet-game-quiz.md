<!--
==============================================================
SOURCE TRACKING — 更新 Confluence 後請同步更新此區塊與內文
==============================================================

page_id:        468615756
url:            https://viewsonic-vsi.atlassian.net/wiki/spaces/V/pages/468615756
space:          V
cloned_version: 7
cloned_at:      2026-07-28

Maintenance rule: 每次重新 clone 時，先 commit「同步前差異」說明，再覆寫此檔；
                  版號跟 cloned_at 要同步更新，commit 訊息附 Confluence URL。
==============================================================
-->

> | 來源頁面 | page_id | clone 版本 | clone 日期 |
> |---|---|---|---|
> | [OLF + HTML (PhET, Game, Quiz)](https://viewsonic-vsi.atlassian.net/wiki/spaces/V/pages/468615756) | 468615756 | v7 | 2026-07-28 |

# OLF + HTML (PhET, Game, Quiz)

4/1 - 針對需要開發的團隊有做初步討論，Quiz 也改成用 html 來呈現，接著需要大家根據需求，實作目標一起定下最終資料欄位，放在這個 Sub Folder 內 OLF format and details

* Quiz 資料希望可以跟目前 Classswift Quiz 能夠一致 @gary tan
* 最終 OLF 資料結構需要確認跟 PM 的需求後，定義最後版本 @Henry @Aaron Chang @Kenneth Chen @Steve Chen

補充當天會議的討論檔案內容（供參考）:

5cfd11ab-5ec6-4258-b88a-48087704cb77/c6f04b52-426d-41f2-8b84-0dbd9143b977/static/markdowncom.atlassian.ecosystem0e65e300-700d-49d4-852a-12c327c065c0ari:cloud:ecosystem::extension/5cfd11ab-5ec6-4258-b88a-48087704cb77/c6f04b52-426d-41f2-8b84-0dbd9143b977/static/markdownMarkdownextensionPRODUCTIONmacro468615756pageV82969672ari:cloud:confluence:2ea8088c-133a-424f-9a3b-946e7ade9dad:workspace/5047f522-e68d-4d5e-8f61-2bb2887b80ff712020:c6bc3e91-a86f-4d8b-b073-37e644ab9dff2ea8088c-133a-424f-9a3b-946e7ade9dadUTF-8truefalse# OLF HTML Activity 規格（整合版）
> \*\*狀態\*\*：Integrated Draft v1.0
> \*\*日期\*\*：2026-04-01
> \*\*目的\*\*：擴展 OLF 格式，支援嵌入完整 HTML 應用（模擬器、遊戲、Quiz 測驗），透過 `window.gameConfig/window.config` 注入參數、`window.\_\_olf` 雙向通訊
> \*\*涵蓋範圍\*\*：html-activity 通用機制 + Quiz 測驗專用擴展
> \*\*整合來源\*\*：OLF\_HTML\_ACTIVITY\_SPEC\_DRAFT.md (v0.3) + OLF\_QUIZ\_ACTIVITY\_SPEC\_DRAFT.md (v0.2)
---
## 目錄
1. [背景與動機](#1-背景與動機)
2. [設計原則](#2-設計原則)
3. [ZIP 結構擴展](#3-zip-結構擴展)
4. [Page 結構變更：新增 activities 陣列](#4-page-結構變更新增-activities-陣列)
5. [html-activity 元素定義](#5-html-activity-元素定義)
6. [manifest.json 活動描述檔](#6-manifestjson-活動描述檔)
7. [Config 注入機制](#7-config-注入機制)
8. [雙向通訊協議](#8-雙向通訊協議)
9. [安全需求（Normative）](#9-安全需求normative)
10. [效能需求與策略](#10-效能需求與策略)
11. [Quiz 測驗擴展](#11-quiz-測驗擴展)
12. [跨平台實作指引](#12-跨平台實作指引)
13. [向後相容性](#13-向後相容性)
14. [完整範例](#14-完整範例)
15. [驗證計畫](#15-驗證計畫)
16. [需修改的檔案清單](#16-需修改的檔案清單)
> \*\*RFC 2119 用語\*\*：本文件中 MUST、MUST NOT、SHOULD、MAY 依照 [RFC 2119](https://tools.ietf.org/html/rfc2119) 定義使用。
---
## 1. 背景與動機
### 1.1 現況
OLF 目前支援靜態教學內容（文字、圖片、形狀）和簡單互動工具（骰子、閃卡、計時器），但缺乏：
- 嵌入完整 HTML 應用的能力（PhET 模擬器、自製遊戲）
- 互動式測驗元件（Quiz：單選、多選、是非、簡答）
現有的 `widget-player` 已標記為 \*\*deprecated\*\*，`content-polling.json` 偏向即時投票場景。
### 1.2 需求
| 需求 | 說明 |
|---|---|
| 嵌入靜態 HTML 模擬器 | PhET Colorado 等完整自包含的 standalone HTML5 模擬器 |
| 嵌入自製 HTML 遊戲 | 透過 `window.gameConfig` 帶入參數，動態配置遊戲行為 |
| 互動式 Quiz 測驗 | 單選、多選、是非、簡答，混合題型，逐題公布答案 |
| 跨平台渲染 | Windows（WebView2）、Flutter（InAppWebView）、Web（iframe） |
| 雙向通訊 | 宿主端注入 config，活動端回傳事件 |
---
## 2. 設計原則
1. \*\*專用元素類型\*\*：新增 `html-activity`，不擴展已 deprecated 的 `widget-player`
2. \*\*獨立陣列\*\*：在 page 下新增 `activities[]`，與 `elements[]`、`tools[]` 同層
3. \*\*Standalone 單一 HTML\*\*：每個活動的 `index.html` MUST 為自包含檔案（所有 JS/CSS/資源已 inline），活動目錄內只有 `index.html` + `manifest.json` 兩個檔案
4. \*\*離線優先\*\*：HTML bundle 完整嵌入 OLF ZIP，所有活動皆為本地載入
5. \*\*Config 雙軌\*\*：`window.gameConfig` 靜態注入 + `MessageChannel` 動態更新
6. \*\*通訊管道不綁定事件\*\*：僅定義 MessageChannel 基本格式，具體事件由各活動自行定義
7. \*\*漸進降級\*\*：`poster` 預覽圖確保不支援 HTML 渲染的平台也能顯示內容
8. \*\*預設安全\*\*：所有活動預設最嚴格沙箱，禁止危險組合，強制 CSP
9. \*\*預設延遲載入\*\*：活動預設 `on-demand`，使用者點擊 poster 後才啟動 WebView
10. \*\*Category 分類\*\*：透過 `category` 區分活動類型（`Activity\_HTML\_PHET`、`Activity\_HTML\_GAME`、`Activity\_HTML\_QUIZ`）
---
## 3. ZIP 結構擴展
### 3.1 擴展後結構
```
project.olf (ZIP)
├── content.json
├── content-polling.json (optional)
├── images/ ← OLF 共用圖片
├── videos/
├── thumbnails/
├── additional/
├── html-activities/ ← HTML 活動（新增）
│ ├── {activity-uuid-1}/
│ │ ├── index.html ← Standalone 單一 HTML（所有 JS/CSS/資源已 inline）
│ │ └── manifest.json ← 活動描述
│ └── {activity-uuid-2}/
│ ├── index.html
│ └── manifest.json
└── quiz-assets/ ← Quiz 專用素材（新增）
└── {quiz-uuid}/
├── question-image.png
├── option-image.jpg
└── quiz-preview.png
```
### 3.2 資料夾說明
| 資料夾 | 用途 | 命名規則 |
|---|---|---|
| `html-activities/` | HTML 活動（每個活動只有 `index.html` + `manifest.json`） | 子目錄名 = 活動 UUID |
| `quiz-assets/` | Quiz 題目圖片等素材 | 子目錄名 = Quiz 活動 UUID |
### 3.3 為何 Quiz 素材獨立資料夾
| 理由 | 說明 |
|---|---|
| 隔離性 | Quiz 素材不與 `images/` 的頁面背景混雜 |
| 生命週期一致 | 刪除 Quiz 時整個子目錄移除 |
| 可索引 | Renderer 可按 UUID 快速定位 |
| 匯入友善 | 外部 JSON 匯入時圖片直接放入對應子目錄 |
### 3.4 ZIP 安全需求
- 實作端 MUST 驗證所有 ZIP entry 路徑在 canonicalize 後仍位於解壓根目錄內（防 Zip Slip，CVE-2018-1002200）
- 任何路徑含 `..` 的 entry，MUST 拒絕並視整個 OLF 為惡意檔案
- 子目錄名 MUST 符合 UUID 格式
- 單一活動解壓上限 200MB，全部活動總和上限 500MB
---
## 4. Page 結構變更：新增 activities 陣列
```json
{
"page": {
"id": "page-uuid",
"matrix": "1,0,0,0,1,0,0,0,1",
"elements": [ ],
"tools": [ ],
"activities": [
{ "html-activity": { "category": "Activity\_HTML\_GAME", ... } },
{ "html-activity": { "category": "Activity\_HTML\_QUIZ", ... } }
],
"groups": [ ],
"backgrounds": [ ]
}
}
```
`activities[]` 與 `elements[]`、`tools[]` 同層。所有活動類型（遊戲、模擬器、Quiz）都使用 `html-activity` wrapper key，以 `category` 區分。
---
## 5. html-activity 元素定義
### 5.1 JSON 結構
```json
{
"html-activity": {
"id": "a1b2c3d4-e5f6-4a90-8bcd-ef1234567890",
"x": 100.0,
"y": 100.0,
"width": 900.0,
"height": 600.0,
"matrix": "1,0,0,0,1,0,0,0,1",
"category": "Activity\_HTML\_GAME",
"source": "html-activities/a1b2c3d4-e5f6-4a90-8bcd-ef1234567890/index.html",
"config": { },
"poster": "images/game-preview.png",
"locale": "zh-TW",
"load-behavior": "on-demand",
"sandbox": "allow-scripts",
"allow": "",
"is-locked": true,
"min-width": 800,
"min-height": 500
}
}
```
### 5.2 屬性定義
| 屬性 | 類型 | 必填 | 說明 |
|---|---|---|---|
| \*\*id\*\* | `string` | Yes | UUID v4 格式。同時作為 `html-activities/` 和 `quiz-assets/` 子目錄名 |
| \*\*x\*\* | `number` | Yes | 頁面上的 X 座標 |
| \*\*y\*\* | `number` | Yes | 頁面上的 Y 座標 |
| \*\*width\*\* | `number` | Yes | 元素寬度 |
| \*\*height\*\* | `number` | Yes | 元素高度 |
| \*\*matrix\*\* | `string` | Yes | 標準 OLF 3x3 轉換矩陣 |
| \*\*category\*\* | `string` | Yes | 活動分類（見 §5.3） |
| \*\*source\*\* | `string` | Yes | HTML 進入點路徑（`html-activities/{id}/index.html`） |
| \*\*config\*\* | `object` | No | 注入 `window.gameConfig` 的 JSON 物件 |
| \*\*poster\*\* | `string` | No | 預覽圖路徑（如 `images/preview.png`） |
| \*\*locale\*\* | `string` | No | BCP 47 語言標籤，覆寫宿主端語系 |
| \*\*load-behavior\*\* | `string` | No | `"on-demand"`（預設）或 `"eager"` |
| \*\*sandbox\*\* | `string` | No | iframe sandbox 旗標。預設 `"allow-scripts"`。受白名單約束（§9.2） |
| \*\*allow\*\* | `string` | No | iframe Permissions Policy。受白名單約束（§9.3） |
| \*\*is-locked\*\* | `boolean` | No | 鎖定位置與大小。預設 `false` |
| \*\*min-width\*\* | `number` | No | 最小寬度 |
| \*\*min-height\*\* | `number` | No | 最小高度 |
### 5.3 Category 分類
| Category 值 | 用途 | 典型案例 |
|---|---|---|
| `Activity\_HTML\_PHET` | PhET 教學模擬器 | PhET Energy Skate Park、PhET Wave on a String |
| `Activity\_HTML\_GAME` | 自製 HTML 遊戲（帶 config） | Jeopardy、配對遊戲 |
| `Activity\_HTML\_QUIZ` | 互動式測驗（帶 quiz-item config） | 單選、多選、是非、簡答混合 |
### 5.4 離線行為
所有活動皆為本地載入（`source` 指向 ZIP 內路徑），完全離線可用。
| network-access | 離線行為 |
|---|---|
| `false`（預設） | \*\*完全離線可用\*\*，CSP 阻斷外部請求 |
| `true` | 核心 HTML 離線可用，網路附加功能降級 |
---
## 6. manifest.json 活動描述檔
每個 HTML 活動目錄 MUST 包含 `manifest.json`。
### 6.0 manifest.json 的用意
`manifest.json` 讓 Renderer \*\*不需要打開或執行 HTML 就能預先知道\*\*這個活動的能力和需求：
| 用途 | 說明 | 實際影響 |
|---|---|---|
| \*\*是否需要帶入參數\*\* | `receives-config: true` → Renderer 需注入 `window.gameConfig` | PhET 不需要 config，Jeopardy/Quiz 需要。Renderer 據此決定是否注入 |
| \*\*語言怎麼切換\*\* | `i18n.supports-dynamic-switch` → 是否可在執行中發送 `updateLocale` | `true`：發送指令即可。`false`：需銷毀 WebView 重建才能換語言 |
| \*\*支援哪些語言\*\* | `i18n.supported-locales` → 活動支援的語系列表 | Renderer 可在語言不支援時提前提示，而非載入後才發現 |
| \*\*會送什麼事件\*\* | `capabilities.event-types` → 活動會發送的事件列表 | Host 據此知道要監聽 `score`（遊戲）還是 `answerRevealed`（Quiz） |
| \*\*效能預估\*\* | `estimated-memory`、`max-bundle-size` | Renderer 可在低階裝置上決定是否載入大型活動 |
| \*\*config 資料格式\*\* | `config-schema` → JSON Schema 描述 `window.gameConfig` 結構 | 編輯器可據此產生 config 編輯 UI，匯入時可驗證格式 |
\*\*簡單來說\*\*：manifest.json 是活動的「自我介紹」，告訴 Renderer 和編輯器「我需要什麼、我會做什麼、我能處理什麼」。
### 6.1 通用結構
```json
{
"name": "Activity Name",
"name-i18n": { "zh-TW": "活動名稱" },
"version": "1.0.0",
"entry": "index.html",
"engine": "custom-game",
"description": "Activity description",
"description-i18n": { "zh-TW": "活動描述" },
"config-schema": { },
"capabilities": {
"receives-config": true,
"sends-events": true,
"event-types": ["score", "completion"]
},
"requirements": {
"min-width": 800,
"min-height": 500,
"allow-scripts": true,
"network-access": false,
"estimated-memory": "60MB",
"max-bundle-size": "5MB",
"file-count": 12
},
"i18n": {
"supported-locales": ["en", "zh-TW"],
"default-locale": "en",
"supports-dynamic-switch": true
}
}
```
### 6.2 欄位說明
| 欄位 | 必填 | 說明 |
|---|---|---|
| \*\*name\*\* | Yes | 人類可讀名稱 |
| \*\*version\*\* | Yes | Semver 版本號 |
| \*\*entry\*\* | Yes | HTML 進入點。MUST NOT 含 `..`，MUST 以 `.html`/`.htm` 結尾 |
| \*\*engine\*\* | No | 引擎提示（`phet-simulation`、`custom-game`、`olf-quiz`） |
| \*\*config-schema\*\* | No | JSON Schema，描述 `window.gameConfig` 結構 |
| \*\*capabilities\*\* | No | 活動能力宣告 |
| \*\*requirements\*\* | No | 效能和功能需求 |
| \*\*i18n\*\* | No | 語系支援（supported-locales、default-locale、supports-dynamic-switch） |
| \*\*name-i18n\*\* / \*\*description-i18n\*\* | No | 多語系名稱/描述 |
### 6.3 各 Category 的 manifest 差異
| 欄位 | GAME（Jeopardy） | PHET（PhET 模擬器） | QUIZ |
|---|---|---|---|
| `engine` | `"custom-game"` | `"phet-simulation"` | `"olf-quiz"` |
| `event-types` | `["score", "completion"]` | `[]`（無事件） | `["navigate", "answerRevealed", "editRequest", "deleteRequest"]` |
| `network-access` | 視遊戲而定 | `false` | `false` |
| `receives-config` | `true` | `false` | `true` |
| `supports-dynamic-switch` | `false` | `false` | `true` |
### 6.4 manifest.json vs content.json 分工
| 資訊 | manifest.json | content.json |
|---|---|---|
| 活動能力描述、config schema | Yes | - |
| 效能估計、i18n 支援 | Yes | - |
| 頁面位置和大小 | - | Yes |
| 實際 config 值 | - | Yes（`config` 欄位） |
| sandbox / allow / locale | - | Yes |
---
## 7. Config 注入機制
### 7.1 兩階段 Config
| 階段 | 機制 | 時機 |
|---|---|---|
| 初始注入 | `window.gameConfig = {}` | HTML 載入前 |
| 動態更新 | MessageChannel `updateConfig` | HTML 執行中 |
### 7.2 window.gameConfig 注入
Renderer MUST 在 HTML 的任何 `<script>` 執行前注入 `window.gameConfig`。
\*\*安全要求\*\*：所有注入值 MUST 經 `JSON.stringify()` 序列化，MUST NOT 使用字串拼接。
| 平台 | 保證方式 |
|---|---|
| Web | 改寫 HTML prepend 注入腳本（或 `srcdoc`） |
| Windows (WebView2) | `AddScriptToExecuteOnDocumentCreatedAsync` |
| Flutter (InAppWebView) | `UserScript` + `AT\_DOCUMENT\_START` |
### 7.3 window.\_\_olf 橋接物件
```javascript
window.\_\_olf = {
elementId: /\* string \*/,
version: "1.0",
locale: /\* BCP 47 tag \*/,
online: /\* boolean \*/,
sendMessage: function(type, data) { /\* via MessageChannel port \*/ },
onMessage: function(callback) { /\* via MessageChannel port \*/ },
\_port: null // 由 Renderer 透過 MessageChannel 注入
};
```
### 7.4 MessageChannel 建立流程
```
Host Activity (iframe/WebView)
│ 1. 建立 MessageChannel │
│ 2. 注入 window.gameConfig + window.\_\_olf
│ 3. postMessage 傳遞 port2（一次性 handshake）
│ ──────────────────────────────────► │
│ 4. Activity 綁定 port → \_\_olf.\_port │
│ 5. Activity 發送 ready │
│ ◄────────────────────────────────── │
│ 6. 通道建立完成，此後才可發送指令 │
```
### 7.5 olf-asset:// 資源引用協議
\*\*語法\*\*：`olf-asset://{zip-内路径}`
\*\*範例\*\*：
- `olf-asset://images/cat.png`（共用圖片）
- `olf-asset://quiz-assets/{quiz-id}/diagram.png`（Quiz 專用素材）
\*\*安全約束\*\*：MUST NOT 含 `..`，MUST NOT 以 `/` 開頭。
\*\*Renderer 處理\*\*：注入 `window.gameConfig` 前，MUST 遞迴掃描 config，將所有 `olf-asset://` 替換為平台可用 URL（blob URL / virtual host）。
### 7.6 Locale 機制
\*\*解析優先順序\*\*：`element.locale` > 宿主端語系 > `"en"`
\*\*動態切換\*\*：Host 透過 `updateLocale` 指令通知 Activity。不支援動態切換的活動 MAY 忽略。
### 7.7 已知語系問題
| 問題 | 說明 | 應對 |
|---|---|---|
| 文字烤進圖片 | 按鈕圖片含文字，無法透過 config 切換 | 替換圖片組或改用 CSS 按鈕 |
| JS 硬編碼文字 | 部分 UI 文字在打包後的 JS 中 | 評估影響範圍，改為 config 驅動 |
| PhET 每語系獨立檔案 | 每種語言一個 HTML | 選擇語系打包 |
| Locale 格式不一致 | BCP 47 `zh-TW` vs PhET `zh\_TW` | 活動端正規化 |
| 字型與排版 | CJK 缺字、RTL、文字溢位 | CSS fallback + 彈性佈局 |
---
## 8. 雙向通訊協議
### 8.1 Activity → Host 訊息格式
```json
{
"source": "olf-activity",
"elementId": "uuid",
"type": "事件名",
"data": { }
}
```
### 8.2 Host → Activity 訊息格式
```json
{
"source": "olf-host",
"command": "指令名",
"data": { }
}
```
### 8.3 保留的標準訊息（所有活動通用）
| 訊息 | 方向 | type/command | 說明 |
|---|---|---|---|
| \*\*ready\*\* | Activity → Host | `type: "ready"` | 活動載入完成。Host 收到前 MUST NOT 發送指令 |
| \*\*updateConfig\*\* | Host → Activity | `command: "updateConfig"` | 動態更新 `window.gameConfig` |
| \*\*updateLocale\*\* | Host → Activity | `command: "updateLocale"` | 動態切換語系 `{ "locale": "BCP47-tag" }` |
| \*\*networkStatusChanged\*\* | Host → Activity | `command: "networkStatusChanged"` | 網路狀態變更 `{ "online": boolean }` |
### 8.4 Quiz 專用訊息
| 訊息 | 方向 | type/command | 說明 |
|---|---|---|---|
| \*\*navigate\*\* | Activity → Host | `type: "navigate"` | 教師翻頁，`{ "index": N }`。Host 回寫 `config.current-index` |
| \*\*answerRevealed\*\* | Activity → Host | `type: "answerRevealed"` | 教師點擊 Answer，`{ "index": N }`。Host 回寫 `config.items[N].answer-revealed = true` |
| \*\*editRequest\*\* | Activity → Host | `type: "editRequest"` | 教師點擊 Edit，`{ "index": N }`。Host 開啟編輯 UI |
| \*\*deleteRequest\*\* | Activity → Host | `type: "deleteRequest"` | 教師點擊 Delete，`{ "index": N }`。Host 確認後發送 `updateConfig` |
| \*\*revealAnswer\*\* | Host → Activity | `command: "revealAnswer"` | Host 通知公布答案 `{ "index": N }` |
| \*\*navigate\*\* | Host → Activity | `command: "navigate"` | Host 通知跳轉 `{ "index": N }` |
> Quiz 採用 \*\*Activity 自主模式\*\*：按鈕在 Quiz HTML 內，Quiz 自行管理翻頁和公布，透過事件通知 Host 同步持久化。
---
## 9. 安全需求（Normative）
### 9.1 輸入驗證
| 項目 | 規範 |
|---|---|
| \*\*element.id\*\* | MUST 符合 UUID v4 正規表達式 |
| \*\*JavaScript 注入\*\* | MUST 經 `JSON.stringify()` 序列化 |
| \*\*檔案路徑\*\* | MUST NOT 包含 `..`，canonicalize 後驗證 |
| \*\*manifest.entry\*\* | MUST NOT 含 `..`，MUST 以 `.html`/`.htm` 結尾 |
| \*\*locale\*\* | MUST 為合法 BCP 47 標籤 |
| \*\*olf-asset:// 路徑\*\* | MUST NOT 含 `..`，MUST NOT 以 `/` 開頭 |
### 9.2 Sandbox 白名單
\*\*允許\*\*：`allow-scripts`（預設）、`allow-forms`
\*\*禁止\*\*：`allow-same-origin`、`allow-top-navigation`、`allow-top-navigation-by-user-activation`、`allow-popups-to-escape-sandbox`
### 9.3 Permissions Policy 白名單
\*\*允許\*\*：`accelerometer`、`gyroscope`、`autoplay`
\*\*禁止\*\*：`camera`、`microphone`、`clipboard-write`、`clipboard-read`、`geolocation`、`payment`
### 9.4 CSP
所有活動皆為本地載入，預設 CSP：`connect-src 'none'` 阻斷外部網路。
### 9.5 通訊安全
- MUST 使用 MessageChannel（非 `postMessage("\*")`）
- 每個活動獨立 MessageChannel，活動間不能互通
- Handshake 的 `postMessage` 僅傳遞 port，不攜帶敏感資料
### 9.6 資源耗盡防護
- ZIP bomb：解壓前檢查 size（200MB/活動，500MB/總計）
- Watchdog：30 秒未 `ready` → 終止 WebView，顯示 poster
- 記憶體壓力 → 銷毀非可視活動
- Storage 配額建議 5MB
- 同頁 active 活動：mobile ≤ 1，desktop ≤ 2
### 9.7 錯誤處理
| 錯誤 | 行為 |
|---|---|
| manifest.json 缺失/無效 | 記錄警告，以 content.json 屬性為準 |
| config 不符 schema | 記錄警告，原樣注入 |
| index.html 缺失 | 顯示 poster + 錯誤提示 |
| ZIP 解壓失敗 | 顯示 poster + 錯誤提示 |
| olf-asset:// 資源不存在 | 替換為空字串，記錄警告 |
| WebView 建立失敗 | 顯示 poster + 裝置不支援提示 |
---
## 10. 效能需求與策略
### 10.1 載入行為
| 值 | 行為 |
|---|---|
| `"on-demand"`（預設） | 顯示 poster，使用者點擊後才載入 |
| `"eager"` | 翻頁即開始載入（背景執行緒） |
### 10.2 解壓策略
- MUST 延遲解壓（僅解壓當前需要的活動）
- MUST 背景執行緒（不阻塞 UI）
- 解壓 buffer ≥ 64KB
- 超過 2 秒 SHOULD 顯示進度
### 10.3 WebView 生命週期
- SHOULD 維護 WebView pool
- 離開頁面 → 銷毀或導航至 `about:blank`
- 活動載入期間 MUST 顯示 poster + loading indicator
- 30 秒 timeout → 終止 + 重試按鈕
### 10.4 快取
- Cache key = activity UUID + CRC32
- LRU 上限 200MB
- OLF 關閉或 app 結束時失效
---
## 11. Quiz 測驗擴展
本章定義 `category: "Activity\_HTML\_QUIZ"` 的專用結構。Quiz 使用標準 `html-activity` 機制，題目資料放在 `config` 中注入為 `window.gameConfig`。
### 11.1 使用場景
教師大屏投影，教師操作翻頁和公布答案，學生看大屏幕。暫不考慮學生端。
### 11.2 Quiz config 結構
```json
{
"html-activity": {
"category": "Activity\_HTML\_QUIZ",
"source": "html-activities/{id}/index.html",
"poster": "quiz-assets/{id}/quiz-preview.png",
"load-behavior": "eager",
"sandbox": "allow-scripts",
"is-locked": true,
"config": {
"version": "1.0",
"title": "水循環 — 第三章複習",
"instruction": "老師會逐題公布題目。",
"current-index": 0,
"items": [
{ "quiz-item": { } }
]
}
}
}
```
\*\*config 屬性：\*\*
| 屬性 | 類型 | 必填 | 說明 |
|---|---|---|---|
| \*\*version\*\* | `string` | Yes | Quiz 資料版本（`"1.0"`） |
| \*\*title\*\* | `string` | No | Quiz 標題 |
| \*\*instruction\*\* | `string` | No | 說明文字 |
| \*\*current-index\*\* | `integer` | Yes | 目前顯示的題目索引（0-based） |
| \*\*items\*\* | `array` | Yes | 題目列表 `{ "quiz-item": { ... } }` |
### 11.3 quiz-item 題目結構
```json
{
"quiz-item": {
"id": "q1-uuid",
"sequence": 1,
"item-body": "太陽系中最大的行星是什麼？",
"image": "olf-asset://quiz-assets/{quiz-id}/solar\_system.png",
"image-mime-type": "image/png",
"answer-revealed": false,
"answer-feedback": "木星是太陽系最大的行星。",
"interaction": { }
}
}
```
| 屬性 | 類型 | 必填 | 說明 |
|---|---|---|---|
| \*\*id\*\* | `string` | Yes | UUID |
| \*\*sequence\*\* | `integer` | Yes | 1-based 顯示順序 |
| \*\*item-body\*\* | `string` | Yes | 題目文字 |
| \*\*image\*\* | `string` | No | 題目圖片 `olf-asset://quiz-assets/{id}/...` 或 `null` |
| \*\*image-mime-type\*\* | `string` | No | `image` 有值時必填 |
| \*\*answer-revealed\*\* | `boolean` | Yes | 該題答案是否已公布 |
| \*\*answer-feedback\*\* | `string` | No | 答案解析 |
| \*\*interaction\*\* | `object` | Yes | 題型資料（§11.4） |
### 11.4 四種 Interaction 類型
#### 11.4.1 單選題（single-choice）
Renderer 渲染為 radio button。恰好一個 `is-answer: true`。
```json
"interaction": {
"type": "single-choice",
"shuffle-options": false,
"options": [
{ "option": { "id": "uuid", "label": "A", "text": "選項文字", "image": null, "is-answer": true } },
{ "option": { "id": "uuid", "label": "B", "text": "選項文字", "image": null, "is-answer": false } }
]
}
```
#### 11.4.2 多選題（multiple-choice）
Renderer 渲染為 checkbox。一個以上 `is-answer: true`。
```json
"interaction": {
"type": "multiple-choice",
"shuffle-options": false,
"min-selections": 1,
"max-selections": 4,
"options": [ /\* 同 single-choice 結構 \*/ ]
}
```
#### 11.4.3 是非題（true-or-false）
```json
"interaction": {
"type": "true-or-false",
"first-label": "對",
"last-label": "錯",
"correct-response": "true"
}
```
#### 11.4.4 簡答題（short-answer）
```json
"interaction": {
"type": "short-answer",
"correct-response": "光合作用",
"case-sensitive": false,
"accepted-responses": ["光合作用", "photosynthesis"],
"max-length": 100,
"placeholder": "請輸入答案..."
}
```
#### 11.4.5 題型比較
| | 單選題 | 多選題 | 是非題 | 簡答題 |
|---|---|---|---|---|
| `type` | `single-choice` | `multiple-choice` | `true-or-false` | `short-answer` |
| 渲染 | Radio button | Checkbox | 兩個按鈕 | 文字輸入框 |
| 正確答案 | `is-answer`（1 個） | `is-answer`（1+） | `correct-response` | `correct-response` + `accepted-responses` |
| 圖片選項 | Yes | Yes | No | No |
### 11.5 答案公布機制（翻頁卡片模式）
Quiz 以\*\*卡片翻頁\*\*方式呈現，一次只顯示一題，底部有操作列。
```
┌──────────────────────────────────────────────┐
│ ☑ Multiple Choice [Single Answer] │
│ │
│ 題目文字... │
│ │
│ ┌─ A ─────────────┐ ┌─ B ─────────────┐ │
│ │ 選項 A 文字 │ │ 選項 B 文字 │ │
│ └─────────────────┘ └─────────────────┘ │
│ ┌─ C ─────────────┐ ┌─ D ─────────────┐ │
│ │ 選項 C 文字 │ │ 選項 D 文字 │ │
│ └─────────────────┘ └─────────────────┘ │
│ │
│ [Answer] [Edit] [Delete] < 2/3 > │
└──────────────────────────────────────────────┘
```
\*\*操作列：\*\*
| 按鈕 | 說明 |
|---|---|
| \*\*Answer\*\* | 公布當前題目答案。`answer-revealed = true` 後變為不可用 |
| \*\*Edit\*\* | 發送 `editRequest` 給 Host，開啟編輯 UI |
| \*\*Delete\*\* | 發送 `deleteRequest` 給 Host，確認後 `updateConfig` |
| \*\*< >\*\* | 翻頁。教師可自由前後翻閱 |
\*\*答案公布視覺效果：\*\*
| 題型 | 效果 |
|---|---|
| 單選/多選 | 正確選項高亮（綠色），錯誤選項灰化 |
| 是非題 | 正確選項高亮 |
| 簡答題 | 顯示標準答案文字 |
| 所有題型 | 若有 `answer-feedback`，顯示解析 |
\*\*持久化（Host 回寫 config）：\*\*
| 事件 | Host 回寫 |
|---|---|
| `navigate` | `config.current-index` |
| `answerRevealed` | `config.items[N].quiz-item.answer-revealed` |
| 編輯完成 | `config.items`（整個列表） |
### 11.6 Quiz 資料匯入
教師可用簡化 JSON 格式準備題目，匯入 OLF 編輯器後自動轉換：
\*\*簡化匯入格式：\*\*
```json
{
"quiz": {
"title": "水循環複習",
"items": [
{
"type": "single-choice",
"question": "蒸發是什麼過程？",
"options": [
{ "text": "凝結", "correct": false },
{ "text": "蒸發", "correct": true }
],
"feedback": "蒸發是液態水轉為水蒸氣的過程。"
},
{
"type": "true-or-false",
"question": "雲是由水蒸氣凝結形成的。",
"answer": true
}
]
}
}
```
\*\*匯入轉換：\*\*
| 步驟 | 說明 |
|---|---|
| 產生 UUID | html-activity、quiz-item、option 各自產生 |
| 建立 html-activity | `category: "Activity\_HTML\_QUIZ"`，題目放入 config |
| 圖片處理 | 複製到 `quiz-assets/{id}/`，路徑改為 `olf-asset://` |
| 綁定 Quiz HTML | `html-activities/{id}/` 放入 standalone `index.html` + `manifest.json` |
| 初始狀態 | `current-index = 0`，`answer-revealed = false` |
---
## 12. 跨平台實作指引
### 12.1 Web（React + iframe + Blob URL + MessageChannel）
#### 載入方式
| 方式 | 適用情境 |
|---|---|
| \*\*Blob URL + iframe\*\* | Standalone 單一 HTML（唯一方式） |
#### React 元件：HtmlActivityPlayer
```tsx
function buildInjectionScript(config, elementId, locale) {
const configJson = JSON.stringify(config || {});
const idJson = JSON.stringify(elementId);
const localeJson = JSON.stringify(locale);
return `<script>
window.gameConfig = ${configJson};
window.\_\_olf = {
elementId: ${idJson},
version: "1.0",
locale: ${localeJson},
online: navigator.onLine,
\_port: null,
\_pendingCallback: null,
sendMessage: function(type, data) {
if (!this.\_port) return;
this.\_port.postMessage({
source: "olf-activity", elementId: this.elementId,
type: type, data: data
});
},
onMessage: function(callback) {
if (this.\_port) {
this.\_port.onmessage = function(e) { callback(e.data); };
} else { this.\_pendingCallback = callback; }
}
};
window.addEventListener("message", function handler(e) {
if (e.data && e.data.source === "olf-handshake" && e.ports[0]) {
window.\_\_olf.\_port = e.ports[0];
if (window.\_\_olf.\_pendingCallback) {
window.\_\_olf.\_port.onmessage = function(ev) {
window.\_\_olf.\_pendingCallback(ev.data);
};
}
window.removeEventListener("message", handler);
}
});
<\/script>
<meta http-equiv="Content-Security-Policy"
content="default-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data:; connect-src 'none';">`;
}
```
\*\*載入流程\*\*：
1. 建構注入腳本（`buildInjectionScript`）
2. 改寫 HTML prepend 注入腳本
3. 建立 Blob URL → `<iframe src={blobUrl}>`
4. iframe onLoad → 建立 MessageChannel → handshake
5. 監聽 Activity 事件（ready、navigate、answerRevealed 等）
6. 30 秒 watchdog
#### 頁面整合流程
三階段：\*\*選擇檔案 → 編輯 gameConfig → 載入活動\*\*
- 使用者選擇 `.olf` 或 `.html` 檔案
- 系統抽取 `window.gameConfig`，以 JSON 編輯器顯示
- 使用者可修改後載入，可隨時返回編輯重新載入
### 12.2 Windows（WebView2 / C#）
- UUID 格式驗證
- 背景執行緒解壓（64KB buffer）
- `AddScriptToExecuteOnDocumentCreatedAsync` 注入 config
- `SetVirtualHostNameToFolderMapping` 映射活動目錄
- `WebMessageReceived` 監聽事件
- 30 秒 watchdog
### 12.3 Flutter（InAppWebView / Dart）
- `compute()` 背景解壓
- `UserScript` + `AT\_DOCUMENT\_START` 注入
- `shouldInterceptRequest` 網路控制
- `addJavaScriptHandler` 雙向通訊
- `FutureBuilder` loading 狀態 + poster
---
## 13. 向後相容性
| 情境 | 行為 |
|---|---|
| 舊版 Renderer 遇到 `activities[]` | 忽略未知欄位，正常顯示其他元素 |
| 舊版 Renderer 遇到 `Activity\_HTML\_QUIZ` | 視為一般 `html-activity`，WebView 正常渲染（功能完整，Host 不處理 Quiz 專屬事件） |
| 不支援 WebView 的平台 | 顯示 `poster` 預覽圖 |
| 舊版 Renderer 遇到 `quiz-assets/` | 忽略未預期的資料夾 |
---
## 14. 完整範例
### 範例 A：PhET 模擬器（本地，無 config）
```json
{
"html-activity": {
"id": "b7e3f1a2-9c84-4d56-8e12-a3f567890abc",
"x": 160, "y": 100, "width": 1600, "height": 900,
"matrix": "1,0,0,0,1,0,0,0,1",
"category": "Activity\_HTML\_PHET",
"source": "html-activities/b7e3f1a2-9c84-4d56-8e12-a3f567890abc/index.html",
"poster": "images/phet-energy-preview.png",
"load-behavior": "on-demand",
"sandbox": "allow-scripts",
"is-locked": true
}
}
```
### 範例 B：Jeopardy 遊戲（本地，帶 config）
```json
{
"html-activity": {
"id": "f2a3b4c5-d6e7-4f89-0a12-b3c4d5e6f789",
"x": 0, "y": 0, "width": 1920, "height": 1080,
"matrix": "1,0,0,0,1,0,0,0,1",
"category": "Activity\_HTML\_GAME",
"source": "html-activities/f2a3b4c5-d6e7-4f89-0a12-b3c4d5e6f789/index.html",
"locale": "zh-TW",
"config": {
"strings": { "startTitle": "JEOPARDY", "scoresTitle": "排行榜" },
"settings": { "questionCountdownEnabled": true, "questionCountDownSeconds": 3 },
"players": [
{ "id": 1, "name": "第一組", "score": 0 },
{ "id": 2, "name": "第二組", "score": 0 }
],
"questions": [
{
"category": "React 基礎",
"questions": [
{ "points": 100, "question": "管理組件狀態的 Hook？", "answer": "useState", "options": ["useState", "useEffect", "useMemo"] }
]
}
]
},
"poster": "images/jeopardy-preview.png",
"load-behavior": "eager",
"sandbox": "allow-scripts",
"is-locked": true
}
}
```
### 範例 C：Quiz 測驗（本地，混合題型）
```json
{
"html-activity": {
"id": "f7a2b3c4-d5e6-4f70-8a9b-c0d1e2f34567",
"x": 40, "y": 40, "width": 1200, "height": 640,
"matrix": "1,0,0,0,1,0,0,0,1",
"category": "Activity\_HTML\_QUIZ",
"source": "html-activities/f7a2b3c4-d5e6-4f70-8a9b-c0d1e2f34567/index.html",
"poster": "quiz-assets/f7a2b3c4-d5e6-4f70-8a9b-c0d1e2f34567/quiz-preview.png",
"load-behavior": "eager",
"sandbox": "allow-scripts",
"is-locked": true,
"config": {
"version": "1.0",
"title": "水循環 — 第三章複習",
"instruction": "老師會逐題公布題目。",
"current-index": 0,
"items": [
{
"quiz-item": {
"id": "q1-uuid", "sequence": 1,
"item-body": "將液態水轉為水蒸氣的過程叫什麼？",
"image": null, "answer-revealed": false,
"answer-feedback": "蒸發是太陽熱能將水分子提升至大氣的過程。",
"interaction": {
"type": "single-choice",
"shuffle-options": false,
"options": [
{ "option": { "id": "o1", "label": "A", "text": "凝結", "image": null, "is-answer": false } },
{ "option": { "id": "o2", "label": "B", "text": "蒸發", "image": null, "is-answer": true } },
{ "option": { "id": "o3", "label": "C", "text": "降水", "image": null, "is-answer": false } },
{ "option": { "id": "o4", "label": "D", "text": "蒸散", "image": null, "is-answer": false } }
]
}
}
},
{
"quiz-item": {
"id": "q2-uuid", "sequence": 2,
"item-body": "觀察下圖，哪些階段涉及水向上移動？（複選）",
"image": "olf-asset://quiz-assets/f7a2b3c4-d5e6-4f70-8a9b-c0d1e2f34567/water\_cycle.png",
"image-mime-type": "image/png",
"answer-revealed": false,
"interaction": {
"type": "multiple-choice",
"shuffle-options": false,
"min-selections": 1, "max-selections": 4,
"options": [
{ "option": { "id": "o5", "label": "A", "text": "蒸發", "image": null, "is-answer": true } },
{ "option": { "id": "o6", "label": "B", "text": "凝結", "image": null, "is-answer": false } },
{ "option": { "id": "o7", "label": "C", "text": "蒸散", "image": null, "is-answer": true } },
{ "option": { "id": "o8", "label": "D", "text": "逕流", "image": null, "is-answer": false } }
]
}
}
},
{
"quiz-item": {
"id": "q3-uuid", "sequence": 3,
"item-body": "雲是由水蒸氣凝結形成的。",
"image": null, "answer-revealed": false,
"interaction": {
"type": "true-or-false",
"first-label": "對", "last-label": "錯",
"correct-response": "true"
}
}
},
{
"quiz-item": {
"id": "q4-uuid", "sequence": 4,
"item-body": "植物透過葉片釋放水蒸氣的過程稱為？",
"image": null, "answer-revealed": false,
"interaction": {
"type": "short-answer",
"correct-response": "蒸散作用",
"case-sensitive": false,
"accepted-responses": ["蒸散作用", "蒸散", "transpiration"],
"max-length": 60,
"placeholder": "請輸入過程名稱..."
}
}
}
]
}
}
}
```
---
## 15. 驗證計畫
### 測試矩陣
| # | 活動 | Category | config | 驗證重點 |
|---|---|---|---|---|
| 1 | PhET Energy Skate Park | `PHET` | 無 | 大型 standalone HTML、poster、sandbox、CSP |
| 2 | PhET Wave on a String | `PHET` | 無 | 另一 PhET 模擬器驗證 |
| 3 | Jeopardy 問答 | `GAME` | 有（strings/questions） | gameConfig 注入、遊戲遷移（base64→bundle） |
| 4 | 配對遊戲 | `GAME` | 有 | MessageChannel 通訊、olf-asset:// |
| 5 | \*\*Quiz 水循環測驗\*\* | \*\*`QUIZ`\*\* | 有（quiz-item × 4 型） | \*\*翻頁卡片、Answer 公布、Edit/Delete 通訊、quiz-assets 圖片引用\*\* |
### 安全驗證
| 測試 | 預期 |
|---|---|
| id 含特殊字元 | 拒絕載入 |
| sandbox `allow-same-origin` | 自動剝除 |
| config 路徑穿越 `../../../` | 驗證失敗 |
| ZIP 含 `../../evil.js` | 拒絕整個 OLF |
| 活動 `fetch("https://evil.com")` | CSP 阻擋 |
### Quiz 專項驗證
| 測試 | 預期 |
|---|---|
| 翻頁 `< >` | `navigate` 事件送到 Host，`current-index` 更新 |
| 點擊 Answer | 正確選項高亮 + 解析顯示，`answerRevealed` 事件送到 Host |
| 點擊 Edit | `editRequest` 事件送到 Host，Host 開啟編輯 UI |
| `updateConfig` 後 | Quiz HTML 重新渲染修改後的題目 |
| 4 種混合題型 | 各題型正確渲染和公布 |
| quiz-assets 圖片 | `olf-asset://quiz-assets/{id}/...` 正確解析為可用 URL |
---
## 16. 需修改的檔案清單
| 檔案 | 修改內容 |
|---|---|
| `OpenLearningFormat\_Spec.md` | 新增 html-activity 定義、activities 陣列、quiz-assets 資料夾 |
| `OLF\_Appendix.md` | 新增完整屬性表、quiz-item schema、olf-asset:// 協議 |
| `libolf/documentation/mvb.schema\_element.json` | 新增 html-activity JSON Schema |
| `libolf/documentation/mvb.schema.json` | page 新增 activities 陣列 |
| `libolf/myviewboard-mvbfile/src/MVBContent\_impl.cpp` | 解壓 buffer 64KB、Zip Slip 防護 |
---
## 整合一致性驗證
以下確認兩份規格合併後無衝突：
### 機制一致性
| 機制 | 遊戲/模擬器 | Quiz | 一致？ |
|---|---|---|---|
| 元素類型 | `html-activity` | `html-activity`（category 區分） | ✅ |
| Config 注入 | `window.gameConfig` | `window.gameConfig`（含 quiz-item） | ✅ |
| 橋接物件 | `window.\_\_olf` | `window.\_\_olf` | ✅ |
| 通訊管道 | MessageChannel | MessageChannel | ✅ |
| 訊息格式 | `source: "olf-activity"` / `"olf-host"` | 相同格式 | ✅ |
| ready handshake | Activity → Host `ready` | 相同 | ✅ |
| 圖片引用 | `olf-asset://images/...` | `olf-asset://quiz-assets/{id}/...` | ✅（同協議，不同路徑） |
| Sandbox/CSP | §9.2-9.4 | 沿用 | ✅ |
| Blob URL 載入 | §12.1 | 沿用 | ✅ |
### 訊息命名空間
| 訊息 | 範圍 | 衝突？ |
|---|---|---|
| `ready` | 所有活動 | ✅ 通用 |
| `updateConfig` | 所有活動 | ✅ 通用 |
| `updateLocale` | 所有活動 | ✅ 通用 |
| `score` / `completion` | 遊戲專用 | ✅ 不衝突（Quiz 不使用） |
| `navigate` / `answerRevealed` / `editRequest` / `deleteRequest` | Quiz 專用 | ✅ 不衝突（遊戲不使用） |
| `revealAnswer`（Host→Activity） | Quiz 專用 | ✅ 不衝突 |
### olf-asset:// 路徑命名空間
| 路徑前綴 | 用途 | 衝突？ |
|---|---|---|
| `olf-asset://images/` | OLF 共用圖片 | ✅ |
| `olf-asset://quiz-assets/{id}/` | Quiz 專用素材 | ✅ 不衝突（獨立資料夾） |
| `olf-asset://additional/` | 附加資源 | ✅ |
### ZIP 資料夾命名空間
| 資料夾 | 用途 | 衝突？ |
|---|---|---|
| `html-activities/` | Standalone HTML + manifest.json | ✅ |
| `quiz-assets/` | Quiz 圖片素材 | ✅ 不衝突（獨立資料夾） |
| `images/` | OLF 共用圖片 | ✅ 不衝突 |
\*\*結論：兩份規格在機制、訊息、路徑、資料夾命名上無任何衝突，可安全整合。\*\*
false30000Markdowndefault0e65e300-700d-49d4-852a-12c327c065c05cfd11ab-5ec6-4258-b88a-48087704cb77/c6f04b52-426d-41f2-8b84-0dbd9143b977/static/markdowncom.atlassian.ecosystem0e65e300-700d-49d4-852a-12c327c065c0ari:cloud:ecosystem::extension/5cfd11ab-5ec6-4258-b88a-48087704cb77/c6f04b52-426d-41f2-8b84-0dbd9143b977/static/markdownMarkdownextensionPRODUCTIONmacro468615756pageV82969672ari:cloud:confluence:2ea8088c-133a-424f-9a3b-946e7ade9dad:workspace/5047f522-e68d-4d5e-8f61-2bb2887b80ff712020:c6bc3e91-a86f-4d8b-b073-37e644ab9dff2ea8088c-133a-424f-9a3b-946e7ade9dadUTF-8truefalse# OLF HTML Activity 規格（整合版）
> \*\*狀態\*\*：Integrated Draft v1.0
> \*\*日期\*\*：2026-04-01
> \*\*目的\*\*：擴展 OLF 格式，支援嵌入完整 HTML 應用（模擬器、遊戲、Quiz 測驗），透過 `window.gameConfig/window.config` 注入參數、`window.\_\_olf` 雙向通訊
> \*\*涵蓋範圍\*\*：html-activity 通用機制 + Quiz 測驗專用擴展
> \*\*整合來源\*\*：OLF\_HTML\_ACTIVITY\_SPEC\_DRAFT.md (v0.3) + OLF\_QUIZ\_ACTIVITY\_SPEC\_DRAFT.md (v0.2)
---
## 目錄
1. [背景與動機](#1-背景與動機)
2. [設計原則](#2-設計原則)
3. [ZIP 結構擴展](#3-zip-結構擴展)
4. [Page 結構變更：新增 activities 陣列](#4-page-結構變更新增-activities-陣列)
5. [html-activity 元素定義](#5-html-activity-元素定義)
6. [manifest.json 活動描述檔](#6-manifestjson-活動描述檔)
7. [Config 注入機制](#7-config-注入機制)
8. [雙向通訊協議](#8-雙向通訊協議)
9. [安全需求（Normative）](#9-安全需求normative)
10. [效能需求與策略](#10-效能需求與策略)
11. [Quiz 測驗擴展](#11-quiz-測驗擴展)
12. [跨平台實作指引](#12-跨平台實作指引)
13. [向後相容性](#13-向後相容性)
14. [完整範例](#14-完整範例)
15. [驗證計畫](#15-驗證計畫)
16. [需修改的檔案清單](#16-需修改的檔案清單)
> \*\*RFC 2119 用語\*\*：本文件中 MUST、MUST NOT、SHOULD、MAY 依照 [RFC 2119](https://tools.ietf.org/html/rfc2119) 定義使用。
---
## 1. 背景與動機
### 1.1 現況
OLF 目前支援靜態教學內容（文字、圖片、形狀）和簡單互動工具（骰子、閃卡、計時器），但缺乏：
- 嵌入完整 HTML 應用的能力（PhET 模擬器、自製遊戲）
- 互動式測驗元件（Quiz：單選、多選、是非、簡答）
現有的 `widget-player` 已標記為 \*\*deprecated\*\*，`content-polling.json` 偏向即時投票場景。
### 1.2 需求
| 需求 | 說明 |
|---|---|
| 嵌入靜態 HTML 模擬器 | PhET Colorado 等完整自包含的 standalone HTML5 模擬器 |
| 嵌入自製 HTML 遊戲 | 透過 `window.gameConfig` 帶入參數，動態配置遊戲行為 |
| 互動式 Quiz 測驗 | 單選、多選、是非、簡答，混合題型，逐題公布答案 |
| 跨平台渲染 | Windows（WebView2）、Flutter（InAppWebView）、Web（iframe） |
| 雙向通訊 | 宿主端注入 config，活動端回傳事件 |
---
## 2. 設計原則
1. \*\*專用元素類型\*\*：新增 `html-activity`，不擴展已 deprecated 的 `widget-player`
2. \*\*獨立陣列\*\*：在 page 下新增 `activities[]`，與 `elements[]`、`tools[]` 同層
3. \*\*Standalone 單一 HTML\*\*：每個活動的 `index.html` MUST 為自包含檔案（所有 JS/CSS/資源已 inline），活動目錄內只有 `index.html` + `manifest.json` 兩個檔案
4. \*\*離線優先\*\*：HTML bundle 完整嵌入 OLF ZIP，所有活動皆為本地載入
5. \*\*Config 雙軌\*\*：`window.gameConfig` 靜態注入 + `MessageChannel` 動態更新
6. \*\*通訊管道不綁定事件\*\*：僅定義 MessageChannel 基本格式，具體事件由各活動自行定義
7. \*\*漸進降級\*\*：`poster` 預覽圖確保不支援 HTML 渲染的平台也能顯示內容
8. \*\*預設安全\*\*：所有活動預設最嚴格沙箱，禁止危險組合，強制 CSP
9. \*\*預設延遲載入\*\*：活動預設 `on-demand`，使用者點擊 poster 後才啟動 WebView
10. \*\*Category 分類\*\*：透過 `category` 區分活動類型（`Activity\_HTML\_PHET`、`Activity\_HTML\_GAME`、`Activity\_HTML\_QUIZ`）
---
## 3. ZIP 結構擴展
### 3.1 擴展後結構
```
project.olf (ZIP)
├── content.json
├── content-polling.json (optional)
├── images/ ← OLF 共用圖片
├── videos/
├── thumbnails/
├── additional/
├── html-activities/ ← HTML 活動（新增）
│ ├── {activity-uuid-1}/
│ │ ├── index.html ← Standalone 單一 HTML（所有 JS/CSS/資源已 inline）
│ │ └── manifest.json ← 活動描述
│ └── {activity-uuid-2}/
│ ├── index.html
│ └── manifest.json
└── quiz-assets/ ← Quiz 專用素材（新增）
└── {quiz-uuid}/
├── question-image.png
├── option-image.jpg
└── quiz-preview.png
```
### 3.2 資料夾說明
| 資料夾 | 用途 | 命名規則 |
|---|---|---|
| `html-activities/` | HTML 活動（每個活動只有 `index.html` + `manifest.json`） | 子目錄名 = 活動 UUID |
| `quiz-assets/` | Quiz 題目圖片等素材 | 子目錄名 = Quiz 活動 UUID |
### 3.3 為何 Quiz 素材獨立資料夾
| 理由 | 說明 |
|---|---|
| 隔離性 | Quiz 素材不與 `images/` 的頁面背景混雜 |
| 生命週期一致 | 刪除 Quiz 時整個子目錄移除 |
| 可索引 | Renderer 可按 UUID 快速定位 |
| 匯入友善 | 外部 JSON 匯入時圖片直接放入對應子目錄 |
### 3.4 ZIP 安全需求
- 實作端 MUST 驗證所有 ZIP entry 路徑在 canonicalize 後仍位於解壓根目錄內（防 Zip Slip，CVE-2018-1002200）
- 任何路徑含 `..` 的 entry，MUST 拒絕並視整個 OLF 為惡意檔案
- 子目錄名 MUST 符合 UUID 格式
- 單一活動解壓上限 200MB，全部活動總和上限 500MB
---
## 4. Page 結構變更：新增 activities 陣列
```json
{
"page": {
"id": "page-uuid",
"matrix": "1,0,0,0,1,0,0,0,1",
"elements": [ ],
"tools": [ ],
"activities": [
{ "html-activity": { "category": "Activity\_HTML\_GAME", ... } },
{ "html-activity": { "category": "Activity\_HTML\_QUIZ", ... } }
],
"groups": [ ],
"backgrounds": [ ]
}
}
```
`activities[]` 與 `elements[]`、`tools[]` 同層。所有活動類型（遊戲、模擬器、Quiz）都使用 `html-activity` wrapper key，以 `category` 區分。
---
## 5. html-activity 元素定義
### 5.1 JSON 結構
```json
{
"html-activity": {
"id": "a1b2c3d4-e5f6-4a90-8bcd-ef1234567890",
"x": 100.0,
"y": 100.0,
"width": 900.0,
"height": 600.0,
"matrix": "1,0,0,0,1,0,0,0,1",
"category": "Activity\_HTML\_GAME",
"source": "html-activities/a1b2c3d4-e5f6-4a90-8bcd-ef1234567890/index.html",
"config": { },
"poster": "images/game-preview.png",
"locale": "zh-TW",
"load-behavior": "on-demand",
"sandbox": "allow-scripts",
"allow": "",
"is-locked": true,
"min-width": 800,
"min-height": 500
}
}
```
### 5.2 屬性定義
| 屬性 | 類型 | 必填 | 說明 |
|---|---|---|---|
| \*\*id\*\* | `string` | Yes | UUID v4 格式。同時作為 `html-activities/` 和 `quiz-assets/` 子目錄名 |
| \*\*x\*\* | `number` | Yes | 頁面上的 X 座標 |
| \*\*y\*\* | `number` | Yes | 頁面上的 Y 座標 |
| \*\*width\*\* | `number` | Yes | 元素寬度 |
| \*\*height\*\* | `number` | Yes | 元素高度 |
| \*\*matrix\*\* | `string` | Yes | 標準 OLF 3x3 轉換矩陣 |
| \*\*category\*\* | `string` | Yes | 活動分類（見 §5.3） |
| \*\*source\*\* | `string` | Yes | HTML 進入點路徑（`html-activities/{id}/index.html`） |
| \*\*config\*\* | `object` | No | 注入 `window.gameConfig` 的 JSON 物件 |
| \*\*poster\*\* | `string` | No | 預覽圖路徑（如 `images/preview.png`） |
| \*\*locale\*\* | `string` | No | BCP 47 語言標籤，覆寫宿主端語系 |
| \*\*load-behavior\*\* | `string` | No | `"on-demand"`（預設）或 `"eager"` |
| \*\*sandbox\*\* | `string` | No | iframe sandbox 旗標。預設 `"allow-scripts"`。受白名單約束（§9.2） |
| \*\*allow\*\* | `string` | No | iframe Permissions Policy。受白名單約束（§9.3） |
| \*\*is-locked\*\* | `boolean` | No | 鎖定位置與大小。預設 `false` |
| \*\*min-width\*\* | `number` | No | 最小寬度 |
| \*\*min-height\*\* | `number` | No | 最小高度 |
### 5.3 Category 分類
| Category 值 | 用途 | 典型案例 |
|---|---|---|
| `Activity\_HTML\_PHET` | PhET 教學模擬器 | PhET Energy Skate Park、PhET Wave on a String |
| `Activity\_HTML\_GAME` | 自製 HTML 遊戲（帶 config） | Jeopardy、配對遊戲 |
| `Activity\_HTML\_QUIZ` | 互動式測驗（帶 quiz-item config） | 單選、多選、是非、簡答混合 |
### 5.4 離線行為
所有活動皆為本地載入（`source` 指向 ZIP 內路徑），完全離線可用。
| network-access | 離線行為 |
|---|---|
| `false`（預設） | \*\*完全離線可用\*\*，CSP 阻斷外部請求 |
| `true` | 核心 HTML 離線可用，網路附加功能降級 |
---
## 6. manifest.json 活動描述檔
每個 HTML 活動目錄 MUST 包含 `manifest.json`。
### 6.0 manifest.json 的用意
`manifest.json` 讓 Renderer \*\*不需要打開或執行 HTML 就能預先知道\*\*這個活動的能力和需求：
| 用途 | 說明 | 實際影響 |
|---|---|---|
| \*\*是否需要帶入參數\*\* | `receives-config: true` → Renderer 需注入 `window.gameConfig` | PhET 不需要 config，Jeopardy/Quiz 需要。Renderer 據此決定是否注入 |
| \*\*語言怎麼切換\*\* | `i18n.supports-dynamic-switch` → 是否可在執行中發送 `updateLocale` | `true`：發送指令即可。`false`：需銷毀 WebView 重建才能換語言 |
| \*\*支援哪些語言\*\* | `i18n.supported-locales` → 活動支援的語系列表 | Renderer 可在語言不支援時提前提示，而非載入後才發現 |
| \*\*會送什麼事件\*\* | `capabilities.event-types` → 活動會發送的事件列表 | Host 據此知道要監聽 `score`（遊戲）還是 `answerRevealed`（Quiz） |
| \*\*效能預估\*\* | `estimated-memory`、`max-bundle-size` | Renderer 可在低階裝置上決定是否載入大型活動 |
| \*\*config 資料格式\*\* | `config-schema` → JSON Schema 描述 `window.gameConfig` 結構 | 編輯器可據此產生 config 編輯 UI，匯入時可驗證格式 |
\*\*簡單來說\*\*：manifest.json 是活動的「自我介紹」，告訴 Renderer 和編輯器「我需要什麼、我會做什麼、我能處理什麼」。
### 6.1 通用結構
```json
{
"name": "Activity Name",
"name-i18n": { "zh-TW": "活動名稱" },
"version": "1.0.0",
"entry": "index.html",
"engine": "custom-game",
"description": "Activity description",
"description-i18n": { "zh-TW": "活動描述" },
"config-schema": { },
"capabilities": {
"receives-config": true,
"sends-events": true,
"event-types": ["score", "completion"]
},
"requirements": {
"min-width": 800,
"min-height": 500,
"allow-scripts": true,
"network-access": false,
"estimated-memory": "60MB",
"max-bundle-size": "5MB",
"file-count": 12
},
"i18n": {
"supported-locales": ["en", "zh-TW"],
"default-locale": "en",
"supports-dynamic-switch": true
}
}
```
### 6.2 欄位說明
| 欄位 | 必填 | 說明 |
|---|---|---|
| \*\*name\*\* | Yes | 人類可讀名稱 |
| \*\*version\*\* | Yes | Semver 版本號 |
| \*\*entry\*\* | Yes | HTML 進入點。MUST NOT 含 `..`，MUST 以 `.html`/`.htm` 結尾 |
| \*\*engine\*\* | No | 引擎提示（`phet-simulation`、`custom-game`、`olf-quiz`） |
| \*\*config-schema\*\* | No | JSON Schema，描述 `window.gameConfig` 結構 |
| \*\*capabilities\*\* | No | 活動能力宣告 |
| \*\*requirements\*\* | No | 效能和功能需求 |
| \*\*i18n\*\* | No | 語系支援（supported-locales、default-locale、supports-dynamic-switch） |
| \*\*name-i18n\*\* / \*\*description-i18n\*\* | No | 多語系名稱/描述 |
### 6.3 各 Category 的 manifest 差異
| 欄位 | GAME（Jeopardy） | PHET（PhET 模擬器） | QUIZ |
|---|---|---|---|
| `engine` | `"custom-game"` | `"phet-simulation"` | `"olf-quiz"` |
| `event-types` | `["score", "completion"]` | `[]`（無事件） | `["navigate", "answerRevealed", "editRequest", "deleteRequest"]` |
| `network-access` | 視遊戲而定 | `false` | `false` |
| `receives-config` | `true` | `false` | `true` |
| `supports-dynamic-switch` | `false` | `false` | `true` |
### 6.4 manifest.json vs content.json 分工
| 資訊 | manifest.json | content.json |
|---|---|---|
| 活動能力描述、config schema | Yes | - |
| 效能估計、i18n 支援 | Yes | - |
| 頁面位置和大小 | - | Yes |
| 實際 config 值 | - | Yes（`config` 欄位） |
| sandbox / allow / locale | - | Yes |
---
## 7. Config 注入機制
### 7.1 兩階段 Config
| 階段 | 機制 | 時機 |
|---|---|---|
| 初始注入 | `window.gameConfig = {}` | HTML 載入前 |
| 動態更新 | MessageChannel `updateConfig` | HTML 執行中 |
### 7.2 window.gameConfig 注入
Renderer MUST 在 HTML 的任何 `<script>` 執行前注入 `window.gameConfig`。
\*\*安全要求\*\*：所有注入值 MUST 經 `JSON.stringify()` 序列化，MUST NOT 使用字串拼接。
| 平台 | 保證方式 |
|---|---|
| Web | 改寫 HTML prepend 注入腳本（或 `srcdoc`） |
| Windows (WebView2) | `AddScriptToExecuteOnDocumentCreatedAsync` |
| Flutter (InAppWebView) | `UserScript` + `AT\_DOCUMENT\_START` |
### 7.3 window.\_\_olf 橋接物件
```javascript
window.\_\_olf = {
elementId: /\* string \*/,
version: "1.0",
locale: /\* BCP 47 tag \*/,
online: /\* boolean \*/,
sendMessage: function(type, data) { /\* via MessageChannel port \*/ },
onMessage: function(callback) { /\* via MessageChannel port \*/ },
\_port: null // 由 Renderer 透過 MessageChannel 注入
};
```
### 7.4 MessageChannel 建立流程
```
Host Activity (iframe/WebView)
│ 1. 建立 MessageChannel │
│ 2. 注入 window.gameConfig + window.\_\_olf
│ 3. postMessage 傳遞 port2（一次性 handshake）
│ ──────────────────────────────────► │
│ 4. Activity 綁定 port → \_\_olf.\_port │
│ 5. Activity 發送 ready │
│ ◄────────────────────────────────── │
│ 6. 通道建立完成，此後才可發送指令 │
```
### 7.5 olf-asset:// 資源引用協議
\*\*語法\*\*：`olf-asset://{zip-内路径}`
\*\*範例\*\*：
- `olf-asset://images/cat.png`（共用圖片）
- `olf-asset://quiz-assets/{quiz-id}/diagram.png`（Quiz 專用素材）
\*\*安全約束\*\*：MUST NOT 含 `..`，MUST NOT 以 `/` 開頭。
\*\*Renderer 處理\*\*：注入 `window.gameConfig` 前，MUST 遞迴掃描 config，將所有 `olf-asset://` 替換為平台可用 URL（blob URL / virtual host）。
### 7.6 Locale 機制
\*\*解析優先順序\*\*：`element.locale` > 宿主端語系 > `"en"`
\*\*動態切換\*\*：Host 透過 `updateLocale` 指令通知 Activity。不支援動態切換的活動 MAY 忽略。
### 7.7 已知語系問題
| 問題 | 說明 | 應對 |
|---|---|---|
| 文字烤進圖片 | 按鈕圖片含文字，無法透過 config 切換 | 替換圖片組或改用 CSS 按鈕 |
| JS 硬編碼文字 | 部分 UI 文字在打包後的 JS 中 | 評估影響範圍，改為 config 驅動 |
| PhET 每語系獨立檔案 | 每種語言一個 HTML | 選擇語系打包 |
| Locale 格式不一致 | BCP 47 `zh-TW` vs PhET `zh\_TW` | 活動端正規化 |
| 字型與排版 | CJK 缺字、RTL、文字溢位 | CSS fallback + 彈性佈局 |
---
## 8. 雙向通訊協議
### 8.1 Activity → Host 訊息格式
```json
{
"source": "olf-activity",
"elementId": "uuid",
"type": "事件名",
"data": { }
}
```
### 8.2 Host → Activity 訊息格式
```json
{
"source": "olf-host",
"command": "指令名",
"data": { }
}
```
### 8.3 保留的標準訊息（所有活動通用）
| 訊息 | 方向 | type/command | 說明 |
|---|---|---|---|
| \*\*ready\*\* | Activity → Host | `type: "ready"` | 活動載入完成。Host 收到前 MUST NOT 發送指令 |
| \*\*updateConfig\*\* | Host → Activity | `command: "updateConfig"` | 動態更新 `window.gameConfig` |
| \*\*updateLocale\*\* | Host → Activity | `command: "updateLocale"` | 動態切換語系 `{ "locale": "BCP47-tag" }` |
| \*\*networkStatusChanged\*\* | Host → Activity | `command: "networkStatusChanged"` | 網路狀態變更 `{ "online": boolean }` |
### 8.4 Quiz 專用訊息
| 訊息 | 方向 | type/command | 說明 |
|---|---|---|---|
| \*\*navigate\*\* | Activity → Host | `type: "navigate"` | 教師翻頁，`{ "index": N }`。Host 回寫 `config.current-index` |
| \*\*answerRevealed\*\* | Activity → Host | `type: "answerRevealed"` | 教師點擊 Answer，`{ "index": N }`。Host 回寫 `config.items[N].answer-revealed = true` |
| \*\*editRequest\*\* | Activity → Host | `type: "editRequest"` | 教師點擊 Edit，`{ "index": N }`。Host 開啟編輯 UI |
| \*\*deleteRequest\*\* | Activity → Host | `type: "deleteRequest"` | 教師點擊 Delete，`{ "index": N }`。Host 確認後發送 `updateConfig` |
| \*\*revealAnswer\*\* | Host → Activity | `command: "revealAnswer"` | Host 通知公布答案 `{ "index": N }` |
| \*\*navigate\*\* | Host → Activity | `command: "navigate"` | Host 通知跳轉 `{ "index": N }` |
> Quiz 採用 \*\*Activity 自主模式\*\*：按鈕在 Quiz HTML 內，Quiz 自行管理翻頁和公布，透過事件通知 Host 同步持久化。
---
## 9. 安全需求（Normative）
### 9.1 輸入驗證
| 項目 | 規範 |
|---|---|
| \*\*element.id\*\* | MUST 符合 UUID v4 正規表達式 |
| \*\*JavaScript 注入\*\* | MUST 經 `JSON.stringify()` 序列化 |
| \*\*檔案路徑\*\* | MUST NOT 包含 `..`，canonicalize 後驗證 |
| \*\*manifest.entry\*\* | MUST NOT 含 `..`，MUST 以 `.html`/`.htm` 結尾 |
| \*\*locale\*\* | MUST 為合法 BCP 47 標籤 |
| \*\*olf-asset:// 路徑\*\* | MUST NOT 含 `..`，MUST NOT 以 `/` 開頭 |
### 9.2 Sandbox 白名單
\*\*允許\*\*：`allow-scripts`（預設）、`allow-forms`
\*\*禁止\*\*：`allow-same-origin`、`allow-top-navigation`、`allow-top-navigation-by-user-activation`、`allow-popups-to-escape-sandbox`
### 9.3 Permissions Policy 白名單
\*\*允許\*\*：`accelerometer`、`gyroscope`、`autoplay`
\*\*禁止\*\*：`camera`、`microphone`、`clipboard-write`、`clipboard-read`、`geolocation`、`payment`
### 9.4 CSP
所有活動皆為本地載入，預設 CSP：`connect-src 'none'` 阻斷外部網路。
### 9.5 通訊安全
- MUST 使用 MessageChannel（非 `postMessage("\*")`）
- 每個活動獨立 MessageChannel，活動間不能互通
- Handshake 的 `postMessage` 僅傳遞 port，不攜帶敏感資料
### 9.6 資源耗盡防護
- ZIP bomb：解壓前檢查 size（200MB/活動，500MB/總計）
- Watchdog：30 秒未 `ready` → 終止 WebView，顯示 poster
- 記憶體壓力 → 銷毀非可視活動
- Storage 配額建議 5MB
- 同頁 active 活動：mobile ≤ 1，desktop ≤ 2
### 9.7 錯誤處理
| 錯誤 | 行為 |
|---|---|
| manifest.json 缺失/無效 | 記錄警告，以 content.json 屬性為準 |
| config 不符 schema | 記錄警告，原樣注入 |
| index.html 缺失 | 顯示 poster + 錯誤提示 |
| ZIP 解壓失敗 | 顯示 poster + 錯誤提示 |
| olf-asset:// 資源不存在 | 替換為空字串，記錄警告 |
| WebView 建立失敗 | 顯示 poster + 裝置不支援提示 |
---
## 10. 效能需求與策略
### 10.1 載入行為
| 值 | 行為 |
|---|---|
| `"on-demand"`（預設） | 顯示 poster，使用者點擊後才載入 |
| `"eager"` | 翻頁即開始載入（背景執行緒） |
### 10.2 解壓策略
- MUST 延遲解壓（僅解壓當前需要的活動）
- MUST 背景執行緒（不阻塞 UI）
- 解壓 buffer ≥ 64KB
- 超過 2 秒 SHOULD 顯示進度
### 10.3 WebView 生命週期
- SHOULD 維護 WebView pool
- 離開頁面 → 銷毀或導航至 `about:blank`
- 活動載入期間 MUST 顯示 poster + loading indicator
- 30 秒 timeout → 終止 + 重試按鈕
### 10.4 快取
- Cache key = activity UUID + CRC32
- LRU 上限 200MB
- OLF 關閉或 app 結束時失效
---
## 11. Quiz 測驗擴展
本章定義 `category: "Activity\_HTML\_QUIZ"` 的專用結構。Quiz 使用標準 `html-activity` 機制，題目資料放在 `config` 中注入為 `window.gameConfig`。
### 11.1 使用場景
教師大屏投影，教師操作翻頁和公布答案，學生看大屏幕。暫不考慮學生端。
### 11.2 Quiz config 結構
```json
{
"html-activity": {
"category": "Activity\_HTML\_QUIZ",
"source": "html-activities/{id}/index.html",
"poster": "quiz-assets/{id}/quiz-preview.png",
"load-behavior": "eager",
"sandbox": "allow-scripts",
"is-locked": true,
"config": {
"version": "1.0",
"title": "水循環 — 第三章複習",
"instruction": "老師會逐題公布題目。",
"current-index": 0,
"items": [
{ "quiz-item": { } }
]
}
}
}
```
\*\*config 屬性：\*\*
| 屬性 | 類型 | 必填 | 說明 |
|---|---|---|---|
| \*\*version\*\* | `string` | Yes | Quiz 資料版本（`"1.0"`） |
| \*\*title\*\* | `string` | No | Quiz 標題 |
| \*\*instruction\*\* | `string` | No | 說明文字 |
| \*\*current-index\*\* | `integer` | Yes | 目前顯示的題目索引（0-based） |
| \*\*items\*\* | `array` | Yes | 題目列表 `{ "quiz-item": { ... } }` |
### 11.3 quiz-item 題目結構
```json
{
"quiz-item": {
"id": "q1-uuid",
"sequence": 1,
"item-body": "太陽系中最大的行星是什麼？",
"image": "olf-asset://quiz-assets/{quiz-id}/solar\_system.png",
"image-mime-type": "image/png",
"answer-revealed": false,
"answer-feedback": "木星是太陽系最大的行星。",
"interaction": { }
}
}
```
| 屬性 | 類型 | 必填 | 說明 |
|---|---|---|---|
| \*\*id\*\* | `string` | Yes | UUID |
| \*\*sequence\*\* | `integer` | Yes | 1-based 顯示順序 |
| \*\*item-body\*\* | `string` | Yes | 題目文字 |
| \*\*image\*\* | `string` | No | 題目圖片 `olf-asset://quiz-assets/{id}/...` 或 `null` |
| \*\*image-mime-type\*\* | `string` | No | `image` 有值時必填 |
| \*\*answer-revealed\*\* | `boolean` | Yes | 該題答案是否已公布 |
| \*\*answer-feedback\*\* | `string` | No | 答案解析 |
| \*\*interaction\*\* | `object` | Yes | 題型資料（§11.4） |
### 11.4 四種 Interaction 類型
#### 11.4.1 單選題（single-choice）
Renderer 渲染為 radio button。恰好一個 `is-answer: true`。
```json
"interaction": {
"type": "single-choice",
"shuffle-options": false,
"options": [
{ "option": { "id": "uuid", "label": "A", "text": "選項文字", "image": null, "is-answer": true } },
{ "option": { "id": "uuid", "label": "B", "text": "選項文字", "image": null, "is-answer": false } }
]
}
```
#### 11.4.2 多選題（multiple-choice）
Renderer 渲染為 checkbox。一個以上 `is-answer: true`。
```json
"interaction": {
"type": "multiple-choice",
"shuffle-options": false,
"min-selections": 1,
"max-selections": 4,
"options": [ /\* 同 single-choice 結構 \*/ ]
}
```
#### 11.4.3 是非題（true-or-false）
```json
"interaction": {
"type": "true-or-false",
"first-label": "對",
"last-label": "錯",
"correct-response": "true"
}
```
#### 11.4.4 簡答題（short-answer）
```json
"interaction": {
"type": "short-answer",
"correct-response": "光合作用",
"case-sensitive": false,
"accepted-responses": ["光合作用", "photosynthesis"],
"max-length": 100,
"placeholder": "請輸入答案..."
}
```
#### 11.4.5 題型比較
| | 單選題 | 多選題 | 是非題 | 簡答題 |
|---|---|---|---|---|
| `type` | `single-choice` | `multiple-choice` | `true-or-false` | `short-answer` |
| 渲染 | Radio button | Checkbox | 兩個按鈕 | 文字輸入框 |
| 正確答案 | `is-answer`（1 個） | `is-answer`（1+） | `correct-response` | `correct-response` + `accepted-responses` |
| 圖片選項 | Yes | Yes | No | No |
### 11.5 答案公布機制（翻頁卡片模式）
Quiz 以\*\*卡片翻頁\*\*方式呈現，一次只顯示一題，底部有操作列。
```
┌──────────────────────────────────────────────┐
│ ☑ Multiple Choice [Single Answer] │
│ │
│ 題目文字... │
│ │
│ ┌─ A ─────────────┐ ┌─ B ─────────────┐ │
│ │ 選項 A 文字 │ │ 選項 B 文字 │ │
│ └─────────────────┘ └─────────────────┘ │
│ ┌─ C ─────────────┐ ┌─ D ─────────────┐ │
│ │ 選項 C 文字 │ │ 選項 D 文字 │ │
│ └─────────────────┘ └─────────────────┘ │
│ │
│ [Answer] [Edit] [Delete] < 2/3 > │
└──────────────────────────────────────────────┘
```
\*\*操作列：\*\*
| 按鈕 | 說明 |
|---|---|
| \*\*Answer\*\* | 公布當前題目答案。`answer-revealed = true` 後變為不可用 |
| \*\*Edit\*\* | 發送 `editRequest` 給 Host，開啟編輯 UI |
| \*\*Delete\*\* | 發送 `deleteRequest` 給 Host，確認後 `updateConfig` |
| \*\*< >\*\* | 翻頁。教師可自由前後翻閱 |
\*\*答案公布視覺效果：\*\*
| 題型 | 效果 |
|---|---|
| 單選/多選 | 正確選項高亮（綠色），錯誤選項灰化 |
| 是非題 | 正確選項高亮 |
| 簡答題 | 顯示標準答案文字 |
| 所有題型 | 若有 `answer-feedback`，顯示解析 |
\*\*持久化（Host 回寫 config）：\*\*
| 事件 | Host 回寫 |
|---|---|
| `navigate` | `config.current-index` |
| `answerRevealed` | `config.items[N].quiz-item.answer-revealed` |
| 編輯完成 | `config.items`（整個列表） |
### 11.6 Quiz 資料匯入
教師可用簡化 JSON 格式準備題目，匯入 OLF 編輯器後自動轉換：
\*\*簡化匯入格式：\*\*
```json
{
"quiz": {
"title": "水循環複習",
"items": [
{
"type": "single-choice",
"question": "蒸發是什麼過程？",
"options": [
{ "text": "凝結", "correct": false },
{ "text": "蒸發", "correct": true }
],
"feedback": "蒸發是液態水轉為水蒸氣的過程。"
},
{
"type": "true-or-false",
"question": "雲是由水蒸氣凝結形成的。",
"answer": true
}
]
}
}
```
\*\*匯入轉換：\*\*
| 步驟 | 說明 |
|---|---|
| 產生 UUID | html-activity、quiz-item、option 各自產生 |
| 建立 html-activity | `category: "Activity\_HTML\_QUIZ"`，題目放入 config |
| 圖片處理 | 複製到 `quiz-assets/{id}/`，路徑改為 `olf-asset://` |
| 綁定 Quiz HTML | `html-activities/{id}/` 放入 standalone `index.html` + `manifest.json` |
| 初始狀態 | `current-index = 0`，`answer-revealed = false` |
---
## 12. 跨平台實作指引
### 12.1 Web（React + iframe + Blob URL + MessageChannel）
#### 載入方式
| 方式 | 適用情境 |
|---|---|
| \*\*Blob URL + iframe\*\* | Standalone 單一 HTML（唯一方式） |
#### React 元件：HtmlActivityPlayer
```tsx
function buildInjectionScript(config, elementId, locale) {
const configJson = JSON.stringify(config || {});
const idJson = JSON.stringify(elementId);
const localeJson = JSON.stringify(locale);
return `<script>
window.gameConfig = ${configJson};
window.\_\_olf = {
elementId: ${idJson},
version: "1.0",
locale: ${localeJson},
online: navigator.onLine,
\_port: null,
\_pendingCallback: null,
sendMessage: function(type, data) {
if (!this.\_port) return;
this.\_port.postMessage({
source: "olf-activity", elementId: this.elementId,
type: type, data: data
});
},
onMessage: function(callback) {
if (this.\_port) {
this.\_port.onmessage = function(e) { callback(e.data); };
} else { this.\_pendingCallback = callback; }
}
};
window.addEventListener("message", function handler(e) {
if (e.data && e.data.source === "olf-handshake" && e.ports[0]) {
window.\_\_olf.\_port = e.ports[0];
if (window.\_\_olf.\_pendingCallback) {
window.\_\_olf.\_port.onmessage = function(ev) {
window.\_\_olf.\_pendingCallback(ev.data);
};
}
window.removeEventListener("message", handler);
}
});
<\/script>
<meta http-equiv="Content-Security-Policy"
content="default-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data:; connect-src 'none';">`;
}
```
\*\*載入流程\*\*：
1. 建構注入腳本（`buildInjectionScript`）
2. 改寫 HTML prepend 注入腳本
3. 建立 Blob URL → `<iframe src={blobUrl}>`
4. iframe onLoad → 建立 MessageChannel → handshake
5. 監聽 Activity 事件（ready、navigate、answerRevealed 等）
6. 30 秒 watchdog
#### 頁面整合流程
三階段：\*\*選擇檔案 → 編輯 gameConfig → 載入活動\*\*
- 使用者選擇 `.olf` 或 `.html` 檔案
- 系統抽取 `window.gameConfig`，以 JSON 編輯器顯示
- 使用者可修改後載入，可隨時返回編輯重新載入
### 12.2 Windows（WebView2 / C#）
- UUID 格式驗證
- 背景執行緒解壓（64KB buffer）
- `AddScriptToExecuteOnDocumentCreatedAsync` 注入 config
- `SetVirtualHostNameToFolderMapping` 映射活動目錄
- `WebMessageReceived` 監聽事件
- 30 秒 watchdog
### 12.3 Flutter（InAppWebView / Dart）
- `compute()` 背景解壓
- `UserScript` + `AT\_DOCUMENT\_START` 注入
- `shouldInterceptRequest` 網路控制
- `addJavaScriptHandler` 雙向通訊
- `FutureBuilder` loading 狀態 + poster
---
## 13. 向後相容性
| 情境 | 行為 |
|---|---|
| 舊版 Renderer 遇到 `activities[]` | 忽略未知欄位，正常顯示其他元素 |
| 舊版 Renderer 遇到 `Activity\_HTML\_QUIZ` | 視為一般 `html-activity`，WebView 正常渲染（功能完整，Host 不處理 Quiz 專屬事件） |
| 不支援 WebView 的平台 | 顯示 `poster` 預覽圖 |
| 舊版 Renderer 遇到 `quiz-assets/` | 忽略未預期的資料夾 |
---
## 14. 完整範例
### 範例 A：PhET 模擬器（本地，無 config）
```json
{
"html-activity": {
"id": "b7e3f1a2-9c84-4d56-8e12-a3f567890abc",
"x": 160, "y": 100, "width": 1600, "height": 900,
"matrix": "1,0,0,0,1,0,0,0,1",
"category": "Activity\_HTML\_PHET",
"source": "html-activities/b7e3f1a2-9c84-4d56-8e12-a3f567890abc/index.html",
"poster": "images/phet-energy-preview.png",
"load-behavior": "on-demand",
"sandbox": "allow-scripts",
"is-locked": true
}
}
```
### 範例 B：Jeopardy 遊戲（本地，帶 config）
```json
{
"html-activity": {
"id": "f2a3b4c5-d6e7-4f89-0a12-b3c4d5e6f789",
"x": 0, "y": 0, "width": 1920, "height": 1080,
"matrix": "1,0,0,0,1,0,0,0,1",
"category": "Activity\_HTML\_GAME",
"source": "html-activities/f2a3b4c5-d6e7-4f89-0a12-b3c4d5e6f789/index.html",
"locale": "zh-TW",
"config": {
"strings": { "startTitle": "JEOPARDY", "scoresTitle": "排行榜" },
"settings": { "questionCountdownEnabled": true, "questionCountDownSeconds": 3 },
"players": [
{ "id": 1, "name": "第一組", "score": 0 },
{ "id": 2, "name": "第二組", "score": 0 }
],
"questions": [
{
"category": "React 基礎",
"questions": [
{ "points": 100, "question": "管理組件狀態的 Hook？", "answer": "useState", "options": ["useState", "useEffect", "useMemo"] }
]
}
]
},
"poster": "images/jeopardy-preview.png",
"load-behavior": "eager",
"sandbox": "allow-scripts",
"is-locked": true
}
}
```
### 範例 C：Quiz 測驗（本地，混合題型）
```json
{
"html-activity": {
"id": "f7a2b3c4-d5e6-4f70-8a9b-c0d1e2f34567",
"x": 40, "y": 40, "width": 1200, "height": 640,
"matrix": "1,0,0,0,1,0,0,0,1",
"category": "Activity\_HTML\_QUIZ",
"source": "html-activities/f7a2b3c4-d5e6-4f70-8a9b-c0d1e2f34567/index.html",
"poster": "quiz-assets/f7a2b3c4-d5e6-4f70-8a9b-c0d1e2f34567/quiz-preview.png",
"load-behavior": "eager",
"sandbox": "allow-scripts",
"is-locked": true,
"config": {
"version": "1.0",
"title": "水循環 — 第三章複習",
"instruction": "老師會逐題公布題目。",
"current-index": 0,
"items": [
{
"quiz-item": {
"id": "q1-uuid", "sequence": 1,
"item-body": "將液態水轉為水蒸氣的過程叫什麼？",
"image": null, "answer-revealed": false,
"answer-feedback": "蒸發是太陽熱能將水分子提升至大氣的過程。",
"interaction": {
"type": "single-choice",
"shuffle-options": false,
"options": [
{ "option": { "id": "o1", "label": "A", "text": "凝結", "image": null, "is-answer": false } },
{ "option": { "id": "o2", "label": "B", "text": "蒸發", "image": null, "is-answer": true } },
{ "option": { "id": "o3", "label": "C", "text": "降水", "image": null, "is-answer": false } },
{ "option": { "id": "o4", "label": "D", "text": "蒸散", "image": null, "is-answer": false } }
]
}
}
},
{
"quiz-item": {
"id": "q2-uuid", "sequence": 2,
"item-body": "觀察下圖，哪些階段涉及水向上移動？（複選）",
"image": "olf-asset://quiz-assets/f7a2b3c4-d5e6-4f70-8a9b-c0d1e2f34567/water\_cycle.png",
"image-mime-type": "image/png",
"answer-revealed": false,
"interaction": {
"type": "multiple-choice",
"shuffle-options": false,
"min-selections": 1, "max-selections": 4,
"options": [
{ "option": { "id": "o5", "label": "A", "text": "蒸發", "image": null, "is-answer": true } },
{ "option": { "id": "o6", "label": "B", "text": "凝結", "image": null, "is-answer": false } },
{ "option": { "id": "o7", "label": "C", "text": "蒸散", "image": null, "is-answer": true } },
{ "option": { "id": "o8", "label": "D", "text": "逕流", "image": null, "is-answer": false } }
]
}
}
},
{
"quiz-item": {
"id": "q3-uuid", "sequence": 3,
"item-body": "雲是由水蒸氣凝結形成的。",
"image": null, "answer-revealed": false,
"interaction": {
"type": "true-or-false",
"first-label": "對", "last-label": "錯",
"correct-response": "true"
}
}
},
{
"quiz-item": {
"id": "q4-uuid", "sequence": 4,
"item-body": "植物透過葉片釋放水蒸氣的過程稱為？",
"image": null, "answer-revealed": false,
"interaction": {
"type": "short-answer",
"correct-response": "蒸散作用",
"case-sensitive": false,
"accepted-responses": ["蒸散作用", "蒸散", "transpiration"],
"max-length": 60,
"placeholder": "請輸入過程名稱..."
}
}
}
]
}
}
}
```
---
## 15. 驗證計畫
### 測試矩陣
| # | 活動 | Category | config | 驗證重點 |
|---|---|---|---|---|
| 1 | PhET Energy Skate Park | `PHET` | 無 | 大型 standalone HTML、poster、sandbox、CSP |
| 2 | PhET Wave on a String | `PHET` | 無 | 另一 PhET 模擬器驗證 |
| 3 | Jeopardy 問答 | `GAME` | 有（strings/questions） | gameConfig 注入、遊戲遷移（base64→bundle） |
| 4 | 配對遊戲 | `GAME` | 有 | MessageChannel 通訊、olf-asset:// |
| 5 | \*\*Quiz 水循環測驗\*\* | \*\*`QUIZ`\*\* | 有（quiz-item × 4 型） | \*\*翻頁卡片、Answer 公布、Edit/Delete 通訊、quiz-assets 圖片引用\*\* |
### 安全驗證
| 測試 | 預期 |
|---|---|
| id 含特殊字元 | 拒絕載入 |
| sandbox `allow-same-origin` | 自動剝除 |
| config 路徑穿越 `../../../` | 驗證失敗 |
| ZIP 含 `../../evil.js` | 拒絕整個 OLF |
| 活動 `fetch("https://evil.com")` | CSP 阻擋 |
### Quiz 專項驗證
| 測試 | 預期 |
|---|---|
| 翻頁 `< >` | `navigate` 事件送到 Host，`current-index` 更新 |
| 點擊 Answer | 正確選項高亮 + 解析顯示，`answerRevealed` 事件送到 Host |
| 點擊 Edit | `editRequest` 事件送到 Host，Host 開啟編輯 UI |
| `updateConfig` 後 | Quiz HTML 重新渲染修改後的題目 |
| 4 種混合題型 | 各題型正確渲染和公布 |
| quiz-assets 圖片 | `olf-asset://quiz-assets/{id}/...` 正確解析為可用 URL |
---
## 16. 需修改的檔案清單
| 檔案 | 修改內容 |
|---|---|
| `OpenLearningFormat\_Spec.md` | 新增 html-activity 定義、activities 陣列、quiz-assets 資料夾 |
| `OLF\_Appendix.md` | 新增完整屬性表、quiz-item schema、olf-asset:// 協議 |
| `libolf/documentation/mvb.schema\_element.json` | 新增 html-activity JSON Schema |
| `libolf/documentation/mvb.schema.json` | page 新增 activities 陣列 |
| `libolf/myviewboard-mvbfile/src/MVBContent\_impl.cpp` | 解壓 buffer 64KB、Zip Slip 防護 |
---
## 整合一致性驗證
以下確認兩份規格合併後無衝突：
### 機制一致性
| 機制 | 遊戲/模擬器 | Quiz | 一致？ |
|---|---|---|---|
| 元素類型 | `html-activity` | `html-activity`（category 區分） | ✅ |
| Config 注入 | `window.gameConfig` | `window.gameConfig`（含 quiz-item） | ✅ |
| 橋接物件 | `window.\_\_olf` | `window.\_\_olf` | ✅ |
| 通訊管道 | MessageChannel | MessageChannel | ✅ |
| 訊息格式 | `source: "olf-activity"` / `"olf-host"` | 相同格式 | ✅ |
| ready handshake | Activity → Host `ready` | 相同 | ✅ |
| 圖片引用 | `olf-asset://images/...` | `olf-asset://quiz-assets/{id}/...` | ✅（同協議，不同路徑） |
| Sandbox/CSP | §9.2-9.4 | 沿用 | ✅ |
| Blob URL 載入 | §12.1 | 沿用 | ✅ |
### 訊息命名空間
| 訊息 | 範圍 | 衝突？ |
|---|---|---|
| `ready` | 所有活動 | ✅ 通用 |
| `updateConfig` | 所有活動 | ✅ 通用 |
| `updateLocale` | 所有活動 | ✅ 通用 |
| `score` / `completion` | 遊戲專用 | ✅ 不衝突（Quiz 不使用） |
| `navigate` / `answerRevealed` / `editRequest` / `deleteRequest` | Quiz 專用 | ✅ 不衝突（遊戲不使用） |
| `revealAnswer`（Host→Activity） | Quiz 專用 | ✅ 不衝突 |
### olf-asset:// 路徑命名空間
| 路徑前綴 | 用途 | 衝突？ |
|---|---|---|
| `olf-asset://images/` | OLF 共用圖片 | ✅ |
| `olf-asset://quiz-assets/{id}/` | Quiz 專用素材 | ✅ 不衝突（獨立資料夾） |
| `olf-asset://additional/` | 附加資源 | ✅ |
### ZIP 資料夾命名空間
| 資料夾 | 用途 | 衝突？ |
|---|---|---|
| `html-activities/` | Standalone HTML + manifest.json | ✅ |
| `quiz-assets/` | Quiz 圖片素材 | ✅ 不衝突（獨立資料夾） |
| `images/` | OLF 共用圖片 | ✅ 不衝突 |
\*\*結論：兩份規格在機制、訊息、路徑、資料夾命名上無任何衝突，可安全整合。\*\*
false30000Markdowndefault0e65e300-700d-49d4-852a-12c327c065c0