# Out-of-Scope 建議

> 調查 VSFT-8368 過程中發現的、**不屬於本 ticket 範圍**但值得記錄的後續建議。
> 主要服務 mvbf 之外的團隊（mvb backend / 行銷 / Data team / cs / mvbw…），
> 供未來 ticket 規劃時參考。
>
> VSFT-8368 的範圍 = mvbf Amplitude 事件埋點與 user property。其他相關工作不在本 ticket 內。

---

## 1. mvbf 點 Beta button 後呼叫 `POST /v1/entity/beta-program/register` 自動加入名單

**Owner**：行銷 / mvbf v2 / mvb backend 協同（**不在 VSFT-8368**）

**背景**
- mvb backend 已有 `POST /v1/entity/beta-program/register` endpoint（`edu-mvb-api-core` 的 `mvb-legacy/src/entity/beta-program/beta-program-registration.controller.ts`），含 email drip campaign scheduler + `beta-program-enrollment` model + migration `models/_migrations/20260522.sql`
- mvbf 已實作 `Beta Program Joined Clicked` Amplitude event（含 `email` 屬性，在 VSFT-8368 完成）—— 但**沒有打 backend register endpoint**

**建議內容**
- 點 Beta button 時除了 fire Amplitude event，**同時呼叫** `POST /v1/entity/beta-program/register` 把使用者寫進 enrollment 名單
- backend 自動觸發 email drip
- 行銷團隊不用手動從 Amplitude 撈名單再餵 email 系統

**待釐清（為何不直接 mvbf 做）**
1. **行銷 drip 內容 / 頻率 / 啟動時機** 都需要行銷團隊定義
2. **GDPR / 隱私同意**：使用者按 Beta button 是不是已等同同意收行銷信？需要 PM / 法務確認
3. **`VsOIDCGuard` token 相容性**：mvbf 用 mvb OIDC 拿到的 access token，需確認跟 VS account token 是同一張或可替換；若不相容，要 mvb backend 改 guard 或 mvbf 取另一張 token

**對 VSFT-8368 的影響**：無（mvbf 端 Amplitude 追蹤已完整，能用 Amplitude event + email 屬性出名單，只是行銷要手動撈）

**相關**：原本是 `open-questions.md` Q7，因為超出 VSFT-8368 範圍，移到本文件保留

---

## 2. MQTT broker 沒有 topic 層級授權 —— 任何連上的 client 可推檔到任何白板

> 🔒 **安全性議題，非埋點問題。** 於 VSFT-9941 追查 `file-import-present` 發送端時附帶發現。
> **僅為原始碼閱讀推論，未做任何實機驗證**；production 可能另有網路層防護或不同的 broker 設定。

### 發現

`edu-mvb-mqtt/serverFactory.js` 的 `authorizePublish`（`:136-158`）**只檢查 rate limit 與
`unwelcome` 名單，沒有任何 topic 比對**。也就是說任何通過 `authenticate` 的 client
都可以 publish 到**任意** `/action/<instanceID>`，broker 不驗證你是不是那台機器的擁有者。
`authorizeSubscribe`（`:160-170`）同樣沒有 topic 檢查（而且它的 deny 分支只寫 log，
仍然 `callback(null, subscription)`，等於永遠放行）。

`authenticate`（`:43-135`）有一條更寬的路徑：白板類 client 用的是**寫死的共用密碼**
（同一組字串同時出現在 `edu-droid-flutter/lib/remote_control_manager.dart:99` 與 broker），
且當 client id 符合 `/^(cp_|temp|)[A-Za-z0-9\-_]{32}$/` 且前綴為 `temp` 時
**無條件 `allowCb(true)`**，不做帳號驗證。

### 為什麼有影響

白板端對 `/action/<instanceID>` 進來的指令**完全不驗證 sender**。以
`file-import-present` 為例（`throw_helper.dart:39`）：收到就下載 `extra.file.link`
指向的任意 URL 並直接置入畫布，**不發通知、不跳確認**。Flutter / Windows(sparrow) /
mac 三端行為一致。

而白板的 `instanceID` 不是祕密 —— `POST /api/v1/account/getinfo/username`
帶 `{name: <hostName>}` 就會回傳 `deviceId`（即 instanceID）與 `isOnline`，
而 hostName 就印在 Throw QR code 的公開網址 `myviewboard.com/preview/<hostName>` 裡。
只有在該帳號開啟 secure mode 時才需要額外 OTP，而 `secure_mode` **預設 false**
（`user_data.dart:131`）。

串起來就是：**公開 host name → deviceId → 連上 broker → publish 到該白板的 topic →
教室螢幕上直接出現任意圖片**，全程沒有任何一層驗證推送者的身分。

### 建議

1. **`authorizePublish` 加 topic ACL** —— 至少限制 `/action/<id>` 只允許與該 id 有
   合法關聯的 client（白板本人、或已通過 host sign-in 的 companion）
2. **修正 `authorizeSubscribe` 的 deny 分支**（目前 deny 只寫 log 不擋）
3. **移除 `temp` 前綴的無條件放行**，或改為短期一次性憑證
4. **白板端補 sender 驗證**：`remote_control_manager.dart` 對 `file-import-present`
   之類會直接改變畫面的指令，至少比對 sender 是否為當前登入帳號
5. 評估 `getinfo/username` 是否應該在 secure mode 關閉時也不回傳 `deviceId`

### 相關檔案

| 位置 | 說明 |
| --- | --- |
| `edu-mvb-mqtt/serverFactory.js:43-175` | broker 的 authenticate / authorizePublish / authorizeSubscribe |
| `edu-droid-flutter/lib/remote_control_manager.dart:378-397` | 白板端 `file-import` 系列指令處理（無 sender 驗證） |
| `edu-droid-flutter/lib/helper/throw_helper.dart:37-80` | `presentFile` 下載並置入畫布 |
| `edu-droid-companion-flutter/lib/mvb_host_controller.dart:296-298` | 正常產品路徑的 sender（Companion App） |

**對 VSFT-9941 的影響**：無。埋點決定已定案為維持 spec 三個入口（見
[`open-questions.md`](open-questions.md) Q20）。

**建議找誰**：MVB 後端 / infra team（broker 設定）+ 資安

---

> 之後其他「mvbf 不該自己決定 / 需要其他 team 接手」的建議都加在這裡。
