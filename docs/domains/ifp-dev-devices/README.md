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

**機型與韌體（2026-09-30 讀取）**〔實測，`adb shell getprop` / `dumpsys package`〕

下面「Sensor Settings」的位置，是在這張表的版本上實際點過、確認過的。韌體更新**有可能**讓位置改變，但不一定。
所以版本跟這張表不同時，照著點的時候多看一眼：
- 位置一樣：在這張表旁邊補一行「新版本也一樣」，記下版本號；
- 位置真的變了：另外記一份新的，舊的保留，不要直接覆蓋。

| 項目 | 值 |
|---|---|
| 型號 | `ro.product.model` = **IFP63**；設定 → About 顯示 **IFP6563**（`settings get global device_name`） |
| 品牌／製造 | ViewSonic / ViewSonic |
| SoC | `ro.board.platform` = **rk3588**（Rockchip） |
| CVTE flavor | `ro.cvte.flavor.name` = **viewsonic_pcap_edla** |
| Android | 15（API 35），security patch **2025-05-05** |
| Build | `ro.build.display.id` = **AP3A.241005.015.A2 release-keys**，incremental **20250625**（Wed Jun 25 21:00:10 CST 2025） |
| System fingerprint | `ViewSonic/IFP63_Series/IFP63:15/AP3A.241005.015.A2/20250625:user/release-keys` |
| Vendor／ODM fingerprint | `ViewSonic/IFP63_Series/IFP63:14/UQ1A.240205.004.B1/20250625:user/release-keys`（vendor 還是 14 的 base） |
| Bootloader | `ro.boot.fwver` = ddr-v1.18-9fa84341ce, spl-v1.13, bl31-v1.49, bl32-v1.19, uboot-f06c049d61-06/25/2025 |
| 設定 app | `com.ifpdos.vsettings` **2.0.0.54**（`em-stable*7edf1e31-2.0.0.54*vesncpa_da`）；`com.ifpdos.settingsext` **2.0.0.50** |
| 休眠服務 | `com.seewo.osservice` **2.1.16.98**（`em-stable*af5a7723e-2.1.16.98*vesncel`） |
| 以上三個 app 最後更新 | 2026-09-11 09:51:30 |

重讀的指令：

```bash
export ANDROID_SERIAL=172.21.4.186:5555
for p in ro.product.model ro.build.display.id ro.build.version.incremental ro.cvte.flavor.name; do echo "$p=$(adb shell getprop $p)"; done
for pkg in com.ifpdos.vsettings com.ifpdos.settingsext com.seewo.osservice; do adb shell dumpsys package $pkg | grep -m1 versionName; done
```

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

