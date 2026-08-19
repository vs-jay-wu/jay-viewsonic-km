# Open Questions：需要他人決策的疑問

> 此處列出 **Jay 一個人無法決定** 的問題，需要找 spec owner（Zoe / reporter zoe.ay.yeh）、
> 跨團隊（cs / mvb backend / mvbw）或 PM 對焦才能定案。
>
> mvbf 端基礎實作已完成；VSFT-8368 的最終形態仍待以下決策題定案才能確認，
> 屆時可能再調整實作。
>
> 每個問題附：背景、現況（從 `investigation/findings.md` 引用）、必要的決定、影響範圍。

---

## Q1【高優先】login method enum 對齊方向

**背景**
spec 的 `login method` enum 跟 cs Android 既有實作不同；mvbw 又是第三套。

| 來源 | 值 |
| --- | --- |
| mvbf spec（Confluence App Launch & Login v17） | `sso / email / qrcode / stay signed in`，外加 `sso provider: apple/google/microsoft/edu cloud` |
| cs Android（ragdoll-cat） | `ViewSonic / ClassLink / Google / Microsoft / QR code / Automatic`，**無 sso provider** |
| mvbw（edu-sparrow-app，已遷移到 cs Amplitude project） | `email` / `stay signed in`（缺 sso / qrcode；事件命名已用 spec 的 `Login Method Selected` 等） |
| cs Windows（maine-coon-cat） | type 宣告 `ViewSonic / ClassLink`，但 code 從未實際 set |

**附帶分歧**：事件名稱 cs 用 `Login Failed`，spec/mvbf 用 `Login Error`。

**需要決定**
1. 三套要不要對齊？對齊哪一套？
2. 如果以 cs Android 為準，mvbf 要改字串並放棄 `sso provider`（資料粒度損失）
3. 如果以 spec 為準，cs Android 要改字串並補 `sso provider`（Amplitude 歷史資料會斷層）
4. 是否在 Amplitude 後端做 mapping layer（風險：raw event 與 dashboard 不一致）

**影響**
- 歷史 Amplitude 資料延續性（cs Android 已有大量歷史資料；mvbf 還沒進 prod）
- spec 變動範圍（cs User Properties spec vs mvbf 自己的 spec）

**建議找誰**：Zoe（reporter）+ cs Android team

### 🤖 AI 建議

**問題本質**：Confluence 上 **兩份 spec 互相矛盾**——
- mvbf 的 App Launch & Login spec（v17）：`sso / email / qrcode / stay signed in` + `sso provider`
- cs User Properties spec（VCAET v95）§Login Data：`ClassLink / ViewSonic / QR code / Google / Microsoft / Automatic`

兩份都是 spec，但**規模與權威性不同**：cs User Properties spec 是全 cs 生態都引用的「user properties 總綱」，且既有實作（cs Android、Hub、Amplitude 歷史資料）都對齊它；mvbf spec 只服務 VSFT-8368 一個 ticket。

**建議方向：採 cs User Properties spec 為基準，在它身上延伸補 mvbf 獨有項目；mvbf 自己的 App Launch & Login spec 同步更新**

理由：
1. **歷史資料延續性**：cs Android 已有大量歷史資料用 cs spec 命名，改 cs 端會洗資料；mvbf 還沒進 prod，改 mvbf 無歷史代價
2. **Reference impl 也用 cs spec 值**：Hub `trackingProps.ts` 直接寫 `login method: 'ViewSonic'`，cs Android 用 `ViewSonic / ClassLink / Google / ...`。cs spec 不是紙上設計，是真正在用
3. **cs spec 自己 §Login Data 對 Windows / Android 行為已有明確註記**（「Windows 透過 vs portal 都是 ViewSonic」、「QR code 只有 for Android」），已經考慮多平台
4. **mvbw 部分對齊 mvbf spec 但很不完整**（只 email/stay signed in），動 mvbf spec 不會造成嚴重連鎖

**值對映表（mvbf 各登入路徑 → cs spec 值）**

| mvbf 登入流程 | mvbf spec 值 | 建議改送 cs spec 值 | 備註 |
| --- | --- | --- | --- |
| SSO Google | `sso` + `sso_provider=google` | `Google` | enum 已含 provider 資訊，可廢 sso_provider 欄位 |
| SSO Microsoft | `sso` + `sso_provider=microsoft` | `Microsoft` | 同上 |
| SSO Apple | `sso` + `sso_provider=apple` | **`Apple`**（cs spec 需補） | cs spec 目前沒列 Apple，要擴增 |
| SSO MOE Taiwan | `sso` + `sso_provider=edu cloud` | **`MOE Taiwan`** 或 `Edu Cloud`（cs spec 需補） | cs spec 沒對應 |
| SSO NYC | `sso` + `sso_provider=nyc` | **`NYC`**（cs spec 需補） | cs spec 沒對應 |
| QR Code | `qrcode` | `QR code` | 命名小調 |
| Stay signed in | `stay signed in` | `Automatic` | cs spec 已有對應概念 |
| Email/Password 直登 | `email` | **`Email`** 或保留 `ViewSonic`（cs spec 需澄清） | cs spec 沒明確 email 流程；Hub 直接寫 `ViewSonic` 因為走 vs portal。mvbf 是真的 email/password 直連，建議擴增 `Email` 值 |

**附帶分歧（事件名稱）**：cs 用 `Login Failed`、mvbf 用 `Login Error` —— 同樣理由（歷史資料延續、cs 既有實作），**建議 mvbf 改成 `Login Failed`**。

