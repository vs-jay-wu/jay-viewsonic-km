# ragdoll-cat — personal patch 備份

Jay 個人本機用的變更，**不 commit 到 ragdoll-cat**，備份於此避免遺失。
內容為 Appium/UiAutomator2 讓 CS overlay 可被 focus/點擊的**測試 instrumentation**（E2E 用）。

## 來源

| 項目 | 值 |
|------|----|
| Repo | `Orgs/Viewsonic-EDU/ragdoll-cat` |
| Branch | `develop` |
| 備份時 HEAD | `4a43be0a` |
| 備份日期 | 2026-07-13 |

> 2026-07-13 更新：測試檔位置由 `src/stag/` 搬到 **`src/debug/`**（改用 rcDebug 跑 E2E）；
> `AndroidManifest.xml` 因此從「新檔」變成「更新既有 debug manifest」。
> 另註：派題結束訊號（`EventMissionStatus.finished`）等**功能性**變更已獨立走 PR
> （[ragdoll-cat#1051](https://github.com/Viewsonic-EDU/ragdoll-cat/pull/1051)，VSFT-7538），
> 不在本 patch；本 patch 只保留純測試 hook。

## 三個變更

1. **`app/src/main/java/com/viewsonic/classswift/windowframework/core/CSWindowManager.kt`（更新）** — 新增 `setFocusable(focusable: Boolean)`，切換所有受管 window 的 `FLAG_NOT_FOCUSABLE`，讓 UIAutomator2 能看到/點擊 overlay（debug build instrumentation 用）。
2. **`app/src/debug/AndroidManifest.xml`（更新）** — 在 debug variant manifest 註冊 `TestFocusableReceiver`。
3. **`app/src/debug/java/com/viewsonic/classswift/testing/TestFocusableReceiver.kt`（新檔）** — 測試用 receiver，收 `com.viewsonic.classswift.TEST_SET_FOCUSABLE` broadcast 後呼叫 `CSWindowManager.setFocusable(...)`。

> 相關脈絡同 [`../edu-vbos-finch/personal.patch`](../edu-vbos-finch/personal.patch)：都是 Appium/UiAutomator2 讓 overlay 可 focus 的臨時 instrumentation。

## 未納入備份

- gitignore 的機敏 Firebase 設定（`google-services.json` 之類，含 API key）刻意不備份，需自行保留本機檔。
- 已是 ragdoll-cat 追蹤檔案者（icon、network_security_config 等），非本機未提交變更，不需備份。

## 還原方式

```bash
cd Orgs/Viewsonic-EDU/ragdoll-cat
git apply /path/to/patches/Viewsonic-EDU/ragdoll-cat/personal.patch
```

patch 以 `git add -N` 產生，同時含改動檔 diff 與新檔全文，`git apply` 會一次還原全部三個變更（新檔會直接建立）。
