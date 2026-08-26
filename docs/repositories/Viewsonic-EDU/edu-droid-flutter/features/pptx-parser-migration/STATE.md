# 換軌 POC 的目前狀態（2026-08-26）

換軌（用 olfparser 取代舊 `mvbx_pptx_olf_api`）**還沒開單、沒有 commit**。
所有改動只存在於 mvbf 的工作區，這份檔案負責讓它可以被還原。

---

## 改動在哪：mvbf 的工作區，未 commit

在 `edu-droid-flutter`，分支 `Jay/olfparser-poc`，**相對 `master` 0 個 commit**
—— 也就是說分支本身是乾淨的，全部改動都在工作區（已追蹤檔的修改 ＋ 未追蹤的新檔）。

驗證方式：

```bash
cd Orgs/Viewsonic-EDU/edu-droid-flutter
git branch --show-current                 # 應為 Jay/olfparser-poc
git rev-list --count master..HEAD         # 應為 0
git status --porcelain
```

`git status` 預期看到 7 個 ` M` 與 2 個 `??`。若已經被 commit 或清掉，就以下面的 patch 為準。

## 截圖不在版控裡

`index.html` 是三方比對頁（PowerPoint 參考 / 舊 parser / 新 parser），它引用
`images/`（18 份簡報的對照縮圖）與 `pages/`（8 份簡報的逐頁截圖）共約 13 MB 的 jpg。
這兩個目錄被 `.gitignore` 排除 —— git 壓不動 jpg，而且只要語料庫與兩個 parser 還在
就能重跑產生。

**所以 clone 下來的 `index.html` 會是空框。** 要看圖得自己重跑截圖流程，
或找當初跑的那台機器。版控裡真正不可再生的是 `patches/` 與這份 `STATE.md`。

## patch 檔

`patches/` 底下三份，用途不同：

| 檔案 | 內容 | 上游狀態 |
|---|---|---|
| `mvbf-olfparser-poc.patch` | **換軌本體**：mvbf 側接上 olfparser 的改動 | 未開單、未 commit |
| `olfparser-perf-knobs.patch` | olfparser 的四個效能開關 | 未送出 |
| `olfparser-image-dedup.patch` | 圖片去重 | **已上游**（olfparser PR #138，MT-2725），此檔僅存作歷史 |

### `mvbf-olfparser-poc.patch` 涵蓋與不涵蓋什麼

涵蓋 7 個檔：

```
lib/helper/olf_file/olfparser_ffi.dart      （新檔，Dart FFI 綁定）
lib/helper/file_utility_helper.dart          +42
lib/helper/olf_file/olf_reader.dart          +2
pubspec.yaml                                 1 行
ios/Flutter/Debug.xcconfig                   +17（iOS 靜態連結旗標）
ios/Podfile.lock, macos/Podfile.lock         各 +6
```

套用：

```bash
cd Orgs/Viewsonic-EDU/edu-droid-flutter
git apply --check \
  ../../jay-viewsonic-km/docs/repositories/Viewsonic-EDU/edu-droid-flutter/features/pptx-parser-migration/patches/mvbf-olfparser-poc.patch
# 驗過再去掉 --check（路徑依 km 實際位置調整）
```

**刻意不涵蓋兩樣：**

1. `lib/debug_credentials.dart`（+2/-2）—— 那是為了登入測試改的 stage 測試帳密，
   跟換軌無關，也不該進 km。要重測就自己改。
2. `android/app/src/main/jniLibs/arm64-v8a/lib_olfparser.so`（19,748,336 bytes）——
   19 MB 的 binary 不進版控。重建方式見下。

## 重建那顆 `.so`

Dart 綁定寫死 `DynamicLibrary.open('lib_olfparser.so')`，對應 olfparser 的
`olf-ffi` crate —— 它的 `Cargo.toml` 是 `[lib] name = "_olfparser"` ＋
`crate-type = ["cdylib", ...]`，所以 cdylib 產出就叫 `lib_olfparser.so`。
（`olf-jni` 是另一個 crate，產出 `libolfparser_jni.so`，**不是**這個 POC 用的。）

**那顆 `.so` 不是用 `cargo ndk` 建的** —— 本機沒有安裝 `cargo-ndk`
（`cargo ndk --version` 查無），所以它走的是手動 NDK 工具鏈路線
（設 `CC_aarch64-linux-android` / `AR_*` / `CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER`
再 `cargo build --target aarch64-linux-android --release -p olf-ffi`）。
本機可用的 NDK：23.1 / 23.2 / 25.2 / 27.0 / 28.2，rustup 的
`aarch64-linux-android` target 已安裝。

⚠️ **必須帶 16 KB page size 的連結旗標**：

```
-C link-arg=-Wl,-z,max-page-size=16384
```

Android 15 起要求 16 KB 對齊，漏掉會在裝置上載入失敗。手上那顆已實測確認
（`llvm-readelf -l` 的 `LOAD align = 0x4000`）—— 重建後要用同一個指令複驗，
不要假設預設值就對。

olfparser repo 的 `scripts/stage_android.sh` **不能直接拿來用**：它是給 `olf-jni`
的（產出 `libolfparser_jni.so`），而且 `ANDROID_MODULE` 預設值寫的是**別人的**本機路徑
（`/Users/arey.cj.liu/...`），照跑會 stage 到不存在的地方。

**手上那顆 `.so` 是哪個 commit 建的，無從得知**：它是 stripped release，
內部沒有版本字串（只有 rustc hash `59807616`）。唯一可推的是 mtime `2026-08-25 14:31`,
早於 2026-08-26 的去重與 perf knobs，所以**它不含這兩者**。要有可稽核的對應關係，
重建時就把來源 commit 記在這裡。

## 還沒寫進報告的一個結論：59377 不要做座標縮位

59377 是語料庫裡最壞的一份（17,591 個 `path` 元素 = 22.3 MB，其中 `data` 欄位
13.8 MB 是全精度 f64 座標）。把座標四捨五入到小數 2 位可以省 69%，
**但不能做** —— 產生那些字串的 `py_float_str` 是 parity 的一部分
（要逐 byte 等於 CPython 的 `str(float)`），在 Python 版退役前動它就會破 parity。

附帶事實：這份簡報在舊 parser 也一樣巨大（新 37.3 MB vs 舊 31.8 MB），
**不是換軌造成的回歸**，不要在報告裡寫成新 parser 的缺點。