**配套工作**
- cs User Properties spec 補上 `Apple / MOE Taiwan / NYC / Email`（請 Zoe 跟 cs team 確認新值命名）
- 更新 mvbf App Launch & Login spec（v17）為 deprecated 或同步成 cs spec
- mvbf code 改：
  - `login_handler.dart` 的 `_amplitudeSsoProvider` 改成直接回 cs enum 值（`Google / Microsoft / Apple / ...`），整個 `sso_provider` 概念廢除
  - email 流程的 `'email'` 改 `'Email'`
  - QR 流程 `'qrcode'` 改 `'QR code'`
  - stay signed in 改 `'Automatic'`
  - `Login Error` event 改 `Login Failed`
- cs Android 不動（已對齊 cs spec）；Hub 不動（已寫死 ViewSonic）

**風險／取捨**
- 🟢 mvbf 還沒進 prod，無歷史資料延續代價（可自由採用任何值，不受既存 Amplitude 資料約束）
- 🟡 cs spec 需 PM 同意擴增 4 個新值（Apple / MOE Taiwan / NYC / Email），跨團隊溝通
- 🔴 若 PM 認為應該以 mvbf spec 為準（理由：粒度更規範、`sso_provider` 分離有設計優勢），就要動 cs Android 並承擔歷史資料斷層 —— 不建議走這條

---

## Q5【中優先】App Ended 的 `end reason` 在 Flutter 抓不到時怎麼處理

**背景**
spec App Ended 要求帶 `end reason`，並標註「不確定是否可以抓取這樣的資料」。

**現況**
- mvbf 已實作 App Ended，在 `AppLifecycleState.detached` 時觸發
- Flutter 只能拿到 `resumed/paused/detached`，**無法區分**：
  - 使用者主動關閉（swipe away）
  - 系統 OOM 殺掉
  - 切到背景被回收
- **已採 AI 建議的 layer 1（拔 `end reason` 屬性 + 加 `_analytics.flush()` 提升即時命中率）**：
  - `track_event_factory.dart` `appEnded()` 不再帶 `end reason`
  - `main_screen.dart` `detached` 分支在 `trackEvent(appEnded())` 後 `unawaited(_analytics.flush())`
  - `AmplitudeHelper.flush()` + `AnalyticsHelper.flush()` 新增
- **layer 2 仍待 Zoe 拍板**：App Ended 事件本身值不值得保留（CS-Prod 30 天只 3 筆、命中率 < 1%）

**跨產品調查（2026-05-28）**

| 產品 | App Ended | end reason | 觸發 |
| --- | --- | --- | --- |
| mvbf | ✅ 有 | 寫死 `'close app'` | Flutter `AppLifecycleState.detached` |
| mvbw (sparrow) | ✅ 有 | **同樣寫死 `"close app"`**（`App.xaml.cs:387-401`） | UWP `SystemNavigationManagerPreview.CloseRequested` |
| cs Android (ragdoll-cat) | ❌ 沒有 | — | 無 app 生命週期追蹤 |
| cs Windows (maine-coon-cat) | ❌ 沒送 amplitude 事件 | — | 有 electron `before-quit` hook 但沒發事件 |

**Amplitude 實測（關鍵）**：CS-Prod 過去 30 天 **App Ended 只有 3 筆**（全來自 sparrow `http/2.0`），App Launched 也近乎 0。→ 這兩個 MVB-app 生命週期事件**實際上幾乎收不到**（App 被終止時事件常來不及送），正好印證 spec 的「不確定是否可以抓取」。

**為什麼 App Ended 命中率這麼低？（Flutter detached 技術分析）**

當使用者把 mvbf 滑掉時，事件到底能不能送出，分兩層看：

1. **track 能執行**：`AppLifecycleState.detached` 觸發時 Dart isolate 還活著毫秒級，可以呼叫 `_amplitude.track(...)`
2. **本地 queue 寫入成功**：`amplitude_flutter` v4 的 `track()` 是把 event 加進本地 disk queue（同步、很快），不直接 HTTP 送
3. **但 HTTP 上傳基本來不及**：Amplitude SDK 真正 flush（HTTP send）的觸發時機是 `flushIntervalMillis`（~30 秒）/ `flushQueueSize`（~30 events）/ 顯式 `flush()`。mvbf 的 `amplitude_helper.dart:20` 用 bare `Configuration(apiKey:...)`，沒覆寫間隔、沒在 detached 呼叫 `flush()` → HTTP 是 async，等不到完成 process 就死了
4. **救命稻草：下次再開 mvbf 才會送**：SDK 啟動時讀 disk queue 把舊 event flush 出去（event_time 仍是當初 track 的時間，資料時序正確）
5. **但使用者 swipe-away 多半就不回來**（換手機 / 解除安裝 / 換產品）→ 事件**永遠丟失**

**改善上限**：若加 `_amplitude.flush()` 在 `appEnded()` 後，命中率或許從 ~1% 提到 ~10%，仍遠不及一般事件。iOS 更兇（OS 立即收回 background time）。

→ **不只 `end reason` 寫死無意義，App Ended 事件本身的命中率也低到接近用不了**（CS-Prod 30 天 3 筆是實證）。

**分析**：
- 寫死的 `end reason` 永遠是 `close app` → **零變異、無分析價值**（當不了 breakdown）
- mvbf 跟 sparrow 目前**一致**（都寫死 close app）；mvbf 若拿掉就不一致
- Flutter 技術上也真的無法區分（只有 detached）

