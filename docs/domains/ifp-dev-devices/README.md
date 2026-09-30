# ifp-dev-devices domain

開發／測試用 IFP 實機的**機器特有行為**。這裡只放「換一台機器就可能不成立」的事：
每一條都寫出是哪台、哪天、怎麼查到的，下次遇到先照「怎麼查」重跑一次，不要直接套用。

證據等級照 [`.claude/rules/cross-system-claims.md`](../../../.claude/rules/cross-system-claims.md) §2：
**實測**（附指令與輸出）／**讀碼**／**推論**。

---

## IFP63 — `172.21.4.186:5555`

| 項目 | 值 |
|---|---|
| Android | API 35（Android 15） |
| 螢幕 | 3840×2160 @ 480 dpi |
| 連線 | `adb connect 172.21.4.186:5555`（網路 adb） |
| 用途 | edu-vbo（VBO-022 side toolbar）的 instrumented 測試機 |
| 系統服務 | seewo / CVTE 韌體：`com.seewo.osservice`、`com.viewsonic.dmagent`（device admin，有 `force-lock` 權限） |

### ⚠️ 5 分鐘沒偵測到人就休眠，醒來是鎖定畫面（2026-09-29 查到）

**症狀**：跑十幾二十分鐘的 connected test，中途整批紅；機器停在鎖定畫面。
設定裡「螢幕鎖定」是「無」，螢幕逾時也是最大值，看起來不應該鎖。

**原因一：人體感應（PIR）省電，不是螢幕逾時。** 〔實測〕

休眠是 `com.seewo.osservice`（pid 2418，uid 1000）裡的 `HumanIdentification` 發起的：

```text
16:13:55.567 I/HumanIdentification: Timeout for waiting human.
16:13:55.573 D/HumanIdentification: onTimeout
16:13:55.577 I/PowerGroup: Powering off display group due to application (groupId= 0, uid= 1000,
             millisSinceLastUserActivity=324641, lastUserActivityEvent=other)...
16:13:55.580 I/PowerManagerService: Going to sleep due to application (uid 1000,
             screenOffTimeout=2147483647, ...)
16:22:44.416 I/HumanIdentification: wakeup by detect human      ← 有人走到機器前
```

同一天 15:51、16:02、16:13、16:28 各觸發一次。相關的系統屬性：

```text
persist.sys.pir.enable.default = 1
persist.sys.pir.time.default   = 300     ← 秒
persist.sys.cvte.sleep         = 300
persist.sys.sleeptime.default  = 300
```

同時 `settings get system screen_off_timeout` = `2147483647`、
`stay_on_while_plugged_in` = `2`，`dumpsys power` 的 `mStayOn=true` —— **Android 那層的逾時設定全都無效**，
因為休眠是 app 直接呼叫 `goToSleep`。

〔推論〕測試用 UiAutomation 注入的觸控不算「有人」：PIR 看的是感應器，所以測試跑超過 5 分鐘就一定會被打斷。
沒有做過「注入觸控不斷、看它還會不會睡」的對照實驗。

**原因二：「無」鎖定其實底下還存著一組 PIN。** 〔實測〕

```text
$ adb shell settings get secure lockscreen.disabled
1
$ adb shell dumpsys lock_settings
  User 0
    CredentialType: PIN
```

所以設定頁顯示「無」（應該是讀 `lockscreen.disabled`），但 LockSettings 還有 credential，
一睡醒 keyguard 就出來，而且韌體的 bug 讓密碼輸入畫面不一定會出現（Jay 2026-09-29 目擊）。
機器上還有第二個使用者 `UserInfo{10:New user}`（沒在跑）。

**卡住時長什麼樣（2026-09-30 再次發生）**：休眠被喚醒後，鎖定畫面先出現「選擇使用者」，
但選了之後**不出現 PIN 輸入框**，人卡在那裡解不開，只能重開機。〔Jay 目擊〕

當下 adb 看得到的狀態〔實測〕：

```text
$ adb shell dumpsys window | grep -E "mCurrentFocus|isKeyguardShowing"
  mCurrentFocus=Window{… u0 NotificationShade}      ← 鎖定畫面本身
    isKeyguardShowing=true
$ adb shell dumpsys lock_settings | grep CredentialType
    CredentialType: PIN
$ adb shell am get-current-user
0
```

- **adb 截不到那個畫面**：`adb exec-out screencap -p` 出來是全黑、只剩底部一個返回箭頭（有 credential 的
  keyguard 不給截圖）。要留證據只能拿手機拍。
- 〔推論，未證實〕「先選使用者」應該是因為機器上有第二個使用者（user 10），而選完之後該接的 PIN 輸入畫面沒出來
  是 FW 的 bug——跟設定頁顯示「無」卻還存著 PIN 可能是同一件事。
- **處理**：重開機。重開後直接進桌面，不會要求輸入 PIN。

**怎麼處理**

1. 在機器的設定裡把「人體感應／PIR／有人偵測」類的節能選項關掉 —— 最根本。
   `persist.sys.*` 要 root 才能改，**不要用 adb 硬改**。〔推論：選單名稱沒親眼確認〕
2. PIN：〔推論，未實測〕在設定裡設一次 PIN 再改回「無」，看能不能讓 `CredentialType` 變成 `NONE`。
3. **工作規則（Jay 2026-09-30）：只要是 IFP，就每十分鐘點一次。** 目前用的是一支背景迴圈：
   - 每 600 秒先 `input keyevent KEYCODE_WAKEUP`，再點狀態列上緣的正中間（x = 寬度/2，y = 5）。這個位置
     不在白板、也不在 rail 上，白板不會多出墨點。
   - **有 instrumentation 在跑就跳過**：`ps -A` 看得到 `com.viewsonic.vbo.test` 或 `androidx.test` 時不點，
     因為點一下可能落在測試的 UI 上，把測試弄壞。
   - 每一次都記一行：時間、點之前有沒有上鎖、有沒有點。
   - 〔未證實〕點一下能不能重設人體感應的計時：PIR 看的是感應器，注入的觸控不一定算「有人」。
     有沒有效要看紀錄，看完再回來補結論。
   - 不要套在共用的 IFP35 上，那台是別的 session 在用。
4. 測試前的快速檢查：

   ```bash
   export ANDROID_SERIAL=172.21.4.186:5555
   adb shell dumpsys power  | grep -E 'mWakefulness=|mLastSleepReason'
   adb shell dumpsys window | grep isKeyguardShowing
   adb logcat -d | grep -E 'HumanIdentification|Going to sleep' | tail
   ```

   `mLastSleepReason=application` 加上 `HumanIdentification: onTimeout` 就是這一條；
   `isKeyguardShowing=true` 就要人去解鎖（不要嘗試用 adb 輸入任何 credential）。

**怎麼查到的**（下次換機器照這個順序）：`settings list system|secure|global` 找逾時與鎖定 →
`dumpsys power` 看 `mLastSleepReason` → logcat 抓 `Going to sleep` 前幾秒是誰 →
`ps -A` 對 pid → `getprop | grep -iE 'pir|sleep|energy'`。
