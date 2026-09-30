<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:km-ui-rules -->
# 這個 web 的 UI 慣例

**不要用瀏覽器內建的 `confirm()` / `alert()` / `prompt()`。**
樣式不受控、擋住整個分頁、也沒辦法讓 Enter 直接確認（Jay 2026-09-11 定的規則，
範圍是這個 km repo 的所有介面）。

要跟使用者確認就用 `components/Confirm.tsx`：

```tsx
const confirm = useConfirm();
if (!(await confirm({ title: "刪掉這筆？", message: "無法復原。", danger: true }))) return;
```

回傳值跟 `confirm()` 一樣是布林，所以取代既有呼叫不必改控制流。
鍵盤是 **Enter 確認、Esc 取消**，開啟時焦點就在確認鈕上。

## 顏色一律用語意 token，不要寫死 Tailwind 色階

2026-09-22 起這個 app 有 dark / light / system 三態，顏色全部走 `app/globals.css`
定義的語意 token（`bg-surface`、`text-fg-muted`、`border-line`、`text-warn`…），
**新程式碼不要再寫 `text-gray-500` / `bg-white` 這種**。色碼依主題在 globals.css
翻，那裡也寫了每個 token 的語意 —— 挑錯 token 比挑錯色碼難發現，所以先讀那段。

### ⚠️ 坐在「固定背景」上的東西不可以用會翻色的 token

這是做深色模式時實際誤傷的地方：側邊欄是固定深底（`bg-[#2d2d2d]`，兩個主題都一樣），
它上面的 `text-white` 被機械換成 token 之後，深色主題下 token 翻成近黑色，**整欄的字
幾乎消失**。畫面上沒有任何錯誤，只是看不清楚。

**判準**：問「這個元素的背景會不會跟著主題變？」

| 背景 | 上面的顏色 |
|---|---|
| 走 token（`bg-surface` / `bg-surface-raised`…） | 也走 token |
| **寫死的**（`bg-[#2d2d2d]`、疊在圖片上、terminal 區塊） | **寫死**，或用專屬 token（`--term` / `--term-fg` 就是為此而設） |

目前屬於後者的：`components/Sidebar.tsx`（檔頭有但書）、`ImageDiffView` 疊在圖片上的
控制項、modal 遮罩 `bg-black/50`、以及 diff 與程式碼檢視自己 `dark` prop 控制的那組。

另外 `hover:bg-black` 這種也不行 —— 深色下 hover 會變成純黑，等於消失。

### `fg-disabled` 只給真正停用的東西

**「看起來比較淡」不是挑它的理由。** 深色下它是 `#52525b`，在多數底色上
**連 3.0 都不到**；要「低調但看得見」請用 `fg-muted`（次要文字）或
`fg-subtle`（更次要）。

這條是 2026-09-23 一天內連犯三次才寫下來的：

| 犯在哪 | 對比 | 表現 |
|---|---|---|
| diff 的內文（深色） | 2.60 | 只剩被語法上色的 token 看得到，其餘像糊掉 |
| 程式碼檢視的內文（深色） | 2.60 | 同上，而且修 diff 那次漏掉這一支 |
| session 清單的單狀態點 | 1.89 | 那個點根本看不見 |

**判準**：這個東西使用者要不要看得到？要 → 不能用 `fg-disabled`。
`disabled` 講的是「這個控制項現在不能按」，不是「這段字比較不重要」。

### 驗證用算的，不要用看的

對比門檻：內文 AA 4.5、次要文字 3.0。**兩個主題各算一次**，不是只看深色 ——
2026-09-22 量出來反而是淺色有兩個 token 不達標（`fg-subtle` 2.54、`pin` 2.15），
都是既有顏色，量了才發現。

整頁掃描的做法（會抓到「字跟背景幾乎同色」這一類）：走訪所有葉節點文字，**用 canvas
讓瀏覽器把顏色解析成 sRGB** 再算對比。不要自己 parse `getComputedStyle().color`：
Tailwind v4 對帶透明度的顏色吐 `oklab()`，當成 RGB 解析會得到完全錯誤的數字
（白字被算成 1.52，而且看起來很像真的）。

