# 從 Android WebView 同步登入狀態到桌面 dev picker

## 問題

桌面瀏覽器跑 `pnpm dev` 連 production API 時，picker 不知道你是誰。三種登入路徑（見 `introduce/README.md`），桌面只能走 dev fallback：

```ts
// src/hooks/convertMVBToken/useConvertMVBAppToken.ts
const ocv2TokenInfo = safelyParseJSON(sessionStorage.getItem('ocv2_token_info'));
if (ocv2TokenInfo) {
  userStore.setState({ status: UserStatus.TokenHeld, tokenInfo: ocv2TokenInfo });
}
```

`ocv2_token_info` 預期長相（OIDC token response）：

```json
{ "access_token": "...", "id_token": "...", "refresh_token": "...", "expires_in": 3600, "scope": "...", "token_type": "Bearer" }
```

README 寫的「launch local web 2.0 services → 從 console log 複製 tokenInfo」前提是有 `content-platform-web2.0` repo 並能跑起來。如果手邊只有手機上已登入的 MVB App（MVBA Android WebView），可以直接從 WebView 抽。

## 為什麼不能直接搬 storage

最初直覺：把 WebView 的 sessionStorage / localStorage / cookies 整包搬過去。**不行**，原因：

- MVBA WebView 拿到 OIDC token 後 `saveTokenInfo()` **只放記憶體（zustand store）**，預設不持久化到 IDB / localStorage。
- WebView 的 sessionStorage 沒有 `ocv2_token_info`（那是桌面 dev fallback 才用的 key）。
- 搬 cookies 也沒用 — cross-site 在 localhost 多半被 SameSite 擋掉，且 API 是 Bearer header 認證為主。

實際 storage 內容（範例）：

```
localStorage:
  vsocBrowserId
  MVB_prod_discovery_4.3.0   ← OIDC discovery doc，沒 token
  i18next_res_en-common
sessionStorage:
  journeySteps, AI_*, sentryReplaySession, vsocTabId, journeyId  ← 都是 telemetry
indexedDB: 空
```

## 對的解法：攔 `/api/v1/session/convert` 的 response

完整 auth flow：

```
Android Native (CastListPlatformView.java#getSession)
  ↓ Java @JavascriptInterface 注入
WebView JS: window.ExternalObject.getSession()  → 回傳 raw MVB session token (string)
  ↓
picker JS: convertMVBToken(sessionToken)
  ↓ POST https://auth.myviewboard.com/api/v1/session/convert
  ←  { access_token, id_token, refresh_token, expires_in, scope, token_type }
  ↓
saveTokenInfo()  → in-memory store
```

我們用 Chrome DevTools Protocol：
1. 連到 WebView 的 CDP
2. 觸發 reload，順便監聽 `Network.responseReceived` 找出 body 含 `access_token` + `id_token` 的 response（就是上面那個 convert endpoint）
3. 把整包 OIDC JSON 塞到 localhost 桌面 Chrome 的 `sessionStorage.ocv2_token_info`，reload 即登入

完整 script：`scripts/capture-token.mjs`

---

## 前置需求

- macOS（路徑寫死 Chrome 在 `/Applications/Google Chrome.app`）
- `adb`（`brew install android-platform-tools`）
- Android 裝置 USB debugging ON、MVB App 已登入、Originals Picker 已開啟（任一頁）
- App 必須是 debuggable build（release build 通常關掉 `setWebContentsDebuggingEnabled`）。本次驗證的 app package：`com.viewsonic.droid`
- 桌面 Chrome
- Node 22.12.0（要用內建 `WebSocket`）

## 操作流程

### 1. 連手機、找出 WebView debug socket

```bash
adb devices
# 應該看到一台 device

adb shell cat /proc/net/unix | grep -oE 'webview_devtools_remote_[0-9]+' | sort -u
# 列出所有開了 debug 的 WebView socket（一個 socket 對應一個 process）

# 找哪個是 MVB App
for pid in <列出來的 PID 們>; do
  echo "PID $pid:"; adb shell ps -p $pid -o NAME | tail -1
done
# 找到 com.viewsonic.droid 的 PID
```

### 2. Forward CDP 到本機 9222

