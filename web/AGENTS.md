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

其他已經定下來的：

- **icon 用 `components/Icon.tsx` 的 inline SVG，不要用 emoji**
  （emoji 跨平台大小與基線不一致，也不吃 `currentColor`）。
- **琥珀色只給警告**。pin／保護狀態用中性灰底，含意交給圖示。
- **版面不要因為切分頁、開面板而位移**：條件出現的控制項不要放在共用的
  篩選列裡；側邊面板用浮動抽屜而不是 flex 兄弟。
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

## 新增巢狀 API route 後 Turbopack 可能不認得

新建 `app/api/x/y/route.ts` 之後打它回 **404**，不是程式寫錯：
`touch` 那個檔案讓它重編就好。看到新路由 404 先想這件事，不要回頭懷疑程式碼。

## 要接新的「定時服務」

一律照現有那套，不要各寫一套（Jay 2026-09-11 指定）：

- **排程掛在 web server 裡**（`instrumentation.ts` 的 `register()`），設定存
  `data/local-state/`，所以 server 重開會自己接回去；timer 存在 `globalThis`，
  否則 dev 模式的 HMR 會留下孤兒 interval。
- **健康度**照 `lib/health.ts` 檔頭的三步驟接上；判準留在 `lib/healthRules.ts`：
  認證類錯誤第一次就在首頁示警（不會自己好），其餘連續 3 次才示警。
- **重活（整份重抓）只在夜間窗口做，而且過了不補** —— 見 `scripts/vb-bugs.py`
  的 `should_full_sync`。時區固定台北，不跟機器時區走。
- 開頁面時可以順手在背景更新，但要有最小間隔，別讓連續重整變成連續打對方 API。
<!-- END:km-ui-rules -->
