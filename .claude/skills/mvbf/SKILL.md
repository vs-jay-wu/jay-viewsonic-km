---
name: mvbf
description: "Use when writing, reviewing, or committing code in edu-droid-flutter (mvbf / myViewBoard Flutter app) — before any Edit/Write in that repo. Covers branch check, team-rule discovery, comment standards, headless engine limits, and hotfix backport / release judgement calls. Examples: \"改 mvbf 的 xxx\", \"review 這個 PR\", \"幫我 commit mvbf\", \"出 hotfix\""
---

# mvbf（edu-droid-flutter）工作核心

repo：`Orgs/Viewsonic-EDU/edu-droid-flutter`

這是**個人層**的補充。團隊慣例的 source of truth 在該 repo 自己的 `.claude/rules/`，
**不要**在這裡複製一份（會漂移且不會被發現）。

---

## 步驟 0：先讀團隊 rules（每次都做）

那個 repo 的 rules **不會**跨 repo 自動載入——在 km 工作時它們不在 context 裡，
就算 cwd 是 mvbf 也未必載入。所以動手前：

```bash
ls Orgs/Viewsonic-EDU/edu-droid-flutter/.claude/rules/
cat Orgs/Viewsonic-EDU/edu-droid-flutter/CLAUDE.md
```

> 該 repo **有** `CLAUDE.md` 與 `AGENTS.md`（2026-09-17 於 `origin/master` 6dbcc8516 實測）。
> 兩份內容相同：**OLF 格式法（WRAP track）**，守門規則是 `.claude/rules/olf-format.md`。
> 只有動到 OLF 讀寫／匯入匯出才需要細讀，但先掃一眼才知道這次有沒有被它管到。

讀完與本次任務相關的。目前有（可能增減，以 `ls` 為準）：

| 檔案 | 何時要讀 |
|---|---|
| `commit-format.md` | 要 commit 或寫 PR 描述 |
| `branch-and-delivery-workflow.md` | 開分支、交付 |
| `no-auto-format.md` | 任何改檔 |
| `exception-must-extend-vs-base.md` | 新增／修改例外 |
| `i18n-conventions.md` | 動到字串 |
| `toastification-abstraction.md` | 動到 toast／通知 |
| `aes-cipher-encryption.md` | 動到加解密 |
| `jira-status-transition-policy.md` | 要改 Jira 狀態 |
| `olf-format.md` | 動到 OLF 讀寫／匯入匯出（根 `CLAUDE.md` 那條格式法的守門規則） |

## 步驟 1：確認分支

```bash
git -C Orgs/Viewsonic-EDU/edu-droid-flutter branch --show-current
```

各 repo 分支狀態獨立且會變動。**字串比對失敗時先懷疑「是不是在錯的分支」**，
不要急著調整比對字串——那通常是「這條分支沒有該票的 commit」的徵兆。

## 步驟 2：不要引用 km 路徑

專案 repo 的任何檔案（原始碼註解、README、PR 描述、commit message、Jira 留言）
都不可以出現 km 的路徑。結論寫進註解本身，指標指向 Jira / Confluence / 同 repo 檔案。
送 PR 前：

```bash
grep -rn "docs/features/\|docs/domains/\|docs/repositories/" lib/ test/
```

---

## 註解標準（個人層）

### 描述現狀，不描述 diff

註解描述**現在的程式碼具有什麼性質**，不描述**這次改動做了什麼**。
出現「**原本**少了這個守衛」「**之前**是 X 現在改成 Y」「一直沒被發現」就是寫錯了。

為什麼：「原本」對後來的人是未定義的（哪個 commit 之前？），只能翻 history；
而且它會過期——再兩次重構就失去意義，卻沒人會回來更新。它是一則永遠不會被維護的
changelog。歷史屬於 commit message 與 Jira。

做法是**保留陷阱、丟掉敘事**，並補一句明確的「不要這樣改」：

❌
```dart
// 原本少了這個守衛：saved 是 0（偶數），build number 為奇數時就會誤判…
// 全新安裝時 box 本來就空、reset 無感，所以一直沒被發現。
```

✅
```dart
// _savedBuildNumber == 0 是「從來沒有記錄過」的哨兵值，不是真的 build number。
//
// ⚠️ 0 同時也是偶數。少了這個守衛，全新安裝一個奇數（stage）build 時
// `奇 != 偶` 會成立，被當成「stage ↔ production 切換」而清掉 activation storage。
// 不要把條件「簡化」成只比奇偶。
```

延伸：「為什麼以前沒事」是考古，不要寫；只留「為什麼現在會痛」。
「目前所有呼叫端都傳 false」可以留，但「目前」會過期——若那是刻意維持的約束，
就寫成約束。

### 沒有編譯期保護的隱性依賴，必須寫進註解

只要正確性依賴編譯器看不到、測試也不一定抓得到的前提，就在那一行旁邊寫清楚。四類：