**需要決定**
- A. 維持寫死 `'close app'`（跟 sparrow 一致、成本低，但資料無意義）
- B. **拿掉 `end reason` 屬性**，保留 App Ended 事件（屬性無用就不送；但跟 sparrow 不一致 → 建議 mvbf + sparrow 一起拿掉）
- C. 改上報 lifecycle state（detached/paused…）由 Amplitude 後分析（但 Flutter 能分的也有限）
- D. 連 App Ended 事件本身都重評估（既然幾乎收不到，值不值得做）

**建議**：mvbf + sparrow 一起決定（要嘛都留、要嘛都拿掉 end reason），避免兩個 MVB app 不一致。

**影響**：`end reason` 屬性的資料品質；決策不影響埋點時程

**建議找誰**：Zoe + Data team（這欄位怎麼用 / App Ended 要不要留）

### 🤖 AI 建議

**問題分兩層，建議分開處理**：

#### 層 1（戰術，無爭議）：立刻拿掉 `end reason` 屬性 = 選項 B

理由：
- 值永遠是 `'close app'`，零變異 → 當不了 breakdown 維度
- spec 自己標註「不確定是否可以抓取這樣的資料」—— 等於 spec 已預期可能拿不到
- Flutter 技術上真的無法區分（只有 `detached` 一個訊號）；硬寫死是技術限制下的妥協，沒分析價值

**配套**：sparrow 同時拿掉（兩邊也都寫死 `'close app'`），保持 mvbf + sparrow 一致。**這個決策不影響 spec 主要意圖**（App Ended 事件本身保留，只是不帶 unique property）。

#### 層 2（戰略，要 Zoe 拍板）：App Ended 事件本身值不值得保留？

實證殘酷：CS-Prod 30 天**只有 3 筆**，命中率 < 1%（process 被殺時 HTTP 來不及送，靠下次開 app 才能補送、但 swipe-away 多半不回來）。

三個方向給 Zoe 選：

| 方向 | 做法 | 取捨 |
| --- | --- | --- |
| **A. 維持現狀 + 加 flush** | 保留 App Ended，於 `appEnded()` 後顯式呼叫 `_amplitude.flush()` | 命中率 ~1% → ~10%（仍低）；對齊 spec；mvbf + sparrow 一致 |
| **B. 改用 Amplitude 內建 session 追蹤** | 開啟 `defaultTracking.sessions`，廢除自訂 App Launched / App Ended | 命中率 100%（SDK 內建可靠）；資料模型改變（用 `session_start` / `session_end` 而非 App Launched/Ended）；**偏離 spec**（spec 雖列出此選項但被劃線拒絕） |
| **C. 接受 App Ended 為 best-effort** | 不改 code，知道資料只有 ~1%，dashboard 上標註「樣本不代表全體」 | 零成本；資料分析師要被教育 |

**我的建議：採 A + 層 1 拿掉 end reason**
- 不違 spec、改動小
- 命中率 ~10% 雖低但能跟 App Launched 配對做 session 長度抽樣分析
- 比 B 安全（spec 已劃線拒絕 built-in session）
- 比 C 主動，不只「躺平接受」
- 同時把 layer 1 的 end reason 拿掉，等於兩件事一起做完

**配套工作**
- mvbf：`track_event_factory.dart` `appEnded()` 拿掉 `'end reason'`，並在 `main_screen.dart:518` `appEnded()` 後加 `_amplitude.flush()`
- sparrow：同步拿掉 `end reason`（`App.xaml.cs:387-401`），AmplitudeAnalytics 那邊本來就有 flush queue，可考慮也加顯式 flush
- spec：把 `App Ended` 的 unique property `end reason` 移除（或標 deprecated）；保留事件 + 標註「best-effort delivery, expect <10% sample」

**風險**
- 🟢 拿掉 end reason 沒風險（沒人在用這個值的零變異資料）
- 🟡 加 flush 可能影響 app close 時的關閉速度（~毫秒級，可接受）
- 🔴 如果 Zoe 選方向 B（改用 built-in session），spec 要重寫、ClassSwift dashboard 既有 App Launched / App Ended 報表要換 —— 不建議
## Q8【中優先】VSFT-8368 scope 是否含 mvbw

**背景**
- Ticket 命名「[Data] **MVBF** data tracking」明顯只指 mvbf
- 但 spec 的 Beta Program Notes 寫「Windows / Android 都有」
- App Launched / App Ended Platform 標 `MVB App`，未限平台

**現況**（2026-05-27 重新調查）
sparrow（`edu-sparrow-app`）已透過 `[VSFT-8267][Data] MVBW data tracking`（2026-05-22）做了大部分對齊：

| 項目 | mvbw 狀態 |
| --- | --- |
| Amplitude project | ✅ 已遷移到 **cs Amplitude project**（API key 與 mvbf 一致） |
| 事件命名 | ✅ `Login Method Selected` / `Login` / `Login Error` 已對齊 cs spec |
| User properties | ⚠️ 只設 `user id` + 9 個 device 欄位；缺 `role` / `email` / `display name` / org / plan / `is internal user` / `is login` / `login method`（user prop）/ `sso provider` |
| Login 流程 | ⚠️ 只實作 email + stay signed in；缺 SSO 跟 QR code 流程 |
| `App Launched` event | ❌ 未實作 |
| `App Ended` event | ❌ 未實作（`App.xaml.cs:343` 只 flush queue） |
| Beta Program 按鈕埋點 | ❌ 未實作（按鈕本體存在） |

