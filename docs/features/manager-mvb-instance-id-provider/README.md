# Manager 讀取 myViewBoard Instance ID（ContentProvider）

Manager（Software Instance 管理頁）需要知道「instance ID ↔ 裝置」的對應關係，
由 Android myViewBoard 透過 ContentProvider 提供給同裝置的 Manager agent 讀取，並限制呼叫端簽章。

> **最後更新：2026-08-21**（headless 成本拆解、preload 語意、MVBA 遷移衝突 ＋ `pending_reason`；新增 7 支單元測試）

## Jira

| Ticket | 團隊 | 摘要 | 狀態 |
|---|---|---|---|
| [VSFT-9654](https://viewsonic-vsi.atlassian.net/browse/VSFT-9654) | 星期六浩克（MVB） | [Manager integration] 提供 Manager 讀取得到 myViewBoard instance ID | ANALYSIS |
| [VB-1399](https://viewsonic-vsi.atlassian.net/browse/VB-1399) | Manager（SW Mgmt） | Story 7: myViewBoard Settings - 與 mvb 串接以取得 software instance id | 進行中（**dm 端尚無任何對接程式碼**） |

## Scope

- **只做 Android myViewBoard**（Windows 不需要）
- MVB 開 read-only ContentProvider，dm 讀取後帶著 serial number 回報雲端，完成 join

---

## 📌 已定案的決議（2026-08-17 會議）

| # | 決議 |
|---|---|
| 1 | **provider 只給 `entity_id`，不給 entity name** —— 票面原寫 entity name 係當初討論的誤會。dm 走**雲端**用 id 換 name，本地不比對 |
| 2 | **錯誤要回報**：新增 `error_code`（字串）/ `error_message`（僅供 log）資料列。⚠️ **「還沒有值」不是錯誤**，不可回 error_code |
| 3 | **存取控制採 runtime SHA-256 allowlist**，provider 全 flavor 提供 —— A31 上 dm 與 mvbf 跨 key，`signature` permission 不足 |
| 4 | **「更新後未開啟」的 edge case：PM（Peja）判定可接受** —— mvbf 更新週期早於 dm（dm 下次更新 12 月），真的發生時走客服回報 + 提示使用者 |
| 5 | **dm 主動開啟 MVB（有 UI）：排除** —— 行為太怪，雙方一致 |

## ✅ 進度與待辦

### 已完成並實機驗證（2026-08-19，Pixel Tablet `3629105H804NHC`）

**MVB 側**（mvbf 工作區，未 commit）
- [x] **headless 初始化** —— 實測「刪 prefs → `install -r` 觸發真正的 `MY_PACKAGE_REPLACED`」後，prefs 補回**完全相同**的 instance_id、**全程無 UI**。見 [findings §10](findings.html#headless-research)
- [x] **存取控制（package + 憑證 allowlist）** —— 正向 ＋ 兩個反向全通；反向刻意**保持 package name 不變、只換簽章**以隔離證明憑證檢查有效。見 [findings §11](findings.html#access-verify)
- [x] **`error_code` / `error_message`** —— 取代原本一律回 `null`
- [x] entity_name 移出曝光白名單（只給 `entity_id`）

**dm 側**（dm 工作區，未 commit；關鍵放 staged、hack 放 unstaged）
- [x] **`MvbInstanceInfoReader`** —— 真正的讀取 client（sealed interface 五種結果），非 log dump
- [x] **`requestInitialize()`** —— 讀到 `NOT_INITIALIZED` 時主動呼叫 provider 的 `call("ensureInitialized")`
- [x] **畫面 overlay** —— 狀態顯示在 `EnrollmentActivity`，測試不必盯 logcat（debug 用，unstaged）

**✅ 真實 IFP34 驗證通過**（見 [findings §16](findings.html#ifp-verify)）—— 原本「唯一剩餘的技術不確定性」已結案
- [x] 刻意挑低效能機（4 核、Android 14、user build）壓測時序：鏡射 **10.6s**、產生 **12.4s**（Pixel Tablet 約 2.2s／4s，慢約 5 倍），**仍在 20s timeout 內**
- [x] provider 註冊、存取控制、正常啟動鏡射、需求 3／3(c)／4 全通；Hive 內只有 1 個 id（競態防護在慢機上也站得住）
- [x] ⚠️ **timeout 餘裕僅約 7.6s** —— 若遇更慢機型或系統負載更重，可能需調高 `TIMEOUT_MS`（release 走 AOT 會更快，實際餘裕更大）

**✅ headless 啟動成本已拆解**（見 [findings §17](findings.html#headless-profile)）—— 結論：不需要第二個精簡 Dart 入口
- [x] 確認 headless **不會**跑 `main()`（已是獨立 `@pragma('vm:entry-point')` 入口，`_initApp()` 重鏈完全沒跑）
- [x] 分段量測：native／engine ~1.7s ＋ Dart ~1.8s；`new FlutterEngine()` 的 plugin 自動註冊只 **10–26ms** → `automaticallyRegisterPlugins=false` 無收益且會拔掉 `path_provider`／`device_info_plus`
- [x] 🐛 修正「同一次流程起兩顆 engine」（dm 重複觸發 × 守衛只看結果）→ 加第三層守衛 `sSyncInFlight`

**五項需求全數驗證通過**（見 [findings §13](findings.html#five-requirements)）
- [x] 1／2 舊版（有／無 Hive 資料）→ `MVB_TOO_OLD`（對 dm 不可區分，正確）
- [x] 3 新版首裝未開 → dm 主動觸發 → headless **產生** → **MVB 開啟後不重複產生**
- [x] 4 舊版→新版未開 → `MY_PACKAGE_REPLACED` → 鏡射 Hive 既有 id（完全相同）
- [x] 5 新版一律走 shared pref
- [x] **entity name 相關程式碼全部清除**（含 Pigeon 欄位、Hive key、`_getEntityID` 回傳型別）

**⚠️ 修掉一個實測可重現的競態**（[findings §15](findings.html#race)）
- [x] headless 與正常啟動是**同 process 的兩個 isolate**，而 `getInstanceID()` 讀記憶體快取；MVB 從 `_load()` 到 `ensureInitialized()` 隔十幾秒 → headless 若在此期間寫入，MVB 會**再產生一個 id**
- [x] 損害邊界：Hive/prefs 最終收斂（不損壞），但**中間窗口若被 dm 讀到，會把之後不存在的 id 回報雲端**（靜默錯誤）
- [x] **修法 A**：`schedule()` 與 `onStartJob()` 都檢查「app 是否正在跑」，是則跳過——app 在跑本來就不需要 headless
- [x] **修法 B**：產生前**即時重讀 Hive**（新增 `reloadInstanceIDAsync()`），讓「不重複產生」不依賴哪條路徑先跑
- [x] ⚠️ **驗證 B 時發現 Hive 有 lock 檔**（`activate.lock`），併發會**丟例外**（非靜默損壞）→ 反證守衛 A 是必要而非優化
- [x] ⚠️ **B 引入的新風險已一併修掉**：`ensureInitialized()` 在 `main()` 內無 try-catch，例外會被 `runZonedGuarded` 當致命錯誤 → **app 初始化中斷**。故 `reloadInstanceIDAsync()` 內部自行 catch 並退回快取
- [x] 回歸四項全通（競態時序、需求 3、需求 3(c)、需求 4）
- 殘留窗口已從十幾秒縮到微秒級；**完美解法（instance_id 單一寫入權威）列為未來項**，見 [findings §15.5](findings.html#race)

**端到端延遲實測**（[findings §14.1](findings.html#latency-timeline)）
- [x] dm 停在前景不動 → `pm clear` → **約 4 秒**完成（觸發 +1.7s、產生 +4.0s、dm 更新 +4.0s）
- [x] 最後一步是 **`notifyChange` 送達**（比輪詢早 4ms）→ 實際速度由通知決定，非輪詢

**過程中修掉的四個真問題**（[findings §13.1](findings.html#five-req-bugs)）
- [x] ⚠️ **既有 bug**：`shouldResetActivationStorage` 在 `saved == 0` 時誤判為 stage↔production 切換 → 首次啟動會清掉 headless 剛產生的 id。**此修正動到共用邏輯 `application_info.dart`，正式 PR 可拆獨立 commit**
- [x] headless 完成訊號抓錯（一次執行會鏡射兩次），engine 在產生途中被 destroy
- [x] `LateInitializationError: _isChromeOSCache` —— platformType 必須先初始化
- [x] ⚠️ **`registerContentObserver` 在 authority 不存在時會丟例外**（與 `query()` 回 null 不同）→ dm 端訂閱務必 try/catch

### 待辦

- [ ] **鏡射移出啟動關鍵路徑** —— dirty check 已完成（值有變才寫才通知，實測第二次啟動不重寫 prefs）；剩「掛 post-frame callback」這半（見 [contract §6.1](contract-proposal.html#mirror-cost)）。加了 dirty check 後穩態成本已只剩一次比對，價值比原評估低
- [x] ~~評估 `TIMEOUT_MS` 是否要調高~~ —— **已評估，維持 20s**。分段實測顯示成本是「Flutter VM／isolate 啟動 ~1.7s ＋ 必要 Dart init ~1.8s」，且 release 不需解壓 `kernel_blob.bin`（再省 ~0.7s），IFP34 的 12.4s 已是 debug 最壞情境（見 [findings §17](findings.html#headless-profile)）
- [ ] 與 Manager team 對齊 [Q4](open-questions.html#q4)：authority 命名慣例、版本演進策略定案、Story 8+ 還需要哪些欄位
- [ ] 順手清掉死設定：`AndroidManifest.xml` 仍宣告 `flutter_foreground_task` 的 ForegroundService，但該套件已不在 pubspec
- [ ] dm repo 的 `.gitignore` 未涵蓋 `bin/` —— `lint-rules/bin/`、`plugins/bin/`（IDE build 產物）會一直當 untracked 雜訊出現
- [ ] **Hive box 的存取序列化** —— `SecureDataStorage` 的四個入口（`reset` / `_load` / `_save` /
  `reloadInstanceIDAsync`）都是「open → 一串 `await` → close」。同一個 isolate 內雖然單執行緒，
  但**每個 await 點都是插隊點**：A 還在 `put`、B 走到 `close()`，A 的下一個 `put` 就撞
  `Box has already been closed`。保護還不對稱——`reloadInstanceIDAsync` 有 try-catch，
  **`_save()` 沒有**，拋出去會被 `runZonedGuarded` 當致命錯誤（同 [findings §15.4](findings.html#race) 那條路徑）。
  正解是一把 `Future` 佇列把四個入口串起來，順便讓同 isolate 的重複產生變成不可能。
  **暫不做**：目前沒觀測到此症狀（實測到的是<u>跨</u> isolate 的 `activate.lock`，已由 `sSyncInFlight` 解掉），
  而加鎖會改動所有存取路徑的時序，風險不小於它解決的問題。入口數量若再增加就該做。
  <br />（附帶結論：**「用完就 close」本身是對的、不要改成全程持有** —— box 只有 7 個 key 開銷極低，
  close 會 flush 對隨時斷電的 IFP 更安全，而且它把兩顆 engine 撞同一個 Hive 檔的窗口壓到最小。）
- [ ] **（未來項，非本票）instance_id 的單一寫入權威** —— 把「檢查+產生+寫入」原子化（跨 isolate 鎖）。現況 A＋B 已把競態壓到微秒級，故不急。詳見 [findings §15.5](findings.html#race)
- [ ] **（未來需求，非本票）原生 ＋ Flutter 共用的加密儲存** —— 只有在 provider 要曝光真正機敏欄位時才需要。選項已調查完畢：**SQLCipher 是最短路徑**（`sqflite_sqlcipher` 已在依賴中）。詳見 [contract §5.1](contract-proposal.html#shared-secure-storage)
- [ ] ~~提供 edge case 敘述給 Manager team~~ —— **headless 已可行 → 預計不需要**

## 程式碼落點

### mvbf（`edu-droid-flutter`）

> 📦 **改動位置（2026-08-21）：`master` 的工作區，未 commit。** 部分檔案已 staged、部分 untracked
> （新檔如 `InstanceInfoProvider.java`、`instanceinfo/`、`provider_info_mirror.dart` 都是 `??`）。
> ⚠️ **稽核時不要只用 `git diff`** —— 未追蹤的新檔它看不到，而且不會有任何警告（實際漏掃過一次 Java 側）。
> 要嘛掃檔案系統，要嘛先看 `git status` 的 `??`。
>
> ⚠️ 同一個工作區還有兩個**與本票無關**的改動：`lib/debug_credentials.dart`、`macos/Podfile.lock`。
> commit 時要排除。
>
> ⚠️ 這批改動**曾經**放在 stash，現已 pop 回工作區。`stash@{0}` 現在是別的東西
> （build.gradle signingConfig），**不要**照舊指引去 pop。

下列兩筆是同內容的 commit 版本，方便對照：

| 分支 | commit | 內容 |
|---|---|---|
| `Jay/tmp/vsft-9654-headless-experiment` | `fc203a9f1` | POC 本體（自 `02a4c99e6` cherry-pick，已改為 mvbf commit 格式）|
| 同上 | `7a874d3b8` | 存取控制 ＋ `error_code` ＋ headless（**已實機驗證**）|
| `feature/VSFT-9654-instance-info-provider` | `02a4c99e6` | 原始 POC（未合 master，master 已前進 111 個 commit）|

> 開正式票時從 `Jay/tmp/vsft-9654-headless-experiment` 出發——已基於近期 master 且含全部驗證過的改動。

⚠️ 本輪另修了 `lib/application_info.dart`（`shouldResetActivationStorage` 的守衛）——**那是共用邏輯的 bug 修正、非 provider 專屬**，正式 PR 時可拆成獨立 commit。詳見 [findings §13.1 ①](findings.html#five-req-bugs)。

### dm（`edu-dm-agent-monorepo`）

`develop` 工作區，**未 commit**，刻意分成兩堆：

| 區 | 檔案 | 性質 |
|---|---|---|
| **staged** | `mvb/MvbInstanceInfoReader.kt`（新）、`services/DMService.kt` | **關鍵**：讀取 client ＋ 掛載點 |
| **unstaged** | `function/…/ModelFactory.kt`、`app_edla/…/AndroidManifest.xml`、`services/DMService.kt`（另一半）、`ui/enrollment/EnrollmentActivity.kt` | **本機 hack**：讓 dm 跑在非 IFP 裝置 ＋ debug overlay，皆有 `LOCAL-DEV HACK` 註解，**勿 commit** |

四處 hack 對應 [findings §7](findings.html#experiment) 的障礙 #1／#2′／#3／#4，以及 §12.3 的 overlay。

> ⚠️ `PROJECT_MEDIA` appop 的做法已淘汰——它**隨 dm 每次卸載重置**，改為直接從 `WorkerService` 移除 `mediaProjection` FGS type（見 §7 障礙 2′）。

## 文件索引

| 檔案 | 內容 |
|---|---|
| [overview.html](overview.html) | 總覽：兩票分工、資料流圖、為什麼不是 enroll 帶 serial |
| [findings.html](findings.html) | 程式碼調查結果（Hive 機制與實機驗證、儲存保護、簽章配置、POC 實作與結果） |
| [open-questions.html](open-questions.html) | **會議用文件** —— 每題的狀態、結論、要對方確認的事項（含浮動筆記功能） |
| [contract-proposal.html](contract-proposal.html) | Provider contract：合約形狀、存取控制、v1 keys、錯誤回報、鏡射機制、版本策略、未初始化處理 |
| [basics.html](basics.html) | 🎓 **基礎知識筆記** —— IPC/Binder、static 為何共享、四大元件、ContentResolver/Provider、JobService、完整呼叫流程、Flutter engine/isolate/entry point、plugin vs 手寫 channel、prefs/Hive 併發、adb 小抄。純學習用，不含決策 |
| [dm-handoff.html](dm-handoff.html) | 🤝 **給 dm 側 RD 的開工 prompt** —— 可直接複製。契約規格、要做的事、六個實測踩過的坑、驗收情境。自足（不引用本 KB 路徑），對方 clone 專案 repo 就能用 |
| [investigation.md](investigation.md) | 早期調查問題清單（已多數收斂，保留供追溯） |