```bash
adb forward tcp:9222 localabstract:webview_devtools_remote_<PID>
# 驗證
curl -s http://localhost:9222/json | jq '.[].url'
# 應該看到 https://myviewboard.com/originals/picker/...
```

### 3. 啟動獨立 Chrome（CDP 9224，獨立 profile 不影響日常使用）

```bash
mkdir -p /tmp/chrome-picker-profile
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9224 \
  --user-data-dir=/tmp/chrome-picker-profile \
  "http://localhost:3000/originals/picker/contents" &
```

### 4. 跑 capture-token script

```bash
. ~/.nvm/nvm.sh && nvm use 22.12.0
node /Users/jay.wj.wu/ProjectsWork_GitHub/jay-viewsonic-km/docs/repositories/Viewsonic-EDU/oc-portal-picker/features/webview-auth-sync/scripts/capture-token.mjs
```

### 一鍵 wrapper

上述 1-4 都可以用 `scripts/login-from-webview.sh` 包起來：

```bash
cd /Users/jay.wj.wu/ProjectsWork_GitHub/jay-viewsonic-km/docs/repositories/Viewsonic-EDU/oc-portal-picker/features/webview-auth-sync/scripts
./login-from-webview.sh
```

它會自己找 `com.viewsonic.droid` 的 PID、forward CDP、啟動獨立 Chrome（如果還沒跑）、執行 capture。前提：先把 `pnpm dev` 跑起來。

成功 output：

```
WebView page: https://myviewboard.com/originals/picker/en/resources?...
Reloading WebView to force token conversion...
Captured token-shaped response from: https://auth.myviewboard.com/api/v1/session/convert
Using OIDC response from: https://auth.myviewboard.com/api/v1/session/convert
Token fields: access_token, expires_in, id_token, refresh_token, scope, token_type
Injected ocv2_token_info into desktop and reloaded.
```

桌面 Chrome 視窗會自動 reload，顯示為已登入。

---

## Token 過期

OIDC `access_token` 預設 `expires_in: 3600` 秒（1 小時）。過期了再跑一次 `capture-token.mjs` 即可（手機 WebView 不用做事，script 會 reload 它觸發 re-convert）。

## 備用：搬 storage 的 script

`scripts/sync-webview-storage.mjs` 保留下來。它做的是傳統 storage + cookies 整包搬，**對 picker 沒用**（如上述原因），但若以後別的場景需要可以參考。

## 常見錯誤

| 症狀 | 原因 | 解 |
|---|---|---|
| `adb devices` 看不到 | USB debugging 未開、傳輸模式錯 | 開發者選項 → USB debugging；USB 模式選「檔案傳輸」或 PTP |
| `adb shell ... grep webview` 空白 | App 不是 debuggable build | 換 debug build；或在 Flutter side 確認有開 `setWebContentsDebuggingEnabled(true)` |
| `Source pages on 9222` 沒有 picker | WebView 在別的頁、或開了多個 WebView process | 在手機上把 picker 那頁滑出來；或改 PID forward |
| `did not capture any access_token-bearing response` | reload 後 convert 沒打 / 被 cache | script 已用 `ignoreCache: true`；若還是不行確認 MVB App 真的處於登入態 |
| Chrome 視窗開不起來 / port 占用 | 既有 Chrome 佔用 9224 | 改用 `--remote-debugging-port=<其他>` 並改 script 內 `DST_PORT` |
| 同步完還是 guest | `.env` 沒指 prod、或 `NEXT_PUBLIC_AUTH_ENV` 不是 `prod` | 見 `introduce/build.md` 環境檔設定 |

---

## 程式碼參考

- Picker auth dispatch：`src/hooks/convertMVBToken/useConvertMVBAppToken.ts`
- Bridge 偵測：`src/utils/browser.ts`（`isMvbApp` 判斷 `window.ExternalObject.getSession`）
- 取 MVB session token：`src/hooks/useMVBAppAccessToken.ts`
- Native bridge：`edu-droid-flutter/android/app/src/main/java/com/viewsonic/droid/CastListPlatformView.java#getSession` (line 189)
- mvb-fe-auth 套件：`@viewsonic-edu/mvb-fe-auth`（`Viewsonic-EDU/edu-fe-common-lib`）