**結論**：mvbw 透過 VSFT-8267 自己處理了大半，**事件命名 / Amplitude project 已跟 mvbf 對齊**，VSFT-8368 不太需要替 mvbw 操心這部分。但 mvbw 仍缺 App Launched/Ended/Beta 跟大部分 user properties，這些屬於 mvbw team 自己的後續工作。

**需要決定**
- A. **VSFT-8368 只動 mvbf**（推薦）；mvbw 缺口讓 mvbw team 在 VSFT-8267 後續或新 ticket 處理
- B. mvbf 完成後幫 mvbw 補齊缺口（額外工作）

**影響**：跟舊評估不同 —— 工作量沒那麼大了，因為 mvbw 已自行做了 project 遷移與事件命名對齊

**建議找誰**：Zoe + mvbw team（確認 VSFT-8267 後續是否會補 App Launched/Ended/Beta/user properties）

### 🤖 AI 建議

**推薦選項 A：VSFT-8368 只動 mvbf；mvbw 缺口由 mvbw team 自行處理**

理由：

1. **ticket scope 本來就清楚**
   - VSFT-8368 命名「**MVBF** data tracking」= mvbf 範圍
   - VSFT-8267 是 mvbw 自己的「**MVBW** data tracking」ticket，2026-05-22 已 commit
   - 跨產品執行會模糊 ownership、拖長 timeline

2. **mvbw 自己已做了該做的主要事**
   - ✅ 遷移到 cs Amplitude project（API key 已對齊 mvbf）
   - ✅ 事件命名對齊 cs spec（`Login Method Selected` / `Login` / `Login Error`）
   - ⚠️ 缺口（App Launched/Ended / Beta / user properties / SSO/QR）是 sparrow team 自己的後續工作，他們知道在哪、有 ticket 可追

3. **mvbf 不該替別人擦屁股**
   - 如果 mvbf 動到 sparrow 的 C# / UWP code，等於 mvbf team 跨棧（Flutter → C#）+ 跨產品 ownership
   - sparrow team 對自家 platform 限制熟悉度遠高於 mvbf team

4. **但「對齊決策」要 mvbf + mvbw 一起做**
   - Q1（login method enum 對齊方向）、Q5（end reason 處理）、Q10（role 對齊）、Q12（plan type 對齊）、Q15（source project 標記）—— 這些決策**影響兩個 MVB app**
   - 決策 mvbf + mvbw 一起，**執行各自在各自 ticket 做**

**配套工作**

mvbf（VSFT-8368）：
- 完成 mvbf 自己的埋點 + 跟前述 Q（含 Q1/Q5/Q10/Q12/Q15）連動的部分

mvbw（VSFT-8267 後續或新 ticket）：
- 補 App Launched / App Ended（含 Q5 對齊處理）
- 補 Beta Program 埋點 + register endpoint 呼叫（後者見 `out-of-scope-suggestions.md` §1，非 VSFT-8368 範圍）
- 補 SSO / QR code 登入流程 + 對齊 Q1 決議的 login method enum
- 補 role / email / display name / current org / plan 等 user properties（含 Q10/Q12 對齊）
- 補 source project 標記（Q15）

**風險**
- 🟢 mvbf 跟 mvbw 是兩個獨立 codebase + 兩個 team，自然分工
- 🟡 跨產品決策（Q1/Q5/Q10/Q12/Q15）需要 mvbf + mvbw 提前同步，避免最後送的值還是不一致
- 🔴 若選項 B（mvbf 幫 mvbw 補）：mvbf team 要學 UWP/C# + 動別人 codebase，coordination cost 高、PR review 也得拉 sparrow team —— **不推薦**

---

## Q9【低優先】cs Windows（maine-coon-cat）login method 沒實作要不要一起補

**背景**
cs Windows（Electron 版）的 type 有定義 `login method` 但 code 從未 set。

**現況**
- type stub：`'ViewSonic' | 'ClassLink'`（`src/utils/analytics/types.ts:133`）
- 實際 code：`trackLoginWithUserData.ts:23-29` 沒 set `login method` / `platform` / `role` / `login from`

**需要決定**
- A. 不在 VSFT-8368 範圍，另開 ticket 給 cs Windows team
- B. 一併處理（很可能跟 Q1 對齊方向綁定）

**建議找誰**：Zoe + cs Windows team

---

## Q13【已處理，待 Zoe 確認】mvbf `device brand` 改用真實品牌

**背景**
spec `device brand`（`ViewSonic / Acer`）目的是「識別非 ViewSonic 裝置佔比」。

**處置**：已採做法 2 —— `_deviceBrand()` 改用 `UtilityHelper.brandName`（= `DeviceInfoVs.brand` 真實品牌字串），送 `ViewSonic` / `BenQ` / `Promethean` / `samsung` 等實際品牌，空字串 omit。**已能區分非 VS 裝置，達成 spec 本意**（先前只分 ViewSonic vs none 的粗略版已升級）。

**待 Zoe 確認**：
- 真實品牌字串的大小寫 / 格式（`brandName` 直出，未 normalize）可接受嗎？
- Amplitude 實測 cs 此欄 99%+ 是 `(none)`（沒人認真填），mvbf 現在反而會填真實品牌 —— 確認這是要的方向

**建議找誰**：PM / Zoe

---

## Q15【高優先】mvbf vs cs 事件在 Amplitude 無乾淨的來源區分

**背景**
mvbf 跟 cs 共用同一個 Amplitude project（CS-Prod/Stag/PreProd），但**沒有明確的「事件來源 / 產品」標記**能區分一個事件是 mvbf 送的還是 cs 送的。事件名稱還重疊（`Login` / `App Launched` 兩邊都用）。

