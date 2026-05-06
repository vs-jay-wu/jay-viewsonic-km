---
name: jk-standalone-login
description: ClassSwift Standalone Login 自動化 — 打開 ClassSwift stag app、點擊 ViewSonic 登入、自動處理 WebView 輸入帳密與「記住登入資訊」dialog，最後抵達 SelectOrg 選擇組織畫面。Use this skill whenever the user wants to auto-login ClassSwift on the tablet — e.g. '/jk-standalone-login', 'standalone login', 'log into ClassSwift', 'ClassSwift 登入', '登入 ClassSwift', 'ClassSwift 自動登入', 'auto-login the app', 'standalone 流程'. Also trigger when the user describes the flow as "tap ClassSwift icon → ViewSonic login → reach SelectOrg".
---

# ClassSwift Standalone Login 自動化

自動化 ClassSwift staging build 的 standalone login flow：從點擊 app 到抵達「選擇組織」畫面。

## Test Credentials

| Field | Value |
|-------|-------|
| Email | `dillon.cy.chang@viewsonic.com` |
| Password | `Qa@123456` |

> ⚠️ 此 skill 檔位於 `.claude/`（已列於 `.gitignore`），不會 push 到 repo。
> 帳號僅供本機自動化測試使用。

## Device

- SM-X520, adb ID `R52Y60E4GEW`, resolution 2304×1440（landscape）
- App package: `com.viewsonic.classswift.stag`（有 Stage badge 的 ClassSwift icon）

## Flow Overview

根據系統是否有 cache，登入後會走三條路徑之一。Skill 必須能判斷目前停在哪一步並接上：

1. **Fully uncached** → Chrome Custom Tab 開啟 → 輸入帳密 → 「記住登入資訊」dialog → 選擇組織
2. **Credentials cached only** → 直接跳「記住登入資訊」dialog → 選擇組織
3. **Fully cached** → 直接跳「選擇組織」overlay（不會出 dialog）

成功條件：`dumpsys window windows` 裡 `com.viewsonic.classswift.stag` 顯示 `appop=SYSTEM_ALERT_WINDOW`，並且 `mobile_screenshot` 可見「選擇組織」標題。

## Important Learnings

- **Launch 請用 `mobile_open_app`** — 直接 tap app drawer 的 icon 位置容易受頁面切換影響，`mobile_open_app com.viewsonic.classswift.stag` 最可靠。
- **SelectOrg 是 `SYSTEM_ALERT_WINDOW` overlay** — `mobile_dump_ui` 看不到。必須用 `adb shell dumpsys window windows | grep com.viewsonic.classswift.stag` 或 `mobile_screenshot` 確認。
- **Chrome Custom Tab 的 WebView 輸入欄位無 QA ID** — 只能用 `mobile_tap` + `mobile_type`，用靜態座標。鍵盤開啟時元素位置會變動。
- **Google Credential Manager 會攔截** — 若 device 已為其他 viewsonic.com 帳號存過密碼，tap account field 後可能跳出「使用已儲存的密碼？」dialog。按 `back` 鍵 dismiss，再重新 tap field 輸入。
- **Display-over-other-apps 權限** — 第一次執行若遇到 "顯示於其他應用程式上方？" dialog（`tv_title`），tap "允許"（`cslb_allow`）→ 進入 Settings → tap ClassSwift 對應的 switch 打開 → 按 back 回到 app。只需一次。
- **LoginActivity 會被 overlay 取代** — 進入 SelectOrg 時，topResumedActivity 會切到 `com.sec.android.app.launcher`（因為 overlay 在 launcher 之上）。別誤以為 app 關掉了。

## Activity Identifiers

| Activity | Component |
|----------|-----------|
| LoginActivity | `com.viewsonic.classswift.ui.activity.LoginActivity` |
| WebView (sign in) | `com.android.chrome/org.chromium.chrome.browser.customtabs.CustomTabActivity` |
| SelectOrg overlay | Window `com.viewsonic.classswift.stag` with `appop=SYSTEM_ALERT_WINDOW` |

## Element Identifiers — LoginActivity (via `mobile_dump_ui`)

| Element | ID | Bounds | Center |
|---------|-----|--------|--------|
| Close button | `iv_close` | [1589,427][1626,464] | (1607, 445) |
| Logo | `iv_normal_icon` | [864,522][1051,650] | (957, 586) |
| ViewSonic login card | `mcv_root` / `tv_title`="使用 ViewSonic 帳號登入" | [713,669][1194,748] | (953, 708) |
| Google SSO | `ll_google` | [885,815][957,887] | (921, 851) |
| Microsoft SSO | `ll_mircosoft` | [971,815][1043,887] | (1007, 851) |
| QR Code login text | `tv_qrcode_login` | [1310,503][1555,562] | — |

