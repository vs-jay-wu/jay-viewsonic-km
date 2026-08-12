# app-build-performance domain

Android / Flutter app 開發的建置效能與磁碟空間筆記。

這個 domain 記錄的是**開發環境層級**的優化 —— 不綁任何 repo、不進任何專案的 git，
是「換一台電腦就要重套一次」的個人設定。所以每一項都盡量做成可執行的腳本。

| 文件 | 內容 |
|---|---|
| 本頁 | 一次性 global 設定（Gradle build cache、快取自動清理） |
| [parallel-development.md](parallel-development.md) | mvbf 平行開發：worktree vs APFS clonefile 的實測比較 |

---

## 一次性 global 設定

```bash
./scripts/setup-gradle-global.sh --dry-run   # 先看會改什麼
./scripts/setup-gradle-global.sh             # 套用
./scripts/setup-gradle-global.sh --status    # 只看目前 ~/.gradle 佔用
```

腳本是冪等的，重跑安全。它只寫兩個檔案，**完全不碰任何 repo**：

| 檔案 | 作用 |
|---|---|
| `~/.gradle/gradle.properties` | 開啟 build cache、平行建置 |
| `~/.gradle/init.d/cache-cleanup.gradle` | 讓 Gradle 自動清掉閒置的快取與 wrapper 發行檔 |

### 換電腦 / 分享給別人

clone 這個 repo，跑一次 `setup-gradle-global.sh`，結束。
不需要知道對方的 repo 放在哪、用哪些 Gradle 版本 —— 全部設定都是 user home 層級。

---

## 為什麼：build cache 預設等於沒開

Gradle 的 build cache **預設是關閉的**。實測（2026-08，Jay 的機器）：

```
~/.gradle/caches/build-cache-1    17M     ← 等同停用
~/.gradle/caches/8.13             11G     ← 目前主用版本
~/.gradle/wrapper/dists          6.7G     ← 26 個 Gradle 發行檔，最舊到 4.10.2
~/.gradle 總計                    34G
```

開啟後的效益，在**同一份程式碼被建置多次**的情境最明顯：

- git worktree / 多份 repo 副本 —— 這是最大宗，見 [parallel-development.md](parallel-development.md)
- 切 branch 來回跳
- `flutter clean` 之後重建
- 多個 repo 共用同一批相依模組

> **注意這只涵蓋 Android（Gradle）那一半。**
> Flutter 的 `.dart_tool/flutter_build`（mvbf 實測 8.8G）**沒有**對應的跨目錄共用機制，
> 它的 file cache 內部記的是絕對路徑，換一個目錄就整份失效。這層目前無解。

### 設定內容

```properties
org.gradle.caching=true     # build cache：跨 worktree / 跨 repo 重用 task 產物
org.gradle.parallel=true    # 多模組平行建置
org.gradle.daemon=true      # 明寫，避免被別處關掉（預設本來就是 true）
```

**為什麼放 `~/.gradle/` 而不是 repo 的 `android/gradle.properties`？**
放 repo 會強迫整個團隊用同一組設定、還會進 git；`org.gradle.parallel` 之類的選項
跟每個人的機器規格有關，不該由 repo 決定。放 user home 才是正確的層級。

---

## 為什麼：舊 Gradle 版本可以自動清，不用手動掃

一個常見誤解是「要知道哪些 Gradle 版本沒在用，得掃過所有 repo 的
`gradle-wrapper.properties`」—— 但每個人 repo 位置不同，這條路走不通。

**不需要。** Gradle 自己在 `~/.gradle/caches/journal-1/file-access.bin` 記錄每個
快取檔案的最後存取時間。閒置判斷是 Gradle 的內建能力，**跟 repo 在哪裡無關**。

證據：實測機器上 `caches/7.4`、`caches/6.7.1` 這些舊版本目錄都只剩幾百 KB 的空殼 ——
內容早就被 Gradle 自動清掉了。

但 `wrapper/dists`（6.7G，連 4.10.2 都還在）**沒有**被清。所以 init script 要補的
主要就是這塊：

```groovy
settings.caches {
    releasedWrappers.removeUnusedEntriesAfterDays = 30    // ← wrapper/dists，主要目標
    snapshotWrappers.removeUnusedEntriesAfterDays = 7
    downloadedResources.removeUnusedEntriesAfterDays = 30
    createdResources.removeUnusedEntriesAfterDays = 7
    buildCache.removeUnusedEntriesAfterDays = 14
}
```

### 三個必須知道的限制

1. **`caches.*` API 需要 Gradle 8.0+。** 舊版執行到會直接讓 build 失敗。
   本機仍有 4.10.2 / 6.7.1 / 7.x 的 wrapper 在跑，所以 init script 用
   `GradleVersion.current() >= 8.0` 包起來，舊版跳過。**移除這個判斷會弄壞舊專案的 build。**
2. **清理只在有 build 執行時觸發，且每 24 小時最多一次。** 不是背景常駐服務，
   套用完當下不會看到空間變化。
3. **被刪掉的 wrapper 發行檔會在下次用到時重新下載。** 這是設計上的取捨 ——
   一年沒碰的專案重新開工時多等一次下載，換平時少 6G 佔用。

### 想立刻手動大掃除

自動清理只處理閒置項目，如果想馬上回收：

```bash
# 看有哪些版本、各佔多少
./scripts/setup-gradle-global.sh --status

# 砍掉確定不再用的 wrapper 發行檔（下次需要會自動重下）
rm -rf ~/.gradle/wrapper/dists/gradle-4.10.2-all
```

**不要整包 `rm -rf ~/.gradle`** —— 會連同 `modules-2`（4.4G 的相依）一起消失，
下次 build 要把所有相依重新下載一遍。

---

## 相關

- `scripts/clean-build.sh` / `/clean-build` skill —— 掃描並清除各 repo 的 build 資料夾
- [parallel-development.md](parallel-development.md) —— worktree 與 build 產物肥大的取捨
- 同一份調查也發現 `.dart_tool/flutter_build` 會無限累積（實測 4.5G 是 30 天以上沒碰的殘留）