**現況：只能靠 Amplitude 內建 `library` 隱性區分**

| 來源 | `library` |
| --- | --- |
| mvbf | `amplitude-flutter/4.5.0_amplitude-analytics-android/1.27.0` |
| cs Android | `amplitude-analytics-android/1.22.0` |
| cs Web / Hub | `amplitude-ts/*` |
| sparrow / server | `http/2.0` |

- 「`library` contains `amplitude-flutter`」= mvbf
- ⚠️ **陷阱**：mvbf 的 library 字串也含 `amplitude-analytics-android`（Flutter SDK 包 Android native），不能用「contains `amplitude-analytics-android`」過濾（會同時抓到 cs Android）

**spec 沒覆蓋這個缺口**（已查 clone 的 Confluence）：
- `create_from: "mvb"`（user property）= 帳號來源，**不是**事件來源；且 ocelot 實際沒 push
- `platform`（`Android/Windows/...`）= OS，mvbf-Android 跟 cs-Android 重疊，分不出
- 各事件的 `Platform: MVB App` 是 spec 表格的歸屬說明，不是會送出的值
- cs Android code 自己加的 event property `source project = "Android"`、cs Hub 的 `source project = Hub/ProductPage` 都是**程式層決定，spec 沒寫**

**需要決定**
1. 🟢 **mvbf 比照 cs，在每個事件加 `source project` event property**（值如 `"MVBF"` / `"MVB Flutter"`），讓分析師能乾淨 filter。改動小（mvbf event factory 統一加）
2. 🟡 沿用 `library` 隱性區分（不改 code，但脆弱、有 amplitude-analytics-android 重疊陷阱、需教育分析師）
3. 額外：是否要一個**全平台一致的來源標記規範**（cs Android="Android" / Hub="Hub" / mvbf=? / sparrow=?），由 Data team 統一定義 enum

**影響**：所有 mvbf 事件在 Amplitude 的可分析性；跨產品報表能否拆分

**建議找誰**：Zoe + Data team（統一來源標記規範）

---

## 📦 Q10 + Q12 同屬一類：「mvb 體系值 vs cs 體系值對齊」（建議一起決策）

Q10（`role`）跟 Q12（`current plan type`）是**同一個根本問題**：mvbf 走 mvb backend 拿到的是 **mvb 體系的值**，但 Amplitude 上既有資料（及 spec）用的是 **cs 體系的值**，兩套詞彙對不上。

| 欄位 | mvb 值（mvbf 會送） | cs 值（Amplitude 現有 / spec） |
| --- | --- | --- |
| `role`（Q10） | `USER / ADMIN / OWNER / SUPER_ADMIN` | `Student / Teacher / Admin / Owner / VIP` |
| `current plan type`（Q12） | `Standard / Premium / Pro / Entity*` | `Advanced / Lite / Basic / Trainer / Schools&districts / Plus` |

**共同的解法選項（建議對 role 跟 plan type 採同一套策略）**：
1. 🟢 改 key 名分流（`mvb_role` / `mvb_plan_type`），不污染 cs 的 `role` / `current plan type`
2. 🟡 client/backend 做 mvb→cs 值對映（需對照表，且不一定 1:1）
3. 🔴 移除這兩欄，等 cs 對齊方式釐清

> 未來其他「mvb 拿得到但跟 cs 詞彙不同」的欄位都適用同一個決策。下面 Q10 / Q12 保留各自細節。

---

## Q10【高優先】mvbf 不該把 mvb 後端 role_name 直接送 Amplitude（會打破現有對齊）

**背景**
原本的假設是「mvbf 是唯一送 `role` user property 的 client」，但用 Amplitude MCP 實測後**證實這個假設是錯的**。`role` 在 cs 生態被多個 client 大量使用，且**值全是符合 cs spec 的 `Student / Teacher / Admin / Owner`**（首字大寫）。

mvbf 的兩個技術方向：
- **選項 A**：寫死 `'Teacher'`（早期版本，剛好對齊 cs spec）
- **選項 B**：API fetch（背景非同步打 `GET /me/entity` 拿 `role_name`，**目前實作**）—— 會送 mvb 後端的 `USER / ADMIN / OWNER / SUPER_ADMIN`，**打破對齊**

> mvbf 仍未上 prod，兩個方向都還能切換，無 Amplitude 歷史資料代價。

> 🔍 **2026-05-28 補充**：實查 cs Hub web（`african-golden-cat`，spec 的 reference implementation）的 `src/utils/trackingProps.ts` —— **Hub 也是寫死 `role: 'Teacher'`**，不是 API fetch。Hub 是 spec 對齊最完整的客戶端，連它都寫死，**強烈支持 mvbf 採選項 1（寫死 Teacher）** 而不是 API fetch。

**事證**（詳見 `user-properties-sources.md` §2）

CS-Prod 過去 30 天 `gp:role` 實際分布：
- **Student** ~500/day（cs Web 學生端送的，mvbf 不可能送）
- **Teacher** ~70/day（含 server-side 服務 / cs Web / 早期 mvbf 寫死 Teacher 留下的 Stage 資料）
- Admin / Owner 偶爾出現
- 全部值符合 cs spec 首字大寫

CS-Prod 過去 7 天 `Teacher` 來源（SDK library）：
- `http/2.0`（server-side HTTP 直送，最大宗 ~55/day）
- `amplitude-ts/2.17.x / 2.18.x`（cs Web 前端）
- **沒有 amplitude-flutter（mvbf）出現**：可能 mvbf prod 用戶極少