| 類型 | 例子 |
|---|---|
| 跨 process 假設 | `static` 旗標當共享狀態——前提是 manifest 沒宣告 `android:process` |
| 跨 repo 行為契約 | 失敗不自我重排，靠呼叫端「還會再問一次」 |
| 跨語言常數 | 同一字串在 Dart 與 Java 各寫一份 |
| 順序依賴 | 「A 必須在 B 之前初始化」，型別上看不出來 |

**寫三件事，缺一不可**：前提 / 破掉的後果 / 屆時的正解。
只寫前提等於沒寫——讀的人不知道違反會發生什麼，就會覺得無所謂。

### 不要複述「程式碼已經是真相來源」的東西

判準不是「是不是清單」，而是**這段註解刪掉之後，資訊會不會遺失**。

| | 例子 | 為什麼 |
|---|---|---|
| ❌ | 白名單陣列旁寫「排除的欄位有這三個」 | **冗餘複述** —— 真相來源就是旁邊的陣列。兩份表述必然脫鉤，且脫鉤時沒人知道。刪掉不損失任何資訊 |
| ❌ | 註解裡抄**別的 class 的常數值**（色碼、尺寸、id） | **跨檔冗餘複述** —— 那個值改了不會有人回來更新這裡，而且脫鉤時沒有任何徵兆。要寫的是**判準**（「這塊底色畫自 X、不隨主題變動」），不是值 |
| ✅ | 「A31 是唯一用 store flavor 的 IFP」 | **新資訊** —— 這在該檔案（甚至整個 repo）查不到，要看 build config ＋ 出貨機型清單。刪掉就是知識遺失 |

所以「已知的例外／個案」該寫，而且往往是註解最有價值的部分。要寫的是**規則與判準**
（下一個人拿它做決定），不是**從別處衍生的結論**（會過期）。

**由來（跨檔那列）**：VB-2267。手掌擦的註解原本抄了 `VSGlobalColors` 的三個色碼
（`unknownGray1 #fafafa` 等），Jay 指出：「你引用了很多這種色碼，而且是在其他 class，
這樣其他地方如果改了，也要改這邊的值？如果沒改動，註解就會錯」。改成寫不變條件 ——
「`_buildEraserImage` 整支都不讀 `vsColors`／`Theme`」—— 色票怎麼調都不影響這句的真偽，
再附一行 grep 指令讓它壞掉時會被發現。

**寫「新資訊型」的枚舉時，附上怎麼查證：**

```java
// A31 是唯一用 store flavor 的 IFP（其餘走 ifp flavor）。
// 查證：android/app/build.gradle 的 productFlavors ＋ 出貨機型清單。
```

哪天多了一台，讀者照著查一次就會發現清單過期。跟「`檔案:行號` 要附上該行內容」同一招：
**不求指標不壞，只求壞掉時會被發現。**

---

## 引號：新程式碼一律單引號

`analysis_options.yaml` 裡 `prefer_single_quotes` 是**關的**，但那不代表不在意——
它是**分階段遷移**：全開會噴 **2282** 個（`lib/` 實測），一次 `dart fix` 的巨大 diff
既難 review 也容易與他人的分支衝突。**收斂到夠少之後就會打開 lint。**

所以規則是：

| 情境 | 做法 |
|---|---|
| **新增／修改到的行** | 一律**單引號**，不管周圍是什麼 |
| 沒動到的行 | **不要**碰（見該 repo 的 `no-auto-format.md`） |
| 字串本身含單引號 | 用雙引號避免 escape（lint 自己的例外） |
| 內插 `${}` 裡的嵌套字串 | 用雙引號即可，**lint 不會抓**（已實測確認） |

同一個 statement 裡混用（如 `get("x", defaultValue: '')`）是最糟的——
讀的人會以為兩種引號有語意差別。既有程式碼裡很多這種，新寫的不要再產生。

### 怎麼驗「這次的改動有沒有照規則」

不要靠肉眼，也不要為了檢查就把 lint 常駐打開。暫時啟用 → 只看落在本次改動行上的
命中 → 還原：

```yaml
# analysis_options.yaml
linter:
  rules:
    prefer_single_quotes: true    # ⚠️ 必須放在 rules: 底下（4 空格）
```

⚠️ **縮排放錯會被靜默忽略**：放在 `linter:` 底下（2 空格）yaml 不會報錯，
`dart analyze` 也不會有任何提示，只是規則從未生效——踩過一次。

```bash
fvm dart analyze <改動到的檔案…> | grep prefer_single_quotes
```

再把命中的行號與 `git diff -U0 HEAD -- <file>` 的 `@@ +start,count @@` 交集，
只修落在新增行上的那些（未追蹤的新檔則全檔都算）。改完**記得還原
`analysis_options.yaml`**，用 `git diff -- analysis_options.yaml` 確認沒有殘留。

### ⚠️ 量 base 的 analyze 數字時，不要把 base 版本蓋回工作檔

要比「我的改動有沒有新增告警」得跑兩次 analyze。**不要**用
`git show HEAD:<file> > <file>` 這種就地覆蓋的作法量 base —— 那會**無聲地洗掉
自己還沒 commit 的編輯**（`dart analyze` 只吃路徑，覆蓋成功不會有任何提示）。

