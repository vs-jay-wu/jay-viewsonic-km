# mvbf — 建置與安裝

**先讀 [`SKILL.md`](SKILL.md)**（步驟 0–2、註解標準、引號）。這裡只放「真的在做這件事時才需要」的部分，從 SKILL.md 拆出來的，內容未改。

> 什麼時候讀：編譯停在「ClassSwift 尚未取得」或「Finch 尚未取得，或缺少同步標記」／`exit 127 ./gradlew`／「版本解析失敗、Flutter SDK 是 3.27.1」／裝上去的 APK 版號變成 1.0 並跳 Whiteboard Updater／`INSTALL_FAILED_UID_CHANGED`／packaging 找不到 keystore

---

## Build 注意事項

含 ClassSwift 的 flavor（`ifp` / `edla`）需要 CS checkout：

```bash
./gradlew ... -PclassswiftRepoPath=/Users/jay.wj.wu/ProjectsWork_GitHub/Orgs/Viewsonic-EDU/ragdoll-cat
```

沒帶 property 會停在 configuration 階段（`settings.gradle` assert「ClassSwift
尚未取得，或缺少同步標記」）。**先補 property，不要去跑 `tools/sync-classswift.sh`**
——那會建出第二份 checkout，跟本機在測的不是同一份。要跑先問。

### ⚠️ ClassSwift 過了還會卡第二個外部相依：Finch

`settings.gradle` 有**兩份平行的三層驗證**（ClassSwift 與 Finch），補了
`-PclassswiftRepoPath` 只解決第一個，接著會停在：

```
Settings file '…/android/settings.gradle' line: 177
    Finch 尚未取得，或缺少同步標記。
    請執行：./tools/sync-finch.sh
```

Finch 的 checkout 位置是 repo 根的 `third_party/finch`（gitignore），**新 worktree 沒有**。
兩條路：

| 做法 | 什麼時候用 |
|---|---|
| `./tools/sync-finch.sh` | 首選。依版控的 `finch-ref.properties` clone，拿到的就是釘選版 |
| `-PfinchRepoPath=<路徑>` | 腳本拉不到 ref 時的退路。**會跳過版本驗證** |

⚠️ **不要直接把 `-PfinchRepoPath` 指向 `Orgs/Viewsonic-EDU/edu-vbos-finch`。**
那份 checkout 的 HEAD 是它自己的最新 tag，跟 `finch-ref.properties` 釘的**不是同一版**
（2026-09-18 實測：ref 釘 `vb-2077-mvb-sync-20260914`，本機 HEAD 已是 `…-20260917`）。
編錯版介面的後果見該檔檔頭第 4 類：**bindService 成功、呼叫送得出去，直到對方
unmarshal 才丟 BadParcelableException，而且只在裝著那版 Finch 的機器上發生**。

要用退路就開一個停在釘選 SHA 的 worktree（不動 Jay 的 checkout）：

```bash
git -C <edu-vbos-finch> worktree add --detach <同層路徑> <釘選的 SHA>
```

**另外**：`sync-finch.sh` 會因為「釘選的 tag 在遠端不存在」而失敗
（`錯誤：在 Finch 找不到 ref「…」`）。那不是本機環境問題 —— 是
`finch-ref.properties` 指向一個已被遠端刪掉／取代的 tag，代表**當下的
`origin/master` 從乾淨 clone 建不起來**。先用 `git ls-remote --tags origin 'vb-2077-*'`
確認，再回報給 Jay，不要自己改 ref 檔。

只驗編譯不必建整個 APK：

```bash
./gradlew :app:compileEdlaDebugJavaWithJavac -PclassswiftRepoPath=…
```

Dart 側用 `fvm dart analyze <檔案>`（**不要用 Flutter MCP**，見 km `CLAUDE.md`）。

### ⚠️ 要**安裝**的 APK 用 `fvm flutter build apk`，不要直接下 `./gradlew assemble`

版號是 flutter 注入的（`flutter build` 會把 `flutter.versionCode` / `flutter.versionName`
寫進 `android/local.properties`，gradle 再讀它）。**直接跑 `./gradlew assembleEdlaDebug`
繞過那一步，APK 會變成 `versionCode=1 / versionName=1.0`**，而且 build 完全成功、
沒有任何警告。

實測後果（2026-09-14，VB-2213，Pixel Tablet）：app 以為有新版，一開就跳
`Whiteboard Updater`「The new version has been downloaded. Do you want to install it now?」
—— **按下 Update 會把你正在測的 build 換成 OTA 版**，而你會以為自己還在測剛才那份。

```bash
# 驗證裝上去的是哪個版號
adb -s <serial> shell dumpsys package com.viewsonic.droid | grep -E 'versionCode|versionName'
```

`./gradlew` 直接下仍然適合**只驗編譯**（`:app:compileEdlaDebugJavaWithJavac`），
那種情況產物不會被安裝，版號無所謂。

flutter 這條路要傳 gradle property 用 `--android-project-arg`：

```bash
fvm flutter build apk --debug --flavor edla \
  --android-project-arg=classswiftRepoPath=/Users/jay.wj.wu/ProjectsWork_GitHub/Orgs/Viewsonic-EDU/ragdoll-cat
```

### 新開的 worktree 要先補 `.fvm`

`.fvm/` 被 gitignore（`.gitignore:17`），所以 `git worktree add` 出來的新工作目錄**沒有它**，
`make test` / `flutter` 會落到系統版本。`.fvmrc` 有進版控，版本資訊還在，補一次即可：