CS-Stag 確認 mvbf 在送：`amplitude-flutter/4.5.0_amplitude-analytics-android/1.27.0` 在 `Teacher` 名單裡，5 個 user。

**值的對應仍有衝突**

| 來源 | 值 |
| --- | --- |
| mvb 後端 `EntityRoleDef` | `super_admin / owner / admin / user` |
| cs spec User Properties | `student / teacher / admin / owner / vip` |
| Amplitude 實際資料 | `Student / Teacher / Admin / Owner` |

mvb 沒有 `student/teacher/vip`，cs 沒有 `super_admin/user`。mvbf 是教師端 app，組織裡的「`user`」實際上**可能是老師**（合理推測），但這需要確認。

**需要決定**

1. 🟢 **採寫死 `'Teacher'`**（最直接，跟 cs 既有實作對齊 —— Hub `trackingProps.ts` 也是寫死 Teacher）。mvbf 是教師端 app，所有真實用戶概念上都是老師，寫死正確。
2. 🟡 **採 API fetch + client 端做語意 mapping**：`USER → Teacher`、`ADMIN → Admin`、`OWNER → Owner`、`SUPER_ADMIN → ?`。可保留比寫死多一點資訊（區分老師裡的管理員），但 `SUPER_ADMIN` 沒對應、需要 fallback。
3. 🟡 **採 API fetch + 改 key 名稱**：把 mvbf 送的改成 `mvb_role` 或 `entity_role`，跟 cs spec 的 `role` 分開不污染。但這樣 mvbf user 在 Amplitude 沒有 `role` 屬性，跟其他 cs client 比較時要兩個欄位 union。
4. 🔴 **採 API fetch + 直送 mvb 大寫原值**（目前實作）：會跟現有 cs Web / server 資料混合，**不建議**。

**影響**：Amplitude dashboard 上「role」欄位的資料一致性

**建議找誰**：Zoe + Data team（要不要區分 USER vs ADMIN vs OWNER 的細緻度？還是 Teacher 寫死就夠了？）

**附帶發現**：CS-Prod 有 server-side 服務透過 Amplitude HTTP API push `role` 屬性，**但不是 ocelot**（先前 ocelot 調查徹底 grep 過，沒有 set_user_properties 呼叫）。是哪個服務在做需要另外查（見 Q11）。

---

## Q11【待調查】哪個 server-side 服務在 push user property 到 Amplitude

**背景**
Amplitude library `http/2.0` 大量送 `role=Teacher` 到 CS-Prod（~55/day），但 ocelot 全 codebase grep 沒有任何 `set_user_properties` / `identify`。spec 提到的 `[User Property Updated]` 看起來有人在實作，只是不在 ocelot。

**候選**：`ocelot-socket` / `bay-cat`（cs 內部工具後端）/ 某個 Lambda / ETL；或 cross-client 同 amplitudeId 累積造成的假象。

**注意**：sparrow（mvbw）也用 HttpClient 直打 → library 同樣顯示 `http/2.0`，但 sparrow 不設 role，所以 sparrow 不是 role=Teacher 來源。

**影響**：釐清 `role` 等 user property 的真正 server-side 來源，影響 Q10 的決策（如果 server 已統一在寫 role，mvbf 可能根本不用送）

**建議找誰**：cs backend team

---

## Q12【高優先】mvbf `current plan type` 值跟 Amplitude 現有 cs plan 詞彙不對齊

**背景**
跟 Q10（role）同類問題。mvbf 已實作 `current plan type`（`getUserPlanName()` → `/api/account/subscription/plan` 的 `message`），但送的是 **mvb plan 詞彙**，跟 Amplitude 上既有的 **cs plan 詞彙**不同。一旦進 prod，會造成詞彙混雜。

**事證**（2026-05-27）

| 來源 | plan 值詞彙 | 怎麼得知 |
| --- | --- | --- |
| **mvbf 會送的**（看 code） | mvb `SubscriptionName`：`Standard / Premium / Pro / Entity / Entity Standard / Entity Premium` | `getUserPlanName()` → mvb `/subscription/plan` 的 `message` |
| **Amplitude CS-Prod 現有值** | `Advanced / Lite / Basic / Trainer / Schools&districts / Plus / Classswift` | Amplitude 實測，**但這全是 cs 送的** |

⚠️ **重要前提**：mvbf 目前**還沒進 CS-Prod / CS-PreProd**（才剛加進 cs Amplitude project，只有 CS-Stag 有 debug 帳號）。所以 Amplitude prod 上所有資料都是 cs 的，**mvbf 實際值只能看 code 推**，不能從 prod 資料看。

兩套詞彙完全不同、無法直接對應（mvb `Premium` ≠ cs `Advanced`）。mvbf 一旦進 prod，就會讓 `current plan type` 欄位混入第二套詞彙。

另外 mvbf code 舊註解顯示 `message` 可能帶後綴（`"Premium (free year)"` / `"Premium w/o Classroom"`），實際值乾不乾淨待實測。

**需要決定**
1. 🟢 採新 key 名（如 `mvb_plan_type`），跟 cs 的 `current plan type` 分開
2. 🟡 採 mvb plan → cs plan 的 mapping（client 或 backend 做，需要對照表，且 mvb/cs plan 不一定 1:1）
3. 🔴 mvbf 不送 `current plan type`，等釐清 cs plan 對齊方式
4. ⚠️ 直送 mvb 詞彙（目前實作，會跟 cs 混入）—— 不建議

**影響**：Amplitude `current plan type` 欄位的資料一致性

**建議找誰**：Zoe + Data team（plan 詞彙怎麼統一）

---

