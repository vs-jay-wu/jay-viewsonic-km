# mvbf 平行開發：worktree 的肥大問題

> 實測環境：`edu-droid-flutter`（mvbf），macOS APFS，2026-08-12。

## 問題

想同時開發兩個 feature，直覺是開 `git worktree`。但 mvbf 一份完整的工作目錄是 **28G**：

| 項目 | 大小 | worktree 之間 |
|---|---|---|
| `build/` | 17G（`build/app/intermediates` 9.1G、`outputs` 3.6G） | **各自一份** |
| `.dart_tool/` | 9.0G（`flutter_build` 8.8G） | **各自一份** |
| `android/.gradle` | 548M | **各自一份** |
| `.git` | 564M | ✅ 共用 |

**worktree 幫你省的只有 `.git` 的 564M** —— 痛點 100% 在 build 產物，而 worktree 完全沒有處理那部分。
開第二個 worktree 等於再長出 26G。

---

## 實測：APFS clonefile 完勝 worktree

macOS 的 APFS 支援 copy-on-write 複製（`cp -c`）。實測整個 28G 的 repo：

```bash
cp -c -R edu-droid-flutter edu-droid-flutter-b
```

| 做法 | 建立時間 | 實際佔用 | 得到什麼 |
|---|---|---|---|
| `git worktree add` | 快 | **~26G**（build 從零長起） | 共用 `.git`，省 564M |
| `cp -c -R` | **33 秒** | **79 MB** | 完整獨立 repo，**連 28G build 產物一起帶** |

79 MB 只是目錄 metadata。檔案內容完全共享，直到某一邊改寫才會真的佔空間（COW）。

額外好處：它是**獨立的 git repo**，沒有 worktree「同一個 branch 不能同時 checkout 兩次」的限制 ——
兩邊可以都停在 master 上做不同實驗。

### 驗證 clonefile 真的生效

`cp -c` 在不支援的檔案系統上會**默默 fallback 成實體複製**。確認方式是量空間：

```bash
before=$(df -k / | tail -1 | awk '{print $4}')
cp -c -R <來源> <目標>
after=$(df -k / | tail -1 | awk '{print $4}')
echo "消耗 $(( (before-after)/1024 )) MB"
```

實測 3.9G 的目錄：**0.07 秒、0 MB**。生效。

---

## ⚠️ 未驗證的風險：副本的 build 可能不乾淨

**這是本文唯一沒有實測的部分，採用前請自行驗證。**

Flutter 的 stamp 檔記錄的是**絕對路徑**，指向原始 repo：

```
# .dart_tool/flutter_build/<hash>/android_aot_bundle_release_android-arm64.stamp
inputs  -> /.../edu-droid-flutter/.dart_tool/flutter_build/<hash>/arm64-v8a/app.so
outputs -> /.../edu-droid-flutter/build/app/intermediates/flutter/edlaRelease/arm64-v8a/app.so
```

`.dart_tool/flutter_build/*/.filecache` 同樣是絕對路徑索引。

在 clonefile 副本裡，這些路徑**仍然存在**（指向**原** repo）而且 hash 相同。所以副本第一次 build 時，
Flutter 有可能判定 target 已是最新而跳過 —— 但它驗證的是原 repo 的檔案。
最壞情況是副本 build 出來的產物混到原 repo 的舊檔案。

### 迴避方式

clonefile 之後，把副本裡**確定會壞的那層**刪掉：

```bash
cp -c -R edu-droid-flutter edu-droid-flutter-b
rm -rf edu-droid-flutter-b/.dart_tool/flutter_build    # 絕對路徑索引，必壞
```

- 刪副本的目錄**不影響原 repo** —— COW 就是這個意思
- `build/`（Gradle 那層）保留：Gradle 判定 out-of-date 會自己重跑，而且有 build cache 兜底
  （前提是已跑過 [`setup-gradle-global.sh`](README.md)）
- 代價是副本的 Dart/kernel 那層要重建一次，但 Gradle 那半省下來了

### 想自己驗證

在副本跑一次完整 build，確認產物確實落在副本自己的 `build/`，且原 repo 的 `build/` mtime 沒被動到。
約需 20–30 分鐘機器時間。**目前尚未有人跑過這個測試。**

---

## 不用 clonefile 的話：分層 worktree

如果不想碰上面的不確定性，退而求其次的策略是**限制真正需要 build 的目錄數量**：

- 只維持 **1 個「重型」工作目錄**（會 `flutter build` / 跑真機）
- 其他都是「輕型」的：只做編輯 / code review / `dart analyze` / unit test，**不要碰 `flutter build`**
- 輕型目錄只需要 `flutter pub get` 的產物（幾十 MB 等級），不會長出 8.8G 的 `flutter_build`

平行開發的瓶頸多半是「我在等 A build 的時候想改 B」，而改 B 通常不需要 B 也能 build。
這個分層就吃掉大部分需求，且幾乎零額外空間。

---

## 順帶發現：`flutter_build` 會無限累積

跟平行開發無關，但同一次調查量到的長期滲漏：

```
.dart_tool/flutter_build/  共 54 個 hash 目錄（每組 build 設定一個）
  其中 27 個超過 30 天沒被碰過，合計 4.5 GB
```

**Flutter 永遠不會自己清這些** —— 跟 Gradle 有 journal 自動清理的行為完全相反
（見 [README.md](README.md)）。每換一次 flavor / build mode / target platform 就多一個目錄，只進不出。

安全的手動回收（依最後修改時間，不影響當前使用中的設定）：

```bash
find .dart_tool/flutter_build -maxdepth 1 -mindepth 1 -type d -mtime +30 -exec rm -rf {} +
```

> **待辦：** 這段可以併進 `scripts/clean-build.sh` / `/clean-build` skill，對所有 Flutter repo 適用。尚未做。
