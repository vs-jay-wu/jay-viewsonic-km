# Build 指南

## Build Variants

ClassSwift 使用兩個 flavor dimension 組合出不同的 build：

### Dimension 1：Device Type

| Flavor | Application ID | 說明 |
|--------|---------------|------|
| `aosp` | `com.viewsonic.classswift.aosp` | AOSP 裝置版本（獨立 app ID） |
| `edla` | `com.viewsonic.classswift` | EDLA 裝置版本（預設 app ID） |

### Dimension 2：Environment

| Flavor | 說明 |
|--------|------|
| `stag` | 開發測試環境（Staging） |
| `rc` | 準上線環境（Release Candidate） |
| `prod` | 正式生產環境（Production） |

### Build Type

| Type | 說明 |
|------|------|
| `debug` | 不混淆、Crashlytics 不上傳、debug logging 啟用 |
| `release` | ProGuard minification + resource shrinking、Crashlytics 上傳 |

### 組合矩陣（完整 variant 名稱示例）

```
edlaStagDebug
edlaStagRelease
edlaRcRelease
edlaProdRelease
aospProdRelease
...（共 12 個組合）
```

---

## 版本號

版本資訊統一存放在 `version.properties`，Gradle 動態讀取計算：

```
MAJOR.MINOR.HOTFIX.INTERNAL
```

範例：`2.05.03.001`

---

## 環境 URL

各 environment flavor 透過 `buildConfigField` 注入不同的 API base URL：

| Flavor | 用途 |
|--------|------|
| `stag` | 測試後端，可接受頻繁部署 |
| `rc` | 與 production 相同資料庫，用於最終驗證 |
| `prod` | 正式後端 |

在程式碼中透過 `BuildConfig.BASE_URL`（或對應欄位名稱）取得。

---

## Signing

- Keystore 檔案：`MVBA_PlatForm.jks`（存放在 org 目錄，受保護，不進 git）
- 設定檔：`keystore.properties`（本地，gitignored）
- ClassSwift Service 宣告 signature-level 自訂 permission，確保只有同簽章 App（如 MyViewBoard）能夠 bind

---

## 常用 Gradle Tasks

```bash
# 一次組建特定環境全部 APK
./gradlew assembleProductionApks
./gradlew assembleReleaseCandidateApks
./gradlew assembleStageApks

# 組建 EDLA Production AAB（上架 Play Store）
./gradlew bundleEdlaProdReleaseAab

# 組建所有 APK + Bundle
./gradlew buildAllApkAndBundleFiles
```

---

## CI / CD

CI 相關文件（HTML 格式）存放於 ragdoll-cat repo 的 `docs/ci/` 目錄下。

---

## Firebase

- **Debug build：** Crashlytics 上傳停用（避免汙染線上崩潰報告）
- **Release build：** Crashlytics 自動上傳符號與 mapping file
- google-services.json 設定存放於 `cs_googlejson/`（gitignored）