⚠️ **判斷「看得見」用 `getClientRects().length`，不要用 `offsetParent`** ——
`position: fixed` 的元素 `offsetParent` 是 `null`，掃描會**整個跳過浮動面板**
而且不會報錯。2026-09-23 掃 session 的對話紀錄時就是這樣：掃到 114 個文字節點、
回報「只有 5 個不達標」，換掉判斷後是 259 個、109 個不達標，最差的 1.12。
**掃描器掃不到東西時，先懷疑掃描器。**

---

其他已經定下來的：

- **icon 用 `components/Icon.tsx` 的 inline SVG，不要用 emoji**
  （emoji 跨平台大小與基線不一致，也不吃 `currentColor`）。
- **琥珀色只給警告**（token 是 `--warn`）。pin 與「部分 staged」這類**分類**用途
  另有 `--pin` / `--info`，刻意跟語意色分開 —— 併進 `--warn` 的話，
  「琥珀色只給警告」這條就沒辦法用 grep 查了。
- **版面不要因為切分頁、開面板而位移**：條件出現的控制項不要放在共用的
  篩選列裡；側邊面板用浮動抽屜而不是 flex 兄弟。
- **worktree 的標記一律用 `components/WorktreeBadge.tsx`**（Jay 2026-09-21）——
  分支岔出去那個圖示，一般的用中性灰、session 綁的用琥珀色（它會跟著 session 消失，
  是真的警告）。`/changes`／`/git`／`/code`／`/work` 曾經各畫各的（「wt」「worktree」
  紫色藥丸各種版本），新的頁面直接用這顆，不要再自己拼一個。
- **只有圖示的按鈕一定要包 `components/Tooltip.tsx`** —— 原生 `title` 要停留快一秒
  才出現，隔幾個月回來會看不出那顆按鈕會做什麼。
- 確認對話框**不要**在畫面上標示「Enter 確認 · Esc 取消」（行為留著就好）。

# 這個 web 的工程慣例

## 純規則要跟碰檔案的程式分開

客戶端元件一旦 import 到帶 `fs/promises` 的模組，**整頁會編不起來**
（`Module not found: Can't resolve 'fs/promises'`）。這個坑踩過兩次，
所以判斷邏輯都拆成不碰檔案系統的獨立檔，兩側共用：

| 碰檔案的 | 純規則（客戶端也能用） |
|---|---|
| `lib/sessions.ts` | `lib/sessionRules.ts` |
| `lib/vbBugs.ts` | `lib/vbBugsRules.ts` |
| `lib/health.ts` | `lib/healthRules.ts` |

純規則檔也是**測試的落點**（`npm test`）—— 判準會變，要有東西守著。

## repo 在網址上用「身分」，不是絕對路徑

`/repo/code?repo=Viewsonic-EDU/ragdoll-cat`、`/code-view/<base64 的身分>/…`。
**不要**再把絕對路徑放進網址或狀態檔的 key。

為什麼：絕對路徑在另一台機器上**可能也解析得開**（兩台的使用者短名相同），
於是把連結貼過去會正常打開、但顯示的是那台的磁碟，**沒有任何錯誤訊息**。

- 身分 ↔ 絕對路徑的轉換：`lib/repoRefRules.ts`（純規則）＋ `lib/repoRef.ts`（讀設定）
- server 端用 `repoDirFromParams()` 收參數；頁面用 `lib/repoPageParams.ts` 在
  **server component** 解析好再傳給 client（讓 client 拿 repo 清單去比對的話，
  清單載入前會先閃一下「選一個 repo」）
- API 內部互相呼叫仍然可以用 `dir=`（同一台機器、當場產生的），但**網址不行**
- `?dir=` 還收，那是過渡期。satellite 一上線就拿掉

## km web 跑在 **port 9487**，不是 3000

`npm run dev` 與 `npm run start` 都寫死 `--port 9487`（`package.json`），
launchd 的安裝腳本預設也是它。**不要改回 3000** —— 有些專案 repo 的登入／驗證
回呼寫死 3000，km 佔著那個 port 會害它們跑不起來（Jay 2026-09-24）。

所以文件、指令、探針裡的網址一律 `http://localhost:9487`。

## ⚠️ dev server 開著時，不要對同一個 `.next` 跑 build

