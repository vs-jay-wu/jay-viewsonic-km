# ragdoll-cat — personal patch 備份

Jay 個人本機用的變更，**不 commit 到 ragdoll-cat**，備份於此避免遺失。

## 來源

| 項目 | 值 |
|------|----|
| Repo | `Orgs/Viewsonic-EDU/ragdoll-cat` |
| Branch | `develop` |
| 備份時 HEAD | `cb66455a` |
| 備份日期 | 2026-07-02 |

## 三個變更

1. **`CSWindowManager.kt`（改動）** — 新增 `setFocusable(focusable: Boolean)`，切換所有受管 window 的 `FLAG_NOT_FOCUSABLE`，讓 UIAutomator2 能看到/點擊 overlay（stag build instrumentation 用）。
2. **`app/src/stag/AndroidManifest.xml`（新檔）** — stag variant manifest。
3. **`app/src/stag/java/com/viewsonic/classswift/testing/TestFocusableReceiver.kt`（新檔）** — 測試用 receiver。

> 相關脈絡同 [`../edu-vbos-finch/personal.patch`](../edu-vbos-finch/personal.patch)：都是 Appium/UiAutomator2 讓 overlay 可 focus 的臨時 instrumentation。

## 未納入備份

- `app/src/stag/google-services.json` — **gitignore 的機敏 Firebase 設定**，含 API key，刻意不備份，需自行保留本機檔。
- `app/src/stag/res/**`（icon、network_security_config）— 這些在 ragdoll-cat 已是**已追蹤檔案**，非本機未提交變更，不需備份。

## 還原方式

```bash
cd Orgs/Viewsonic-EDU/ragdoll-cat
git apply /path/to/patches/Viewsonic-EDU/ragdoll-cat/personal.patch
```

patch 以 `git add -N` 產生，同時含改動檔 diff 與新檔全文，`git apply` 會一次還原全部三個變更（新檔會直接建立）。