1. **關掉人體感應（找到開關了，2026-09-30）：設定 → Advanced → Sensor Settings → Motion sensor → 關。**〔實測〕
   適用：**IFP63，build 20250625，`com.ifpdos.vsettings` 2.0.0.54**（見上面的機型表）。版本不同時位置**可能**一樣、也可能變了，照著點的時候確認一下（見上面的機型表）。
   - **一步一步**（英文介面；設定 app 是兩欄式，左邊選單、右邊內容）：
     1. 桌面的 **Settings** 圖示。開出來的是 `com.android.settings`，它的 Advanced 頁由 `com.ifpdos.settingsext` 提供。
     2. 左欄往下捲，點 **Advanced**（副標「Startup, input source, advanced settings」）。
     3. 右欄會列出：Startup & shutdown／Input source／Security settings／Pen Detection／Pen Detection App／HDMI OUT
        format／TYPEC OUT format／**Sensor Settings**。**Sensor Settings 在最底下，被底部導覽列蓋住**；先把右欄往上捲，
        再點。直接點到的會是 Home 鍵，會跳回桌面。
     4. **Sensor Settings** 頁有三項：**Motion sensor**（開關）、**Static power off interval**（出廠 5 mins）、
        Sensor data notification（溫溼度／CO2／PM2.5／VOC 的顯示）。把 **Motion sensor 關掉**，interval 會跟著變灰。
     5. 進 Sensor Settings 不用輸入密碼。〔實測〕
        - 第一次用 adb 捲動 Advanced 那一頁時，彈出過一次「Input Current password」。〔推論〕應該是手勢誤觸了
          **Security settings**，沒有重現過。
        - 跳出來就按 Cancel。**不要用 adb 幫忙輸入任何密碼。**
   - 用 adb 遠端操作的話：先 `uiautomator dump` 找 `text="Sensor Settings"` 的座標，確認 y 比導覽列高（4K 畫面約 y < 1900）
     再 `input tap`。開關是 `android:id/switch_widget`，看 `checked` 確認狀態。
   - 截圖：關閉前 `img/ifp63-sensor-settings-motion-on.jpg`、關閉後 `img/ifp63-sensor-settings-motion-off.jpg`。
   - 同一頁還有 **Static power off interval**（出廠 5 mins，就是「5 分鐘沒偵測到人就睡」的那個值）。Motion sensor
     關掉之後，這一項會變灰。另一項 Sensor data notification 是溫溼度、CO2 的顯示，跟休眠無關。
   - 不需要密碼。要注意的是 Sensor Settings 在 Advanced 清單的最底下，會被底部導覽列蓋住，
     要先把右欄往上捲，否則點到的是 Home。
   - 這個開關在 `com.ifpdos.vsettings` 的 `SensorSettingsFragment`（`pir_detect_spinner` / `KEY_PIR_STATE`）；
     真正讓機器休眠的是 `com.seewo.osservice` 的 `HumanIdentificationService`。
   - 設定裡找不到任何 pir / human 的 key，`persist.sys.*` 也要 root 才能改，**不要用 adb 硬改**。
   - 2026-09-29 那次「在設定頁關了卻沒效」，應該是改到了別的節能選項。
   - **驗證**：關掉後閒置 7 分鐘（17:00:57–17:07:57）。這段時間沒有 `Timeout for waiting human`、沒有
     `Going to sleep`，服務只記 `PIR state is off, has person, but can't set screen status to true`；機器保持醒著、沒上鎖。
2. PIN：〔推論，未實測〕在設定裡設一次 PIN 再改回「無」，看能不能讓 `CredentialType` 變成 `NONE`。
3. ~~工作規則：只要是 IFP，就每十分鐘點一次。~~ **已廢止**（Jay 2026-10-01：「「每十分鐘點一次」這條規則不用留」）。
   實測點擊沒有效果，真正的解法是第 1 點，把 Motion sensor 關掉。以下保留當時的做法與實測紀錄，作為參考：
   - 每 600 秒先 `input keyevent KEYCODE_WAKEUP`，再點狀態列上緣的正中間（x = 寬度/2，y = 5）。這個位置
     不在白板、也不在 rail 上，白板不會多出墨點。
   - **有 instrumentation 在跑就跳過**：`ps -A` 看得到 `com.viewsonic.vbo.test` 或 `androidx.test` 時不點，
     因為點一下可能落在測試的 UI 上，把測試弄壞。
   - 每一次都記一行：時間、點之前有沒有上鎖、有沒有點。
   - 〔實測 2026-09-30：**無效**〕點一下**不會**重設人體感應的計時。
     - 15:50 和 16:00 各點了一次，16:06:38 照樣 `HumanIdentification: Timeout for waiting human` 睡著。
     - 16:11:38 點完，16:17:20 又逾時。
     - 醒來也還是停在鎖定畫面。
     - 真正的解法是上面第 1 點。
   - 〔實測〕「跑測試時跳過」的判斷用 `ps -A` 找 `com.viewsonic.vbo.test` 會漏掉：測試跑在 app 自己的
     process 裡，所以那次在測試中途點下去了。要改成看 `am instrument` 或 UTP 的 process。
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