`npm run build` 已經改成寫到 `.next-build`（`package.json` 的 `NEXT_DIST_DIR` ＋
`next.config.ts`），**不要改回去**。這個版本的 Next 沒有 `--distDir` 這個 CLI 旗標
（實測 `unknown option`），只能從設定檔給。

共用同一個目錄時，dev server 會開始送**舊的產物**，而且沒有任何徵兆：
2026-09-23 實測，對話紀錄面板的 CSS 停在做深色模式之前的版本
（`.md-body { color: #1f2937 }`，淺色的灰畫在深色面板上，對比 **1.12**），
而 `app/globals.css` 的源碼一直是 `var(--fg)`。

**徵兆**：畫面跟源碼對不起來，但 `git status` 乾淨、`tsc` 與測試全綠。

**怎麼確認**：直接抓 dev server 送出去的那份 CSS 來看，不要只讀源碼 ——

```bash
CSS=$(curl -s http://localhost:9487/<某頁> | grep -o '/_next/static/[^"]*\.css' | head -1)
curl -s "http://localhost:9487$CSS" | grep -A 3 '^\.md-body {'
```

⚠️ **`touch` 叫不醒它**，要真的改到內容才會重編（加一行註解再刪掉即可）。
保險起見重開 dev server。

## 新增巢狀 API route 後 Turbopack 可能不認得

新建 `app/api/x/y/route.ts` 之後打它回 **404**，不是程式寫錯：
`touch` 那個檔案讓它重編就好。看到新路由 404 先想這件事，不要回頭懷疑程式碼。

## 要接新的「定時服務」

一律照現有那套，不要各寫一套（Jay 2026-09-11 指定）：

- **排程掛在 web server 裡**（`instrumentation.ts` 的 `register()`），設定存
  `data/hub/`，所以 server 重開會自己接回去；timer 存在 `globalThis`，
  否則 dev 模式的 HMR 會留下孤兒 interval。
- **健康度**照 `lib/health.ts` 檔頭的三步驟接上；判準留在 `lib/healthRules.ts`：
  認證類錯誤第一次就在首頁示警（不會自己好），其餘連續 3 次才示警。
- **重活（整份重抓）只在夜間窗口做，而且過了不補** —— 見 `scripts/vb-bugs.py`
  的 `should_full_sync`。時區固定台北，不跟機器時區走。
- 開頁面時可以順手在背景更新，但要有最小間隔，別讓連續重整變成連續打對方 API。
<!-- END:km-ui-rules -->

## Session 標題就是關聯的依據

Jay 的 session 命名慣例是 `[km…] 單號 描述`：開頭的方括號以 `km` 起頭即可，
**子 repo 是選填**（`[km] VB-2267 描述` 與 `[km/mvbf] VB-1945 字體` 都合法）。
web 幫你開 session 時**知道 repo 就會填成 `[km/<別名>]`**（不知道就只給 `[km]`），
但那是「盡量多給一點資訊」，**不是要求** —— 解析與關聯都不能假設那一格有東西。
**web 靠它把 session ↔ PR ↔ Jira 單串起來**（`lib/workItemRules.ts` 解析、
`lib/workIndex.ts` 建索引），所以：

- 解析不到就不連結，**不要硬湊**。這是人維護的東西，一定有不符合規則的。
- **不要拿 `[km/x]` 的 `x` 當「改動在哪個 repo」的答案**：它是選填的，很多標題只有
  `[km]`。要找改動去看分支名與 PR（`lib/workChanges.ts` 掃全工作區找分支名含票號的
  worktree，就是為了這件事）。
- 裸數字（`9208`）補 project 的規則：先比對手上已有的明確 key，同號只有一個
  候選就用它；同號撞兩個 project 就不猜；都沒有才退回 VB 並**標記成猜的**。
  UI 一定要讓人看得出那是猜的（後面加問號）——`9904` 實際上是 VSFT 不是 VB。
  等票全部搬到 VB 之後這層就會自動失效，規則不用改。
- 要開一個**已命名**的 session：`claude -p "/rename <標題>" --session-id <uuid>`
  （0 turns、$0，只建檔＋寫 custom-title），再用 Orca resume。
  Orca 的 `terminal create --title` 會被執行中的程式蓋掉，不能拿來命名。