```bash
fvm use --skip-setup     # 讀 .fvmrc，建 .fvm/flutter_sdk 符號連結
```

**徵兆**（實測，VSFT-6704）：

```
The current Flutter SDK version is 3.27.1.
Because droid requires Flutter SDK version >=3.41.5, version solving failed.
```

看到「版本解析失敗」不要去動 `pubspec.yaml` 的版本約束——那是 SDK 選錯了。

⚠️ `fvm use` 會**把 `.fvmrc` 結尾的換行吃掉**，產生一行純雜訊 diff。跑完
`git checkout -- .fvmrc` 還原，別讓它混進 commit。

⚠️ **起點沒有 `.fvmrc` 時（例如從舊 production tag 開的 hotfix 分支），`fvm use <版本>`
會改寫 `.gitignore`** —— 把既有的 `.fvm` / `.fvmrc` 兩行刪掉，在檔尾補一個**沒有結尾換行**
的 `.fvm/`。後果是 `.fvmrc` 從被忽略變成 untracked，`git status` 不再乾淨。

實測（2026-09-18，hotfix/3.10.207 的 backport worktree，起點 tag `3.10.206`
＝ `.fvmrc` 進版控之前的 `0b4c87c89^`）：

```
 M .gitignore
?? .fvmrc
```

`verify_hotfix_backport.sh` 的「工作目錄乾淨」會因此變紅，而它給的建議是
「先 commit 或 stash」—— **照做就是把 fvm 的副作用 commit 進 backport 分支**，
而那條分支的全部賣點正是「只有刻意挑進來的東西」。正確做法是還原：

```bash
git checkout -- .gitignore   # .fvmrc 會自動變回被忽略
```

**徵兆**：backport 分支上突然有 `.gitignore` 的改動，而你這輪根本沒碰它。

### 新開的 worktree 也沒有 `gradlew`

同樣是 gitignore（`android/.gitignore` 列了 `/gradlew`、`/gradlew.bat`、
`gradle-wrapper.jar`、`gradle-wrapper.properties`）。**徵兆是 `exit 127`／
`no such file or directory: ./gradlew`** —— 不是 build 壞了。從主 checkout 複製一份：

```bash
cp <主checkout>/android/gradlew android/
cp <主checkout>/android/gradle/wrapper/gradle-wrapper.* android/gradle/wrapper/
```

### ⚠️ keystore 路徑會不會壞，取決於 worktree 放在**哪一層**

`android/app/build.gradle` 用相對路徑找 keystore
（`rootProject.file('../../playstore_keystore/…')`、`file('../../../playstore_keystore/…')`、
ifp 的 `file('../../../mvbf_keystore/MVBA_PlatForm.jks')`）。**判準是目錄深度，不是
「有沒有用 worktree」**：

| worktree 位置 | 結果 |
|---|---|
| **同層**（`Orgs/Viewsonic-EDU/<repo>-<topic>`，即 `cross-repo-workflow.md` §4 建議的放法） | 深度與主 checkout 相同 → **路徑解析得到，照常簽章** |
| `.claude/worktrees/<name>`（session 綁定那種） | 多墊兩層 → 解析到不存在的路徑，packaging 倒 |

同層那種**已實測可行**（2026-09-14，VB-2213）：`cd android/app` 後
`[ -f ../../../mvbf_keystore/MVBA_PlatForm.jks ]` 為真，`:app:packageEdlaDebug` 正常產出
可安裝的 APK。所以**不要**因為「這是 worktree」就先去改 build.gradle ——
先用那行 `[ -f ... ]` 測一次。

下面講的是**深一層那種**才會遇到的情形，`:app:packageStoreDebug` 會倒在：

```
property 'signingConfigData.storeFile' specifies file
'…/.claude/worktrees/playstore_keystore/viewsonic.keystore' which doesn't exist
```

**兩個容易誤判的點：**

1. **`storeDebug` 也會倒。** store / open 的 **debug** buildType 一樣用
   `signingConfigs.googlePlayRrelease`（只有 ifp / edla 的 debug 走 ifp keystore）。
   以為「改用 debug 就能繞過」是錯的——我踩過。
2. **R8 不受影響。** 失敗點在 packaging，`minifyStoreReleaseWithR8` 與
   resource shrinking 都已經跑完 → 想驗 R8 或量 APK 體積**不需要**解決簽章問題，
   從 `build/app/intermediates/dex/` 與 `optimized_processed_res/` 直接量即可。

要真的產出 APK，就**暫時**把那兩條路徑往上加幾層（層數自己算，不要猜：
`python3 -c "import os;print(os.path.normpath(os.path.join(os.getcwd(),'<相對路徑>')))"`），
build 完**立刻還原**並用 `git diff -- android/app/build.gradle | grep -i keystore` 確認沒殘留。
這不違反 `excluded-dirs.md`：只改指向，沒有讀取、複製或搬移 keystore 本身。
不想動版控檔就改從主 checkout build。

### `ifp` flavor 裝不到一般 Android 裝置

`android/app/src/ifp/AndroidManifest.xml` 宣告 `android:sharedUserId="android.uid.system"`，
那需要平台簽章。裝到一般機器（實測：Pixel Tablet）會是：

```
INSTALL_FAILED_UID_CHANGED: Package com.viewsonic.droid shared user changed
from <nothing> to android.uid.system
```

要在非 IFP 機器上驗畫面，改用 **`edla`**（含 ClassSwift，仍需 `-PclassswiftRepoPath`）
或 **`open`**（不含 ClassSwift）。查證：`grep -rn sharedUserId android/app/src/*/AndroidManifest.xml`。

---
