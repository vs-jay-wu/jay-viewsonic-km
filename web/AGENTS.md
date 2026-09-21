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