## Q16【中優先】mvbf `loginMethod` 的「自動登入」應該叫 `stay signed in` 還是 `auto` / `Automatic`

**背景**

mvbf 在 `ifp_account_manager._signInIfNeed`（app 啟動以 saved token 自動登入路徑）原本送 `loginMethod: 'stay signed in'`，但這個值語意上**跟 user 勾 checkbox 的時間點脫鉤** —— 真正勾 checkbox 是上一次登入時的設定，當下這次事件是「token 自動登入」結果。

幾個 spec 對「自動登入」的命名互相不一致：

| Spec / 端 | 自動登入命名 | UI 是否有 checkbox |
| --- | --- | --- |
| **mvbf spec**（App Launch & Login v17）| `stay signed in` | ✅ 有 |
| **cs spec**（User Properties v96）| `Automatic` | n/a（web） |
| **mvbw / sparrow**（VSFT-8267 後）| `stay signed in` | ✅ 有 |
| **mvbf code**（暫時，2026-05-28）| `'auto'`（已改） | ✅ 有 |

`stay signed in` 字面更貼 UI checkbox 的設定動作；`Automatic` 更貼「事件發生當下的觸發機制」。Hub `trackingProps.ts` 用 `ViewSonic` 寫死，沒對應到自動登入概念。

**現況**
- mvbf code 在 `ifp_account_manager.dart:140-144` **已改成 `'auto'`**（小寫，沿用 mvbf 既有 `email`/`sso`/`qrcode` 風格）
- mvbf spec 字面仍是 `stay signed in`，需 Zoe 拍板要不要改 spec
- 跟 Q1（login method enum 對齊方向）同根問題；如果 Q1 結論「全採 cs spec」，那這欄就應該是 `Automatic`

**需要決定**
1. 🟢 採 cs spec `Automatic`（首字大寫；對齊既有 Amplitude 資料、跨產品一致）→ 跟 Q1 一起處理
2. 🟡 維持 mvbf 字面 `stay signed in`（user-visible UI 字串跟 Amplitude 值一致，敘事直觀，但跟 cs spec 不對齊）
3. 🟡 mvbf 維持 `auto`（折衷：小寫對齊 mvbf 既有風格，但跟 cs spec 字面也不一致；只是臨時值）

**附帶澄清**：
- 起初以為「stay signed in 是 mvbw 限定（mvbw 登入 panel 有 checkbox）」 —— 實證 **mvbf 也有 checkbox**（`sign_in_footer.dart:51`，QA semantic id `[sign in dialog: stay signed in checkbox]`），這個前提不成立
- 真正的問題是「mvbf 自己的 spec 跟 cs spec 命名不一致」，跟 mvbw 無關

**影響**：Amplitude `login method` 欄位的資料一致性；mvbf spec doc 是否要更新

**建議找誰**：Zoe（同 Q1 一起拍板 mvbf vs cs spec 對齊方向）

---

## Q17【中優先】Timer Started 是否要把「暫停後續跑」算成一次開始（VSFT-9941）

**背景**
spec 寫「使用者按下 Play 且計時成功開始。**每次開始計時記一次**」。mvbf code 裡按 Play
有兩種情境，兩者都會讓計時真的跑起來：

| 情境 | count down code path | 說明 |
| --- | --- | --- |
| 從頭開始（含改過時間後） | `_timer.onStartTimer()` | 全新一輪倒數 |
| 暫停後續跑 | `_timer.startAfterPause()` | 同一輪，剩餘秒數繼續 |

碼表（count up）只有 `startAfterPause()` 一條路徑，暫停/續跑無法區分。

**現況實作**：兩種都送（照 spec 字面）。`preset seconds` 取
`anno.defaultCountDownValue`（原本設定的總長），續跑時**不會**變成剩餘秒數。

> 第一版誤用輸入框換算的值 —— 計時中輸入框每個 tick 都被改寫成剩餘時間，
> 導致續跑時送出剩餘秒數。已修正，見
> [`engagement-tools-implementation.md`](engagement-tools-implementation.md)。

**需要決定**
1. 續跑要不要算一次 `Timer Started`？
2. 若不算：碼表端要另外加狀態才分得出來（目前 code 分不出「第一次按 Play」與「暫停後續跑」）

**影響**
- spec 想看的「常用時長分佈」：續跑會讓同一個 preset seconds 被重複計數，拉高熱門時長的權重
- 「Timer 使用次數」指標會偏高（一堂課暫停三次 = 4 次事件）

### 🤖 AI 建議

🟢 **維持現狀（都送）**，理由：Amplitude 端可以事後用 session 內去重來收斂，但漏送的資料
救不回來。若 Zoe 確認只要「全新一輪」，count down 端一行條件就能改；count up 端要加旗標。

**建議找誰**：Gina Lu（VSFT-9941 reporter）

---

## Q18【低優先】Flashcard Flipped 的 spec 觸發描述與 Flutter UI 不符（VSFT-9941）

**背景**
spec 寫「**雙擊**卡片成功翻面（flip）」。mvbf Flutter 端沒有雙擊翻面 —— 卡片上有一顆
明確的 Flip 按鈕（`flash_card_view.dart` `_buildFlipButton` → `_flip()`）。

**現況實作**：掛在 `_flip()`，也就是「按下 Flip 按鈕且成功翻面」。行為語意等價，
只是入口 gesture 不同。

**需要決定**：spec 文字要不要更新成跨平台通用的描述（如「觸發翻面動作」），
以免 Windows / Mac 端照字面實作而三端不一致。

