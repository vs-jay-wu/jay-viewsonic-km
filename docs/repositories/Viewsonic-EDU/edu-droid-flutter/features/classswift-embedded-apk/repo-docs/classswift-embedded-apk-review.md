<!--
==============================================================
SOURCE TRACKING — 來源為 PR branch 內的 repo 文件，合併 / 更新後請重新 clone
==============================================================

repo:           Viewsonic-EDU/edu-droid-flutter
path:           docs/classswift-embedded-apk-review.md
branch:         stephen/VSFT-9785-classswift-embedded-apk (PR #208, 尚未合併)
commit:         184695066eb6d320b4f33b7af3b4711ba46a1373
cloned_at:      2026-07-31

Maintenance rule: PR 有新 commit 或合併進 master 後，重新 git show 覆寫此檔，
                  並同步更新 commit / cloned_at，commit 訊息附 PR URL。
==============================================================
-->

> | 來源 | branch | commit | clone 日期 |
> |---|---|---|---|
> | [docs/classswift-embedded-apk-review.md](https://github.com/Viewsonic-EDU/edu-droid-flutter/blob/stephen/VSFT-9785-classswift-embedded-apk/docs/classswift-embedded-apk-review.md) | `stephen/VSFT-9785-classswift-embedded-apk` | `1846950` | 2026-07-31 |

# ClassSwift 內嵌 APK — 決議記錄與風險分析

設計與實作見 [classswift-embedded-apk.md](classswift-embedded-apk.md)。本文記錄開發過程中的決議、
review 找到的問題，以及已知的流程 / 邊界 / 競態分析。Jira: VSFT-9785。

---

## 一、決議記錄

| # | 議題 | 決議 | 理由 |
|---|---|---|---|
| D1 | 內嵌 apk 與 OTA 下載的關係 | **完全取代**，不保留 OTA fallback | 目標是停止從 server 下載；保留 fallback 等於整套下載程式碼都要留著 |
| D2 | 安裝時機與 UX | 啟動後背景靜默安裝；`ClassSwiftUpdatingDialog` 只在使用者於安裝完成前點 ClassSwift 時出現 | 不要在使用者沒操作時彈出系統安裝畫面 |
| D3 | apk 來源 | `classswift_pin.json` 鎖 tag，CI build 時下載並驗 sha256；apk 不進 repo | 可重現、換版是可 review 的變更、避免 repo 膨脹 |
| D4 | 版本 bump 的交付方式 | 提供 `commit` / `pr` 兩種模式，排程預設 `commit` | 日常自動跟版用 commit；風險版本或手動指定 tag 時用 pr |
| D5 | Beta Program | 只下載 beta 版 MVB，不再另抓 beta CS | 目前這包內嵌的是自己 release target 的 CS，抓不到 beta 版；beta MVB 自己就帶著 beta CS |
| D6 | 與 MDM（MVB_QuizTool）派送並存 | **移除 MDM 派送**（ragdoll-cat `_deploy-mvb.yml`），不再需要 | 兩個版本來源會互相覆蓋；內嵌後 MDM 派送失去意義 |
| D7 | 解出的 apk 何時清理 | **安裝成功後立即刪**；安裝失敗時保留供 retry 直接重裝 | 避免 ~15 MB 長期佔用外部空間 |
| D8 | region gate 尚未開啟時 | 掛監聽，gate 打開後**自動補觸發一次** | 全新裝置首次開機時 gate 需等 API 回來，否則該次開機不會安裝 |
| D9 | ClassSwift 的 `--split-per-abi` | **接受現況**：每個 ABI APK 各含完整 15 MB CS apk | 見下方說明 |

### D9 說明

MVB 的 stage / beta / production 都以 `--split-per-abi` 產出多個 ABI APK，而 **assets 不隨 ABI
拆分**，因此每個 ABI APK 都含完整的 15 MB CS apk。曾評估過三個方向：

- (a) ClassSwift 改為 per-ABI 產出、MVB 每個 ABI 各跑一次 build 內嵌對應版本 —— 體積最省，
  但單一 gradle build 產出的多個 ABI split 共用同一份 assets，必須把 MVB 的 build 拆成多次，
  build 時間乘上 ABI 數量。
- (b) MVB 不再 `--split-per-abi`，只出 universal —— 改動最小，但單一 APK 變大。
- (c) **接受現況**（採用）。

後果：S3 儲存與裝置下載量都會因每個 ABI 各背一份而上升（見 E1 / E2）。若日後體積成為問題，
(a) 是效果最好的方向。

### 待決事項

- **D6 的實作**：`_deploy-mvb.yml` 位於 ragdoll-cat repo，需另開 PR 移除。

---

## 二、Review 找到並已修正的問題

| # | 問題 | 影響 | 狀態 |
|---|---|---|---|
| B1 | 實際 APK 的 `versionName` 是 `1.6.3-stag`，不是 tag 的 `1.6.3`；原生端做嚴格字串比對 | 所有 stage / rc 版都會被判定為「與 metadata 不符」而拒裝 | 已修：比對前正規化為數字 major.minor.patch，與 Dart `compareVersion` 同規則 |
| B2 | `installed \|\| silentInstallResult == true` 寫在共用區段 | 改掉既有 dialog 路徑「只信版號變更」的保守判定；plugin 誤報成功時會關閉 dialog 並嘗試喚起沒裝好的 CS | 已修：只作用於背景路徑，並補回歸測試 |
| B3 | 背景安裝直接 `await startSilentInstallApk` | 該 API 實測可能不回傳，coordinator 會永遠停在 `InProgress`，之後開的 dialog 一直轉圈 | 已修：沿用既有 30 秒輪詢機制 |
| B4 | `ClassSwiftInstallNotNeeded` / `Completed` 是終端狀態，`ensureInstalled` 在非 Idle 一律 return | 本次啟動判定完之後 ClassSwift 才被移除時，使用者點 ClassSwift 只會看到 Error 32，按 retry 也沒用，**必須重開 MVB 才能重裝** | 已修：新增 `restart()` 入口，dialog 開啟時重新評估 |
| B5 | `classswift-bump.yml` 的 PR body heredoc 寫在第 0 欄 | 提前終止 YAML block scalar，整個 workflow 無法 parse | 已修：heredoc 內文對齊 block scalar 縮排 |
| B6 | 原生 `while (in.read(buf) > 0)` | AssetManager 壓縮串流歷史上有回傳 0 的實作，會早退產生截斷檔案 | 已修：改為 `!= -1` |
| B7 | `NotNeeded` 在 dialog 顯示為錯誤（Error 32） | 「已是最新」被當成失敗丟給使用者；也讓「背景安裝剛好在 bloc 判定與 dialog 開啟之間完成」的競態顯示錯誤 | 已修：視為安裝完成，喚起 ClassSwift 並關閉 |
| B8 | dialog `initState` 直接套用 coordinator 現有（可能過時的）狀態 | **B4 修正本身的漏洞**：過時的 `NotNeeded` / `Completed` 會讓 `_handleInstalled()` 排入的 post-frame callback 早於 `_start()` —— dialog 先關閉、widget 被 dispose，`restart()` 再被 `isCancelled(!mounted)` 擋掉。使用者看到「安裝成功」但實際什麼都沒裝，且 ClassSwift 喚起失敗 | 已修：開啟時一律顯示 loading，全部交給 `_start()` 重新評估 |
| B9 | 內嵌 apk 的 `packageName` 從未與 MVB 期待的 package 比對 | CI 埋錯 flavor 時（workflow 寫死 `release-target`、App 執行期由版號推導），`getInstalledVersion()` 永遠查不到 → `isUpdateAvailable` 永遠 true → **每次啟動都解壓 15 MB 並安裝一個 MVB 永遠 bind 不到的 package** | 已修：`ensureInstalled` 比對 `getPackageNameForReleaseTarget`，不符即 `Failed(apkNotEmbedded)` |
| B10 | `retry()` 沿用 `ClassSwiftInstallFailed.filePath` 但不確認檔案還在 | 解出的 apk 若已不存在（清除 App 資料、外部儲存卸載），每次 retry 都打同一條失效路徑並重新 emit 同樣的 Failed，**使用者卡在無限失敗迴圈，只能重開 MVB** | 已修：重試失敗後不再帶 filePath，下一次 retry 重跑整輪（含重新解壓），可自我修復 |
| B11 | bump workflow 只檢查三種 flavor 的 APK，沒檢查 `.sha256` | `gh release download` 帶兩個 `--pattern` 只要其中一個命中就成功，缺 checksum 的 release 會通過自動 bump、commit 進 master，然後讓所有 MVB build 在 `sha256sum -c` 因找不到檔案而失敗 | 已修：守衛改為每種 flavor 都要有 APK **與** `.sha256` |
| B12 | 解出的 ~15 MB 在「安裝其實成功、但 `install()` 回報失敗」時永久殘留 | `extract()` 內的清理只有真的要解壓時才跑得到，而一旦判定「已是最新」就再也不會解壓。實際情境：使用者中途關閉 dialog 讓 `install()` 提早回 false，silent install 稍後其實成功 → 那份檔案留到重灌為止 | 已修：新增原生 `cleanupExtractedApks`，判定不需安裝時回收 |
| B13 | `retry()` 沿用 filePath 時不重新確認是否仍需安裝 | 承 B12 情境：ClassSwift 其實已裝好，retry 仍會重裝同一版 → 版號不變 → 退回 PackageInstaller，**讓使用者對著早就裝好的 app 看系統安裝畫面** | 已修：retry 前先 `isUpdateAvailable()`，不需要就轉 `NotNeeded` 並回收殘留檔 |
| B14 | `isUpdateAvailable()` 在「沒有內嵌 apk」時一律回 false，即使 ClassSwift 根本沒安裝 | `ClassSwiftBloc` 用它決定 `needInstall`。回 false 會讓 toggle 跳過 dialog **直接 bind 一個不存在的 package**，使用者只拿到無法解讀的失敗，而不是明確的 Error 36 | 已修：未安裝時一律回 true（非 IFP/EDLA 除外），交由 dialog 顯示原因 |
| B15 | 安裝被取消時記成 `Failed` | `install()` 取消與失敗都回 false。把取消記成 Failed 會蓋掉原本健康的 `Completed`，並讓後續 retry 誤以為真的裝失敗 | 已修：取消時回到 `Idle`，下次重新評估 |
| B16 | CI 埋錯 flavor 與「這包沒有內嵌 apk」共用 Error 36 | 現場分不出是哪一種，正好抵銷這道守衛存在的意義 | 已修：新增 `packageMismatch(38)` |
| B17 | gating 擋下時不 emit 任何狀態，留在 `Idle` | 使用者主動開啟的 dialog 會把 `Idle` 畫成 loading，**永遠轉圈且沒有 retry 按鈕**，只能按關閉 | 已修：`restart()`（使用者主動路徑）在 gating 擋下後 emit `Unavailable`；背景路徑維持 Idle + 監聽 |

### 檢視後判定為刻意設計、不修改的項目

- **IFP52_2 的背景安裝**：`silentInstall: true` 現在也套用 `device != IFP52_2` 的排除（原本只有 dialog
  路徑排除）。代價是 owner 的 IFP52_2 拿不到「開機就裝好」；但若不排除，非 owner 的 IFP52_2
  會在**每次開機**被 `startSilentInstallApk` 卡住系統 90 秒。兩害相權取輕，維持排除，
  已記錄於 F5。

---

## 三、使用者流程

| # | 流程 | 結果 |
|---|---|---|
| F1 | 全新 IFP 開箱，production 首次開機 | region gate 無快取 → 掛監聽並略過；`refresh()` 回來後補觸發 → 解壓 → silent install → 刪暫存 → `Completed`。使用者點 Quiz Tool 直接啟動，全程不需網路 |
| F2 | MVB OTA 更新到內嵌較新 CS 的版本 | 重啟後版號比對發現內嵌較新 → 背景靜默升級，使用者無感 |
| F3 | 使用者在背景安裝完成前就點 Quiz Tool | dialog 開啟，觀察到 `InProgress` → 顯示 loading，不重跑；完成後喚起 CS 並自動關閉 |
| F4 | 非 owner 帳號，silent install 被系統拒絕 | 背景進 `Failed` → 使用者點 Quiz Tool → dialog 直接 `retry(allowUserPrompt: true)`（沿用已解出的 apk）→ 退回 PackageInstaller → 使用者確認安裝 |
| F5 | IFP52_2 | 背景必然失敗（該機型跳過 silent install，避免卡 90 秒）→ 同 F4，使用者主動點才會看到系統安裝畫面 |
| F6 | 使用者在系統安裝畫面按取消 | `install()` 回 false → `Failed` → dialog 顯示 Error 34 + retry 按鈕 |
| F7 | 安裝進行中使用者關閉 dialog | `isCancelled` 偵測到 → 提前中止且不彈系統安裝 UI → `Failed`；下次點 ClassSwift 再 retry |
| F8 | ClassSwift 已是最新 | `NotNeeded` → 使用者點 Quiz Tool 時 dialog 視為已可用，喚起 CS 並關閉 |
| F9 | ClassSwift 在 MVB 執行期間被移除 | 使用者點 Quiz Tool → bloc 判定需要安裝 → dialog `restart()` 重新評估 → 重新安裝（B4 修正前此流程會卡死） |
| F10 | MVB rollback 到舊版 | 舊 MVB 內嵌舊 CS，裝置上是新 CS → 不降級，舊 MVB 搭新 CS 執行（見 E4） |

---

## 四、邊界情況

### 打包與發佈

| # | 情況 | 說明 |
|---|---|---|
| E1 | MVB 的 OTA 下載量每次多 15 MB | CS 的體積從「CS OTA」搬到「MVB OTA」，不是消失。即使 CS 沒改版，每次 MVB 更新都要多下載 |
| E2 | `--split-per-abi` 使體積倍增 | assets 不隨 ABI 拆分，每個 ABI APK 各含完整 15 MB。已決議接受現況（D9） |
| E3 | `noCompress += 'apk'` 是全域規則 | 未來任何 `.apk` 資產都會被 stored。目前只有這一個 |
| E4 | rollback 無法連帶降級 CS | 只在內嵌版較新時安裝，不降級。舊 MVB 可能搭到不相容的新 CS |
| E5 | `dev` release target 沒有對應 flavor | ragdoll-cat 只產 Stag / Rc / Prod，`com.viewsonic.classswift.service.dev` 不在內嵌範圍 |
| E6 | Play Store 包不受影響 | 已用實際 build 驗證：`store` / `open` 的 merged assets 不含 CS apk |
| E7 | 簽章相容性 | 已驗證：OTA bucket 上的 apk 就是同一個 release asset 改名上傳，同一個 artifact、同一把簽章，覆蓋安裝不會 `INSTALL_FAILED_UPDATE_INCOMPATIBLE` |
| E8 | 本地 build 未執行 `make fetch-classswift` | 沒有內嵌 apk → `Unavailable`，跳過安裝，不會 crash |

### 執行期

| # | 情況 | 說明 |
|---|---|---|
| E9 | 完全離線的教室（production、無 region 快取） | 內嵌 apk 本身不需網路，但 **region gate 拿不到 toggle 就永遠不開**，CS 仍然裝不起來。原本 OTA 版也一樣裝不起來，不算回歸，但「離線可用」這個賣點實際上被 region gate 擋住 |
| E10 | 裝置儲存空間峰值 | APK 內 15 MB + 解壓 15 MB（+ plugin 可能再複製一份到 `/sdcard/Download`）。安裝成功後立即刪（D7）縮短了佔用時間 |
| E11 | 解壓失敗（空間不足 / 外部儲存未掛載） | `Failed(extractFailed)`，dialog 顯示 Error 37 + retry |
| E12 | 解出的 apk 與 metadata 不符 | `getPackageArchiveInfo` 驗證 packageName 與版號，不符就刪檔並拒裝（防 CI 埋錯 flavor） |
| E13 | ClassSwift 被停用（非移除） | `getVersion` 仍回版號 → 判定不需安裝。與改版前行為相同 |
| E14 | 同一個 tag 重新發佈（內容不同） | pin 沒變 → 不重抓；版號相同 → 不更新。需 bump 到新 tag |
| E15 | 解壓中途 App 被 kill | 寫入 `.part` 後才 rename，殘留檔在下一輪解壓時清掉，不會留下半套 apk |
| E16 | 同一次啟動多次點 ClassSwift | coordinator idempotent，不會重複安裝 |

### CI/CD

| # | 情況 | 說明 |
|---|---|---|
| E17 | GH_PAT 的跨 repo 權限 | embed action 與 bump workflow 都要讀 ragdoll-cat 的 releases。若 PAT 是 fine-grained 且未授權該 repo，**所有 Android build 都會在 embed 步驟失敗**，擋掉整條 release pipeline。建議先用 `DRY_RUN: true` 手動跑一次 bump workflow 驗證 |
| E18 | ClassSwift release 少了某個 flavor | bump workflow 在寫入前檢查 Stag / Rc / Prod 三種都在，缺任一就失敗且不 commit |
| E19 | bump commit 與 stage/production 的版號 commit 撞車 | `git-commit-push` push 失敗會 reset 本地 commit 並 exit 1，不留半套狀態，隔天排程再試 |
| E20 | Teams webhook 失敗 | 刻意**不加** `continue-on-error`：通知是 commit 模式唯一的可見性保障，靜靜失敗比紅燈更糟 |

---

## 五、競態分析

Dart 是單執行緒事件迴圈，所有守衛（`_state` 判斷、`_running` 旗標）都在第一個 `await` 之前
同步完成，因此不會有「檢查與設定之間被插隊」的問題。以下逐一列出實際檢視過的競態：

| # | 競態 | 結論 |
|---|---|---|
| R1 | 背景 `ensureInstalled` 與使用者開啟 dialog 幾乎同時 | `_running` + 狀態判斷擋住第二輪。dialog 只觀察背景那輪 —— 但背景那輪是 `allowUserPrompt: false`，不會退回 PackageInstaller。**已知取捨**：在 silent install 無效的裝置上，使用者會盯著 loading 最多 30 秒才看到 Error 34，需按 retry 才會拿到 fallback；若那時 dialog 是「新開」的則會立即拿到 fallback。維持現狀，因為打斷進行中的那輪風險更高 |
| R2 | `_state` 檢查與 `_running = true` 之間 | 兩者之間沒有 `await`，同步區段不可被插隊 |
| R3 | `restart()` 的 `_emit(Idle)` 與後續 `ensureInstalled()` | `_emit` 為同步，`ensureInstalled` 的守衛也在第一個 `await` 前完成，不會被別的呼叫搶先進入 |
| R4 | region gate listener 在 `notifyListeners()` 迭代中移除自己 | Flutter `ChangeNotifier` 容許通知期間移除 listener |
| R5 | region gate 補觸發與 dialog 的 `restart()` 同時 | 後到者看到 `_running` 為 true 直接 return，dialog 轉為觀察 |
| R6 | dialog 已 dispose，`_handleInstalled` 的 postFrame callback 才執行 | callback 內先檢查 `mounted` |
| R7 | dialog 關閉後，背景那輪仍在跑 | 背景那輪沒有帶 `isCancelled`，不會被 dialog 關閉影響；由 dialog 發起的那輪才會被取消 |
| R8 | 同時開出兩個 dialog | bloc 的 `listenWhen` 只在 `isNeedInstall` 轉態時觸發，實務上只會有一個；即使有兩個，第二個會因 `_running` 而只觀察 |
| R9 | 原生單一 executor 序列化 | `getEmbeddedInfo` 與 `extractApk` 共用一條執行緒。bloc 的 `isUpdateAvailable()`（不受 coordinator 的 `_running` 保護）若剛好排在 15 MB 解壓後面，CS toggle 的回應會延後解壓所需時間（本地複製，實測百毫秒等級） |
| R10 | `deleteExtractedApk` 與尚未完成的 plugin 安裝流程 | 只在確認安裝完成（版號變更或 plugin 回報成功）後才刪，且 `deleteFileAfterInstall: false` 表示 plugin 不會再動這個檔案 |
| R11 | bump commit 與 build 同時進行 | build 使用 checkout 當下的 pin，不會讀到寫到一半的內容 |
| R12 | 兩個 bump run 同時（排程 + 手動） | `concurrency: classswift-bump` 序列化 |
| R13 | `.part` 清理與同時進行的解壓 | 原生端單一 executor，不可能有兩個解壓同時進行 |