## Element Identifiers — Save Login Info Dialog

| Element | ID | Text | Bounds | Center |
|---------|-----|------|--------|--------|
| Title | `tv_title` | 記住登入資訊 | [827,533][1478,610] | — |
| Message | `tv_message` | 是否記住我的登入資訊? | [827,612][1478,794] | — |
| Cancel | `bt_negative` | 取消 | [827,796][1152,876] | (990, 836) |
| Save | `bt_positive` | 儲存 | [1154,796][1478,876] | (1316, 836) |

## WebView Coordinates — Sign In Page

WebView 內容無 QA ID，用靜態座標（鍵盤關閉時量測）：

| Field | Center | Notes |
|-------|--------|-------|
| Account input | (1150, 858) | 鍵盤開啟後位置會上移 |
| Next button | (1150, 985) | email 步驟 |
| Password input | (1150, 817) | 輸入 email 進入下一頁後才出現 |
| Sign In button | (1150, 1010) | password 步驟 |

## Automated Flow

```
1. 檢查 adb device: adb devices → 確認 R52Y60E4GEW 連線
2. (可選) 清 cache 測試 non-cached 路徑:
   adb shell pm clear com.viewsonic.classswift.stag
   adb shell pm clear com.viewsonic.droid
3. Launch app:
   mobile_open_app("com.viewsonic.classswift.stag")
   sleep 3s
4. 處理權限 dialog（若出現 tv_title="顯示於其他應用程式上方？"）:
   tap cslb_allow → Settings 出現 → tap switch_widget 打開對應 ClassSwift →
   key_press back → 回到 LoginActivity
5. 確認 LoginActivity:
   dump_ui → 看到 mcv_root + tv_title="使用 ViewSonic 帳號登入"
6. Tap ViewSonic login:
   mobile_tap(953, 708)
   sleep 4s
7. 判斷下一步（用 adb shell dumpsys activity activities | grep topResumedActivity）:
   a) CustomTabActivity → 進入 WebView flow（step 8）
   b) LoginActivity + dump_ui 看到 tv_title="記住登入資訊" → 跳到 step 12
   c) launcher + dumpsys window 看到 SYSTEM_ALERT_WINDOW → 已到 SelectOrg（step 14）
8. WebView — account:
   mobile_tap(1150, 858)
   若出現 Google Credential Manager（screenshot 確認 "使用已儲存的密碼"）:
     mobile_key_press back
     mobile_tap(1150, 858) 再次聚焦
   mobile_type("dillon.cy.chang@viewsonic.com")
9. WebView — next:
   mobile_tap(1150, 985)
   sleep 3s
10. WebView — password:
    mobile_tap(1150, 817)
    mobile_type("Qa@123456")
11. WebView — sign in:
    mobile_tap(1150, 1010)
    sleep 5s（等 auth round-trip + redirect 回 LoginActivity）
12. 儲存登入資訊 dialog:
    dump_ui 確認 bt_positive 存在
    mobile_tap(1316, 836)
    sleep 3s
13. 確認抵達 SelectOrg:
    adb shell dumpsys window windows | grep "com.viewsonic.classswift.stag" → 應看到 SYSTEM_ALERT_WINDOW
    mobile_screenshot → 應看到「選擇組織」標題
14. 完成 — skill 不需進一步 tap「選擇」按鈕，登入流程到此結束
```

## Verification Checklist

登入成功的判定，必須同時滿足：

- [ ] `adb shell dumpsys window windows | grep com.viewsonic.classswift.stag` 顯示 `appop=SYSTEM_ALERT_WINDOW`
- [ ] `mobile_screenshot` 可看到「選擇組織」標題 + 至少一個 org 列表項目 + 「登出」與「選擇」按鈕

## Troubleshooting

- **Tap ViewSonic login 後什麼都沒發生**：可能是 overlay 權限沒開。檢查 logcat 有沒有 "SYSTEM_ALERT_WINDOW permission" 相關錯誤，重跑 step 4。
- **WebView 輸入 email 後 Next 沒反應**：可能 Google Credential Manager popup 在前面擋住。截圖確認，按 back dismiss 後重新輸入。
- **「記住登入資訊」dialog 的 bt_positive tap 後沒進 SelectOrg**：有時需要 3-5 秒才出現 overlay，別急著判失敗；用 `dumpsys window` polling 一次再判斷。
- **App drawer 上有兩個 ClassSwift icon**：帶 Stage badge 的才是 `com.viewsonic.classswift.stag`（staging），另一個是 `com.viewsonic.classswift.aosp`。這個 skill 只處理 stag。