**影響**：純文件；不影響 Amplitude 資料。

**建議找誰**：Gina Lu（順手改 Confluence 即可）

---

## Q19【低優先】Throw File Imported 的 PDF 匯入算在哪一刻（VSFT-9941）

**背景**
spec 定義「檔案成功下載並**放上畫布**」。實際上三個入口對不同檔型的行為不同：

| 檔型 | 行為 |
| --- | --- |
| 圖片 | 下載完直接加到當前頁 → 真的「放上畫布」 |
| PDF | 下載完開「選頁 dialog」，使用者還要選頁才會放上畫布（可能中途取消） |

**現況實作**：兩者都在「成功交給 import 流程」時就送，三個入口一致。
也就是說 PDF 若使用者在選頁 dialog 按取消，事件已經送出去了。

**需要決定**：PDF 要不要改成「選完頁真的插入」才送？

### 🤖 AI 建議

🟢 **維持現狀**。這個事件的分析目的是「師生內容互動的證據」——學生丟檔、老師去拿，
互動已經發生了；選頁取消是編輯決策，不是互動沒發生。改成選頁後才送還會讓三個入口的
計數時機不一致，反而難解讀。

**建議找誰**：Gina Lu（若在意精準度再調）

---

## Q20【已定案】Throw File Imported 不含 `file-import-present`（VSFT-9941）

**決議（2026-08-19，Jay 與 PM 討論）：維持 spec 的三個入口，Companion App 的
「立即呈現」不納入埋點。** mvbf 端已把 `ThrowHelper.presentFile` 的埋點移除。

以下為當初的疑問與完整查證過程，保留供日後回頭參考。

---

**背景**
spec 的 Trigger Conditions 只列三個入口：Throw 面板雙擊、Throw 面板多選匯入、通知中心點擊。
但 mvbf 還有第四條路：MQTT `file-import-present` 進來時，`ThrowHelper.presentFile`
會直接下載並置入畫布 —— 不發通知、老師不用點任何東西。當時懷疑「學生能不能靠這條路
亂推圖片干擾上課」。

**查證結果（2026-08-19，含 offloaded repo 外接碟）**

| 問題 | 結論 | 依據 |
| --- | --- | --- |
| 誰在發 `file-import-present`？ | **Companion App**（`edu-droid-companion-flutter`） | `lib/helper/json_helper.dart:202` `buildMqttPresentThrowString` |
| 使用者做了什麼？ | Throw 檔案後跳確認 dialog「要在白板上呈現嗎」→ 按 Yes | `lib/screen/throw_screen.dart:288-308` |
| 推去哪台？ | `mvbHost.id`，而 `mvbHost.id` 是用**自己帳號名**查 API 拿到的、該帳號當前登入的白板 | `mvb_host_controller.dart:459-462`（`hostName = _user.name`） |
| 所以是誰在推？ | **同一個帳號用自己手機推到自己登入的白板** —— 不是學生 | 同上 |
| 學生用的 `/preview/<mvbName>` 網頁能發嗎？ | **不能**，只送 `file-import`（→ 產生通知）與 `file-import-recall` | `edu-mvb-web-original-portal/.../remote-transfer.component.ts:445-446` |
| 學生上傳有無門檻？ | 有兩道：① 老師帳號需有 `THROW` permission ② secure mode OTP，但 `secure_mode` **預設 false** | `remote-transfer.component.ts:234-254`、`user_data.dart:131-132` |
| 「Join Whiteboard」輸入別人 host name 那條呢？ | 那是 **Join Quiz**（pop quiz）流程，與 throw present 無關 | `join_whiteboard_screen.dart:156-195` |

**結論**：正常產品路徑上，`file-import-present` 是**老師自己**的行為（用 Companion App
把手機上的檔案推到自己的白板），不是學生端互動。當初「學生亂推圖片」的疑慮在產品 UI 上
不成立。

**埋點決定**：因此它既不屬於「老師匯入學生上傳的檔案」（spec Definition），也不該算進
「學生端互動」的分析口徑 —— 不納入。若日後要量測 Companion 推檔，應另開事件。

> ⚠️ 查證過程另外發現 MQTT broker 的授權缺口（與埋點無關，但值得後續處理），
> 已記在 [`out-of-scope-suggestions.md`](out-of-scope-suggestions.md)。

---

## 決策追蹤

> 拿到答案後請更新此區，附日期與決策者。

| # | 狀態 | 決定 | 決策者 | 日期 |
| --- | --- | --- | --- | --- |
| Q1 | 🔴 待回覆 | — | — | — |
| Q5 | 🔴 待回覆 | — | — | — |
| Q8 | 🔴 待回覆 | — | — | — |
| Q9 | 🟢 低優先 | — | — | — |
| Q10 | 🔴 待回覆 | — | — | — |
| Q11 | 🟡 待調查 | — | — | — |
| Q12 | 🔴 待回覆 | — | — | — |
| Q13 | 🟢 已改真實品牌，待 Zoe 確認格式 | — | — | — |
| Q15 | 🔴 待回覆（建議加 source project 標記） | — | — | — |
| Q16 | 🔴 待回覆（mvbf code 暫改 `'auto'`，命名對齊 Q1） | — | — | — |
| Q17 | 🔴 待回覆（現況：續跑也送） | — | — | — |
| Q18 | 🔴 待回覆（純文件，不擋實作） | — | — | — |
| Q19 | 🔴 待回覆（現況：交給 import 流程即送） | — | — | — |
| Q20 | 🟢 已定案：維持 spec 三入口，不含 present | Jay + PM | 2026-08-19 |
