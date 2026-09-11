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
<!-- END:km-ui-rules -->
