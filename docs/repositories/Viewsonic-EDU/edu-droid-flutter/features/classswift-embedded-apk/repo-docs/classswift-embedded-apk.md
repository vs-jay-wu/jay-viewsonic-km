<!--
==============================================================
SOURCE TRACKING — 來源為 PR branch 內的 repo 文件，合併 / 更新後請重新 clone
==============================================================

repo:           Viewsonic-EDU/edu-droid-flutter
path:           docs/classswift-embedded-apk.md
branch:         stephen/VSFT-9785-classswift-embedded-apk (PR #208, 尚未合併)
commit:         184695066eb6d320b4f33b7af3b4711ba46a1373
cloned_at:      2026-07-31

Maintenance rule: PR 有新 commit 或合併進 master 後，重新 git show 覆寫此檔，
                  並同步更新 commit / cloned_at，commit 訊息附 PR URL。
==============================================================
-->

> | 來源 | branch | commit | clone 日期 |
> |---|---|---|---|
> | [docs/classswift-embedded-apk.md](https://github.com/Viewsonic-EDU/edu-droid-flutter/blob/stephen/VSFT-9785-classswift-embedded-apk/docs/classswift-embedded-apk.md) | `stephen/VSFT-9785-classswift-embedded-apk` | `1846950` | 2026-07-31 |

# ClassSwift 內嵌 APK

MVB 不再從 OTA server 下載 ClassSwift。ClassSwift apk 由 CI 在 build 時放進 MVB 的 assets，
App 啟動後直接比對版號並在背景靜默安裝，全程不需網路。

## 為什麼

原本流程：App 啟動 → 讀 `version.json` → 下載 ~15 MB apk → 安裝。第一次開機、網路慢或斷網時，
ClassSwift 可能遲遲裝不起來，使用者點 Quiz Tool 就得等下載。改為內嵌後，MVB 裝好的當下就已經
帶著對應版本的 ClassSwift，啟動即可安裝。

## 執行期流程

```
main_screen (onITAdminSettingsUpdated)
  └─ ClassSwiftInstallCoordinator.ensureInstalled()          背景、fire-and-forget
       ├─ gating: kClassSwiftEnabled + region gate (quizTool)
       ├─ ClassSwiftInstaller.getEmbeddedApkInfo()           讀 assets/classswift/metadata.json
       │    └─ null → ClassSwiftInstallUnavailable（這包沒有內嵌 apk）
       ├─ ClassSwiftInstaller.isUpdateAvailable()            已安裝版號 vs 內嵌版號
       │    └─ false → ClassSwiftInstallNotNeeded
       ├─ ClassSwiftInstaller.extractEmbeddedApk()           原生串流複製到 getExternalFilesDir
       └─ ClassSwiftInstaller.install(silentInstall: true)   靜默安裝，不 fallback、不顯示 UI
```

使用者在背景安裝完成前點 ClassSwift 時，`ClassSwiftUpdatingDialog` 才會出現。它只是同一個
coordinator 的觀察者，並以 `allowUserPrompt: true` 呼叫——此時允許 silent install 失敗後
fallback 到 PackageInstaller（使用者正在等，可以接受系統安裝畫面）。

| 狀態 | 意義 |
|---|---|
| `ClassSwiftInstallIdle` | 尚未觸發 |
| `ClassSwiftInstallUnavailable` | 這包沒有內嵌 apk（本地 build，或 open / store flavor） |
| `ClassSwiftInstallNotNeeded` | 已安裝版本不比內嵌版本舊 |
| `ClassSwiftInstallPreparing` | 解壓中 |
| `ClassSwiftInstallInProgress` | 安裝中 |
| `ClassSwiftInstallCompleted` | 安裝完成 |
| `ClassSwiftInstallFailed` | 解壓或安裝失敗；帶 `filePath` 時代表已解出、retry 可直接重裝 |

## APK 放在哪

```
android/app/src/classswift/assets/classswift/
  ├── ClassSwift_Service.apk   (gitignored，build 時才放入)
  └── metadata.json            (gitignored，CI 產生)
```

- `android/app/build.gradle` 的 `sourceSets` 只把這個目錄掛給 `ifp` 與 `edla`。
  `open` / `store` 解不出 ClassSwift package（見 `ClassSwiftInstaller._getPackageName`），
  不該多背 15 MB，Play Store 上傳的包也不受影響。
- `androidResources { noCompress += 'apk' }`：apk 本身已是壓縮檔，不做二次壓縮，
  解壓等同直接複製。

`metadata.json` 內容：

```json
{
  "version": "1.6.3",
  "packageName": "com.viewsonic.classswift.service.stag",
  "tag": "v1.6.3",
  "flavor": "Stag",
  "sourceAsset": "ClassSwift_Service_1_6_3_Stag_Release.apk"
}
```

原生端（`ClassSwiftAssetInstaller.java`）解壓後會用 `getPackageArchiveInfo` 驗證解出的 apk
與 metadata 的 packageName / 版號相符才交給安裝，避免 CI 埋錯 flavor 而裝到錯誤的 package。
版號比對會忽略 flavor 後綴（apk 的 `versionName` 在非 prod build 是 `1.6.3-stag`）。

## Release target 對應

`ReleaseTarget` 在執行期由版號推導（build number 奇數 = stage、偶數且 minor 奇數 = beta，
其餘為 production / rollback），決定 MVB 要找哪個 ClassSwift package。CI 埋入的 apk 必須一致：

| MVB release target | ClassSwift flavor | package name |
|---|---|---|
| stage | `Stag` | `com.viewsonic.classswift.service.stag` |
| beta | `Rc` | `com.viewsonic.classswift.service.rc` |
| production / rollback | `Prod` | `com.viewsonic.classswift.service` |

`dev`（`com.viewsonic.classswift.service.dev`）沒有對應的 ragdoll-cat release flavor，
不在內嵌範圍內。

## CI/CD

### 版本鎖定

`classswift_pin.json` 指定要內嵌哪一版：

```json
{ "repo": "Viewsonic-EDU/ragdoll-cat", "tag": "v1.6.3" }
```

APK 本身不進 repo。build 時才依這個 tag 下載，因此同一個 commit 永遠 build 出同一份內容，
換版是一個可 review 的 PR。

### `.github/actions/embed-classswift-apk`

依 release target 選 flavor → 從 ragdoll-cat release 下載對應的 `*_Release.apk` 與 `.sha256`
→ 驗證 checksum → 放入 asset 目錄並寫 `metadata.json`。

只依賴 `gh`（release 查詢用 `gh --jq`，pin 檔用 `sed`），self-hosted macOS runner 上沒有 `jq`
也能跑。

已接入的 workflow：

| Workflow | `release-target` |
|---|---|
| `stage.yml` | `stage` |
| `beta.yml` | `beta` |
| `production.yml` | `production` |
| `rollback.yml` | `rollback` |
| `daily-build.yml` | `auto`（由 pubspec 版號推導） |

`build-android-aab` job 只 build `store` flavor，不需要也沒有接入。

### `.github/workflows/classswift-bump.yml`

每天 01:00 UTC（也可手動觸發）檢查 ragdoll-cat 最新 release，比 pin 新就開一個 **draft PR**
更新 `classswift_pin.json`。開 PR 前會確認該 release 具備 Stag / Rc / Prod 三種 Release APK，
否則直接失敗——少了任何一種都會讓對應的 MVB pipeline 在 build 時才爆掉。

## 本地開發

沒跑過下面這行的本地 build 不會有內嵌 apk：coordinator 會回報 `Unavailable` 並跳過安裝，
不會 crash，只是不會裝 ClassSwift。

```bash
make fetch-classswift                 # 由 pubspec 版號推導 release target
make fetch-classswift ARGS="stage"    # 或指定
```

需要 `gh`（已登入）。

## 相關檔案

| 檔案 | 職責 |
|---|---|
| `lib/helper/class_swift/class_swift_install_coordinator.dart` | 背景安裝流程與共用狀態 singleton |
| `lib/helper/class_swift/class_swift_install_state.dart` | 安裝狀態 |
| `lib/helper/class_swift/class_swift_installer.dart` | 版號比對、解壓、安裝 |
| `lib/helper/class_swift/class_swift_embedded_apk_platform_service.dart` | 內嵌 apk 的 MethodChannel 抽象層 |
| `android/app/src/main/java/com/viewsonic/droid/ClassSwiftAssetInstaller.java` | 讀 metadata、串流解壓、驗證 apk |
| `lib/widget/class_swift/class_swift_updating_dialog.dart` | 使用者主動點 CS 時的觀察者 UI |
| `classswift_pin.json` | 內嵌版本鎖定 |
| `tools/fetch_classswift_apk.sh` | 本地取得內嵌 apk |