改用不碰工作檔的作法：

```bash
# 把 base 版本放到 repo 外，在那裡量
mkdir -p /tmp/base && git show origin/master:lib/foo.dart > /tmp/base/foo.dart
fvm dart analyze /tmp/base/foo.dart | tail -2
```

`/tmp` 的單檔 analyze 會少掉專案的 `analysis_options.yaml`，數字未必可比 ——
**真的要精準比對就先把改動 commit 起來**（之後要改再 amend），
用 `git stash` 搬移是最差解（stash stack 跨 worktree 共用，可能動到別人的暫存）。

**由來**：VB-2193。為了量 lint 差異把兩個 base 檔 `cp` 回 `lib/`，把當次的編輯整個洗掉，
只能照 diff 重做一次。徵兆：`git diff` 突然變空、或只剩一部分改動。

---

## 寫測試

### ⚠️ `testWidgets` 裡做真實 I/O 必須包 `tester.runAsync()`

`testWidgets` 跑在 fake async 下，**真實檔案 I/O 的 Future 永遠不會完成**。
直接 `await` 一個會讀寫磁碟的函式，測試會一路卡到 flutter_test 的預設上限：

```
10:00 +0 -1: <測試名> [E]
  TimeoutException after 0:10:00.000000: Test timed out after 10 minutes.
  dart:isolate  _RawReceivePort._handleMessage
```

**看到整整 10 分鐘的 TimeoutException，先想這條** —— 不是死結、不是效能問題，
也不要去調 `timeout`。把呼叫包進 `runAsync`：

```dart
List<Foo>? result;
await tester.runAsync(() async {
  result = await thingThatTouchesDisk(...);
});
expect(result, ...);
```

**判斷是不是這條**：把同一段邏輯改用普通 `test()`（沒有 fake async）跑一次，
會過就是它。純 `test()` 沒有 `BuildContext`，所以需要 context 的只能用
`testWidgets` ＋ `runAsync`。

⚠️ `runAsync` 裡**不能**呼叫 `tester.pump()`，所以「在非同步作業進行到一半時
改變 widget 樹」做不到 —— 依賴那種時序的守衛就會測不到（見
`cross-system-claims.md` 的變異測試第三個確認）。

---

## 需要時再讀（同資料夾的子檔）

拆出去是因為這些只有**真的在做那件事**時才用得到；每次叫這個 skill 都載入的話，
光 build 那一份就佔掉三分之一。**索引寫的是徵兆，不是主題** —— 你會先看到症狀，
才知道要查什麼。

- [`build.md`](build.md) — 建置與安裝。編譯停在「ClassSwift 尚未取得」或「Finch 尚未取得，或缺少同步標記」／`exit 127 ./gradlew`／「版本解析失敗、Flutter SDK 是 3.27.1」／裝上去的 APK 版號變成 1.0 並跳 Whiteboard Updater／`INSTALL_FAILED_UID_CHANGED`／packaging 找不到 keystore
- [`delivery.md`](delivery.md) — 交付與 Jira 狀態。照抄 transition id 把票**關掉**了／`jira_assign_sprint.sh` 印 ✅ 但票進了已經結束的 sprint／`jira_get_transitions` 拿不到 `to`
- [`i18n.md`](i18n.md) — i18n（POEditor）。term comment 到底誰寫（兩份團隊文件講反）／POEditor pipeline 排隊 30 分鐘沒動／`add_comment` 回 `updated=0`／要不要順手把其他語言的翻譯也補上
- [`assets.md`](assets.md) — 圖片資產。改了 `.svg` 但 App 顯示舊圖／logo 在亮暗兩個主題取到同一支檔／要驗 `.svg.vec` 的顏色／要讓一張圖跟著主題翻色
- [`ui.md`](ui.md) — UI：tooltip、semantics、色票。tooltip 在機器上一個都不出現／螢幕閱讀器按不動某個自訂控制項／套了名字裡有 `Disable` 的色票結果整列在白底上消失
- [`platform.md`](platform.md) — Android 平台：headless engine 與背景工作。headless 丟 `MissingPluginException` 卻被 try/catch 吞掉、後面照跑／要重用既有函式到 headless／要新增 `JobService` 或挑 job id
- [`release.md`](release.md) — hotfix 與發版。squash merge 的 PR 能不能 backport／cherry-pick 的衝突該照哪邊解／`patch-id` 不同是不是掉東西了／release note 什麼時候寫、怎麼驗／改了 `classswift-ref.properties` 但 PR 只跑一項檢查就全綠／在 hotfix worktree 裡讀團隊 skill 說檔案不存在／build 完了要不要接著跑對外 distribute／Play Console 上要填什麼、Play 現在對外是哪一版

## 相關 skill

- `mvbf-review` — review（稽核指令、自己改動要多問的問題、如何驗證別人的 review 意見）
- `mvbf-commit` — commit 與 PR 描述
- `handoff-docs` — 對外文件（PR 描述、Jira 留言、跨團隊規格／prompt）。不限 repo
