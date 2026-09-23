# 機敏檔案保護規則

## .env

`.env` 存有 API token 等機敏資訊。

- **禁止**顯示其內容（不可使用 Read、cat 等方式輸出給使用者）
- **允許**在 scripts 或工具中使用（載入環境變數等操作）
- 若使用者要求查看，應說明內容為機敏資訊，無法顯示，並引導至 `.env.example` 確認需要哪些欄位

---

## 這條規則真正在防的是「內容進到對話記錄」

上面那條的理由不是「Jay 不該看自己的 token」——他當然可以，他在 VS Code 就是這樣看的。
**要防的是內容流進 transcript**：那會被送到模型端、可能被引用進 commit 訊息、PR 描述、
或下一輪的 context，而且事後無法回收。

所以界線是「內容有沒有經過 agent」，不是「有沒有被顯示」：

| | 可以嗎 |
|---|---|
| 使用者在 km web 上按一下，內容從磁碟到他的瀏覽器 | ✅ 可以（2026-09-23 起） |
| agent 用 Read／cat／grep 把內容讀出來 | ❌ 不行 |
| agent 呼叫 `/api/code/file?reveal=…` | ❌ 不行 |
| agent 對已經解鎖的畫面截圖或抓 DOM 文字 | ❌ 不行 —— 這條最容易不小心犯 |

最後一條是實際存在的破口：用瀏覽器工具看畫面是常態操作，若使用者剛好把 `.env` 展開著，
`take_screenshot` 或 `evaluate_script` 讀 `innerText` 就會把 token 帶進 context，**而且沒有任何徵兆**。
看 `/code` 的畫面前先想一下現在開的是什麼檔。

### 例外：遮罩過的內容

`reveal=masked` 的輸出把**值**換成 `••••`、只留欄位名與註解。欄位名不機敏
（`.env.example` 本來就公開列著），所以那種輸出進到 context 沒有問題。
需要確認「有沒有某個欄位」時用它，不要用 `full`。

## km web 的實作（`/code`）

- 預設仍然不顯示。要內容必須帶明確的 `?reveal=full`／`?reveal=masked`，
  **沒帶就跟以前一樣擋掉** —— 這樣「誰解鎖了」在程式與 log 裡都 grep 得到。
- 遮罩在 **server 端**做。前端拿到全文再遮的話，值還在回應裡，開 DevTools 就看得到。
- 解鎖**不記住**：換檔案、重整都回到遮蔽態。
- 明碼**60 秒後自動收回**成遮罩態（`REVEAL_TTL_MS`），畫面上有倒數。
  這一層是刻意**不依賴任何人守規矩**的：上面那條「agent 不得對已解鎖的畫面截圖」
  只對讀到這份規則的 agent 有效，沒載入到、或換成別的工具在跑就擋不住。
  自動收回讓「剛好被看到」的窗口從無限變成一分鐘。
- 畫面上解鎖態有明顯標記（提醒正在分享螢幕時別開著）。

判準寫在 `web/lib/codeBrowseRules.ts`（`isSensitivePath` / `isHardBlocked` /
`isRevealable` / `maskEnvValues`，都有測試）。

## 三層，不是兩層

| 類別 | 行為 | 為什麼 |
|---|---|---|
| `excluded` 的 keystore 目錄（`mvbf_keystore` / `playstore_keystore`） | **不管帶什麼參數都擋** | [`excluded-dirs.md`](excluded-dirs.md) 寫的是「禁止讀取」，比「預設不顯示」更強 |
| 二進位（`.jks` / `.keystore` / `.p12`…） | 顯示「二進位檔」，不給解鎖按鈕 | 解鎖出來只是亂碼 |
| 文字型機敏檔（`.env`、`key.properties`、`keystore.properties`、`google-services.json`、firebase service account） | 預設遮蔽，可以按一下解鎖 | 這些是真的會想看的東西 |

⚠️ **第二層不要寫成「受保護，一律不顯示」**：那把原因講錯了（真正的理由是二進位），
而且看起來像功能壞了。2026-09-23 第一版就是那樣寫的，Jay 點 `MVBA_PlatForm.jks`
時回報「沒有生效耶？」。

⚠️ **同一種東西在不同 repo 可能叫不同名字。** 簽章密碼檔在 mvbf 叫 `key.properties`、
在 ragdoll-cat 叫 `keystore.properties` —— 第一版只列了前者，後者**完全沒擋**
（實測 695 bytes 直接讀得到）。加這類名單時，每個 repo 都去查一次它叫什麼。

## 不加密的理由

本機 localhost、同一台機器、同一個使用者。要加密就得把金鑰從同一條通道送過去，
等於鎖和鑰匙一起寄。真正有效的是降低「不小心曝光」的機會（預設遮蔽、明確解鎖、
不記住、畫面標記），那些都在上面。
