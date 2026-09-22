# mvbf — hotfix 與發版

**先讀 [`SKILL.md`](SKILL.md)**（步驟 0–2、註解標準、引號）。這裡只放「真的在做這件事時才需要」的部分，從 SKILL.md 拆出來的，內容未改。

> 什麼時候讀：squash merge 的 PR 能不能 backport／cherry-pick 的衝突該照哪邊解／`patch-id` 不同是不是掉東西了／release note 什麼時候寫、怎麼驗／改了 `*-ref.properties` 但 PR 全綠／在 hotfix worktree 裡 `cat` 團隊 skill 說檔案不存在／build 完了要不要接著跑對外 distribute／Play Console 上要填什麼、rollout 要設多少、Play 現在對外是哪一版

---

## 出 hotfix / 發版：補在團隊 skill 之外的判準

流程本體在**專案 repo 的** `.claude/skills/mvb-hotfix-release/SKILL.md`（團隊維護，不要在這裡複製）。
以下是團隊 skill **沒涵蓋**、**講得太緊**、或**已經過期**的地方，分兩批：

| 批次 | 由來 |
|---|---|
| §1–§4 | 2026-09-18 出 `3.10.207`（VSFT-10164 / backport PR #287） |
| §5–§10 | 2026-09-22 出 `3.10.208`（VB-2335 / CS bump PR #293）與同日的 3.11.6 RC |

> 📤 **這些應該上游到該 repo（§4 進 `mvb-release-note`，其餘進 `mvb-hotfix-release`），
> 待與 Jay 確認。** 在那之前先放這裡，不要自己去改專案 repo。

### 1. squash merge 的 PR 可以安全 backport（§4 那條「停下來回報」要分兩層）

skill §4 說「master 上只找得到一顆涵蓋全部改動的，就是 squash —— **停下來回報，不要往下挑**」。

那條的**本意**是「不要拿 PR 頁面上的 SHA 去挑」（那些 SHA 不在 master 歷史上）。
但 squash 之後，**master 上那一顆就是該 PR 的完整淨改動**，挑它不會漏、也不會多帶。

所以判準是：**停下來回報是對的（讓人確認範圍），但「不能挑」不成立。**
回報時要講清楚「PR 有 N 顆、master 上只有 1 顆、那 1 顆等於全部」，由人拍板。

**證據等級：實測。** PR #275 `gh api .../pulls/275` 回 `commits=3`、
`merge_commit_sha=68d68db40`（1 個 parent），master 上只有那一顆；cherry-pick 後
增刪行與來源逐行相同（比對法見第 3 條）。

### 2. 衝突可能來自「不在範圍內的 commit 的 context」——解法要看 hotfix 線自己的前提

skill §5 只說「用**上界**那一刻的檔案狀態當基準，不要用 master 最新狀態」。
但它沒說：**上界的那個狀態，本身可能依賴一顆你並沒有要 backport 的 commit。**

實例：`android/app/src/store/AndroidManifest.xml` 的衝突，來源 commit 的 context 含
`7c4da965f`（移除 `SetLanguageActivity` 的 exported 覆寫）之後的狀態。照那邊解會把覆寫
一併拿掉 —— 但 `7c4da965f` 的**前提**是 ClassSwift v1.9.2 的 drop-standalone 刪掉了該 Activity，
而 hotfix 線釘的是 **CS v1.8.2**（`46eb2aa94`），Activity 還在，覆寫拿掉會讓 store APK
把 CS 的 `exported` 宣告原樣併進最終 manifest。

**判準**：解衝突前先問兩個問題 ——

1. 這段 context 是**哪顆 commit** 造成的？（`git log -S'<那段文字>' <起點>..origin/master`）
2. 那顆的**前提**在 hotfix 線成立嗎？

**版本釘選是最常見的「前提不成立」來源**：CS 版本、Flutter SDK 版本、plugin 版本 ——
hotfix 線釘的通常比 master 舊，master 上「因為升級了所以可以刪」的東西，在 hotfix 線不能刪。

### 3. patch-id 不同時，用「只比增刪行」區分「掉東西」與「只是 context 不同」

skill 講了 patch-id **不是**「必須相同」而是「不同時你要說得出原因」，但沒給怎麼說。

`git patch-id` 會把 **context 行**也算進指紋，所以**純粹因為周圍文字不同**就會變號 ——
這跟「cherry-pick 掉了東西」在輸出上長得一模一樣（都只是兩個不同的雜湊）。可分辨的探針：

```bash
diff <(git show <來源 SHA>   --format= | grep -E '^[+-]' | grep -v '^[+-][+-][+-]') \
     <(git show <分支上那顆> --format= | grep -E '^[+-]' | grep -v '^[+-][+-][+-]')
```

無輸出 ＝ **增刪行逐行相同**，差異只在 context → 正常，可以寫進 PR 描述當證據。
有輸出 ＝ 真的不一樣，逐行看是不是掉了東西。

⚠️ **對照組**：這條探針要在一個**已知有實質差異**的 commit 上跑出非空輸出，
才證明它有鑑別力（見 `cross-system-claims.md` §5）。

### 4. release note 的 route A 已經寫過線上頁面了（`mvb-release-note` 那句已過期）

那份 skill 寫著「Every publish so far has gone through route B, so route A has not yet
written to the live page. Treat its first real use as a shakedown.」——
**2026-09-18 已經不成立**：`scripts/mvb_release_note_publish.py --publish` 真的寫了，
page version 98 → 99，三道 post-write guard 全綠
（`node count 506 (expected 506)` / `old content byte-identical` / `new sections byte-identical`）。

所以 route A 現在是**預設路徑**，不必再當 shakedown 對待。但那次的作法仍值得照做，
因為它便宜：`--self-test`（21 checks）→ dry run 讀節點數與 APK URL → 才 `--publish`，
而且**三個 guard 要逐項讀**，不要只看 exit code。

⚠️ 那份 skill 的其他內容（route B 的取 body、slicing、`PYTHONIOENCODING=utf-8`）沒有過期，
只有「route A 還沒上線過」這一句要改。

**2026-09-22 第二次實測**（3.10.208）：page version 100 → 101，`node count 521 (expected 521)`、
`old content byte-identical`、`new sections byte-identical`，`--self-test` 已成長為 25 checks。

**時機：build 一跑完就可以寫，不必等 QA、也不必等對外 distribute。** 頁面連的是
**backup 路徑**（`uploads/MVBF_V3_Backup_Workflows/official/...`），那是第 1 支 workflow
就填好的；對外 OTA 路徑（`uploads/MVBA/V2`）從頭到尾不出現在 release note 上。
只有兩個前提：版號 commit 已經回到 hotfix 分支（否則 manifest 還是舊版號，skill 自己說
「the release is not ready to log」），以及 APK URL 都 probe 到 200。

### 5. hotfix 線的 PR **不會**跑 ClassSwift / Finch 的 tag gate

改 `classswift-ref.properties`（或 `finch-ref.properties`）的 PR 進 `hotfix/**` 時，
**唯一被觸發的 workflow 是 `unit-test.yml`** —— 而那支不走 `.github/actions/android-setup`，
所以「ref 必須釘在 tag 上」那三道 gate **一次都不會跑**。它們在 `production.yml` /
`beta.yml` / `daily-build.yml` 等發版 workflow 裡，那些都不吃 PR 事件。

後果：**ref 寫錯（打錯字、指向不存在的 tag、寫成 SHA）時 PR 會是綠的**，
要到發版 build 才炸 —— 那時已經動了版號。

**做法**：合併前自己手動跑一次等價檢查（三項都要）：

```bash
grep '^ref=' classswift-ref.properties                      # 1. 必須是 tag 名，不是 SHA
git -C <ragdoll-cat> ls-remote --tags origin '<tag>'         # 2. 遠端真的有這個 tag
git -C <ragdoll-cat> describe --tags --exact-match <sha>     # 3. 該 commit 正好落在該 tag 上
```

**查證方式**（確認這條在你動手的那條線上是否仍成立 —— workflow 會變）：

```bash
grep -rln android-setup .github/workflows/                   # 哪些 workflow 有 gate
# 再看那幾支的 on: 有沒有涵蓋 hotfix/**
```

**證據等級：實測**（2026-09-22，PR #293）。該 PR 的 checks 只有 `Flutter Unit Tests` 一項；
`hotfix/3.10.208` 上 `on:` 含 `hotfix` 的 workflow 只有 `unit-test.yml`。

> master 上有一顆 `[CI] unit-test 的 PR 觸發加上 hotfix/**` —— 那講的是 unit-test 本身，
> 跟 tag gate 無關，不要看到它就以為 gate 也跟著進來了。

### 6. 團隊 skill 與 rules **不在 hotfix 分支上**，要從 `origin/master` 讀

hotfix 分支切自一個舊的 production tag，所以那個時間點之後才加進 master 的東西
**在工作區裡根本不存在**。`mvb-hotfix-release` skill 自己就是這種
（master 上的 `[Task] 新增 mvb-hotfix-release skill 與 backport 驗證腳本 (#260)` 加的）。

**徵兆**：`cat .claude/skills/mvb-hotfix-release/SKILL.md` 回
`No such file or directory` —— 很容易誤讀成「這個 repo 沒有這份 skill」。

**做法**：在 hotfix worktree 裡一律用

```bash
git show origin/master:.claude/skills/<name>/SKILL.md
git show origin/master:.claude/rules/<name>.md
```

**連帶的真正風險**：流程文件讀不到，就會憑印象做事 —— 見下一條。

### 7. 開 hotfix 分支**之前**要把團隊 skill 的 §6／§9／§10 一起讀完

團隊 skill 的 §1（確認起點）與 §2（版號驗證 → 開分支 → push）讀完之後，手上已經有
可以動作的東西，很自然就會直接動手 —— 但**改動不可以直接 commit 在 hotfix 分支上**，
那條寫在 §6：

> 不要直接 cherry-pick 到 hotfix 分支上 —— 走 PR 才有 review。
> （`hotfix/*` 沒有 branch protection，所以直推是技術上可行的；走 PR 是刻意的選擇。）

**「技術上可行」正是它危險的地方**：直接 commit 不會有任何錯誤，只有在 push 之後
才會變成既成事實。

**由來**：2026-09-22 出 3.10.208 時我就是這樣做的 —— 讀完 §1/§2 開好
`hotfix/3.10.208` 並 push，接著把 CS bump 直接 commit 上去。push 前才發現，改成
工作分支（`Jay/VB-2335-classswift-v1.8.3`）重來，遠端的 hotfix 分支沒被污染。

**做法**：開分支那一步之前，先把 §6（工作分支）、§9（push）、§10（PR 描述要有什麼）
一次讀完。§10 要求 PR 描述包含「刻意排除了哪些，以及為什麼」，那是**動手前**就要
想清楚的事，不是寫描述時才回頭補。

### 8. 第 2 支 workflow（對外 distribute）不是「build 完就按」

`mvb-hotfix-release` §12 的明文前提只有「第 1 支完整跑完」（理由是 Phase 1 會檢查
flavor 缺項）。但執行史顯示中間還有一道**人為判斷**：

| 版本 | 第 1 支 build | 第 2 支 distribute | 間隔 |
|---|---|---|---|
| 3.10.205 | 2026-09-03 14:16Z | 2026-09-08 08:54Z | 約 4.8 天 |
| **3.10.206** | 2026-09-17 11:55Z | **從來沒有** | — |
| 3.10.207 | 2026-09-18 03:29Z | 2026-09-18 05:33Z | 2h04m |

**3.10.206 build 出來了、上了 backup 路徑，但從未對外 distribute**，隔天被 3.10.207 取代。
這是「有東西擋在中間」的硬證據 —— 不可能是自動接著做的步驟。

兩支的差別也支持這個讀法：第 1 支只把產物放進 **backup 路徑**並上架 Play/TestFlight 的
**內部**通道（名字裡的 "Internal Release"），第 2 支才複製到對外 OTA 路徑
（帶 `--acl public-read`）並改 `uploads/MVBF/mvbf_v{版號}.txt` 標記檔 —— **標記檔一改，
裝置就開始收到更新**。

**證據等級**：間隔與 3.10.206 沒有 distribute 是**實測**（`gh run list --workflow=neo_distribure_s3.yml`
全部只有 3 次 run，2026-09-18 那次的 input 是 `production-version=3.10.207`）；
「那道判斷是 QA 驗收」是**推論** —— 誰驗、驗什麼、誰點頭，我查不到，skill 也沒寫。

**做法**：第 1 支跑完後**不要自己接著按第 2 支**，回報給 Jay 由他決定時機。
（2026-09-22 3.10.208 這輪，Jay 決定**只出 Google Play，不出 OTA**。）

---

### 9. Google Play Console 的手動步驟（CI **完全不碰** Production track）

`neo-official-build-release.yml` 對 Play 只做一件事：把 `production_release` 的 AAB
上傳到 **`track: production_candidate`**，而那是一個 **closed testing** track。
**Production track 上的一切都是人在 Play Console 做的，沒有任何自動化。**

所以「發 store 版」實際上是兩段，中間隔著 QA：

```
CI 上傳 AAB ──→ Closed testing「production_candidate」──→ Production track
              （Publish 才給指定測試者）        （Promote / 建 release → 送審 → 發布）
```

> ⚠️ **Managed publishing 是開著的**，所以每一步都會先變成 Publishing overview 上的
> 「Changes ready to publish」排隊，要人按 `Publish N change(s)` 才生效。
> 好處是：按錯順序不會直接對外，還來得及 `Remove changes`。

#### 第 1 段：closed testing 的 `production_candidate`

Publishing overview 會出現一筆，**變更項目自己標明 track**：

```
Closed testing - production_candidate
  3.10.208    Start full rollout
```

按 `Publish 1 change` = 在**那個 closed track** 上全量推出，對象是該 track 的指定測試者。
**公開的 Play 使用者拿不到。** QA 其實也不必等這步 —— backup 路徑的 STORE APK
（release note 上那條連結）早就可以裝了。

#### 第 2 段：Production track 的 release（Test and release ▸ Production）

`Create production release` 那頁要填的東西與**慣例**：

| 欄位 | 怎麼填 | 證據等級 |
|---|---|---|
| **Release name** | **照 Play 預填的不要改**，長相是 `30102082 (3.10.208)`（build number ＋ 版號） | 同事慣例（Jay 2026-09-22 轉述） |
| **Release notes** | 用 **`Copy from a previous release`**。hotfix 通常就只有 `<en-US>` 的 **`Bug fixes`**，**不翻譯**（頁面會顯示 `Release notes provided for 1 of 19 languages`，那是正常的） | 同上 |
| **Roll-out percentage** | **100**。理論上分段放量可以控風險，但同事的實務理由是「**怕忘記回來調**」，所以一律 100 | 同上；「分段放量是為了控風險」是**推論**，沒有團隊文件寫 |
| **Country availability** | `Available in all targeted countries` | 畫面預設 |

`Preview and confirm` 那頁值得**真的讀一下**的兩塊：

- **Changes to your supported devices** —— 3.10.208 的數字是 Phone 4,607 / Tablet 4,781 /
  TV 3 / Car 22 / Chromebook 37 / Android XR 1，而且
  **`Devices no longer supported` 與 `Newly supported devices` 都是 0**。
  這一欄是 manifest 出問題時唯一會說話的地方（權限、`uses-feature`、`minSdk` 動到都會反映在這裡）——
  只改 `classswift-ref.properties` 這種版本 bump，**它就該是 0**，不是 0 就要回頭查。
- **Staged roll-out** 的 `Installs targeted by rollout`（3.10.208 是 142,840）要等於
  `Installs on active devices`，那是「100% 真的是 100%」的交叉確認。

填完按 `Save` —— 頁尾寫著「changes will be saved in Publishing overview, **ready for you
to send for review**」，也就是 Save **不會**直接送審，要回 Publishing overview 再按一次。

#### ⚠️ Production track 的上一版不一定是上一個 hotfix

3.10.208 那頁的 `Not Included` 顯示上一個 production release 帶的是
**`30102042 (3.10.204)`** —— 也就是 Play 的 Production track 當時停在 **3.10.204**，
中間的 3.10.205 / 206 / 207 都沒有上去（3.10.207 在 closed track 上仍是
「Available to selected testers」）。

**判準**：**不要假設「出了 hotfix ＝ Play 上就有」。** 要知道 Play 現在對外是哪一版，
去看 Production track，不要從 hotfix tag 或 OTA 標記檔推。這跟 OTA 那條線是完全獨立的
兩個出貨管道（OTA 看 `uploads/MVBF/mvbf_v{版號}.txt`，見 §8）。

#### 走哪條路進 Production：**在 Production 建 release、從 library 選 bundle**

closed testing 頁上每個版本旁邊都有 `Promote release`，但**慣例不是走那條**。實際做法是
到 **Test and release ▸ Production ▸ Create new release**，再從 **app bundle library**
挑同一顆 bundle（`30102082 (3.10.208)`）。

> Jay 2026-09-22 明確確認：「我是在『在 Production 直接建 release 再從 library 選 bundle』」。

**所以 CI 上傳到 `production_candidate` 有兩個作用**，不只是給測試者裝：
它同時把那顆 AAB **放進 Play 的 app bundle library**，Production 的 release 才挑得到。
兩條 track 用的是**同一顆 bundle**，不會重新 build，版號與簽章自然一致。

#### Publishing overview 有**兩個不同的區塊**，落在哪一區就代表要不要送審

| 區塊 | 什麼會落在這裡 | 右邊的動作 |
|---|---|---|
| **Changes ready to publish** | closed testing track 的變更 —— **不需要 Google 審核** | `Publish N change(s)` |
| **Changes not yet submitted for review** | **Production track** 的變更，**還沒**按送審 | `Submit N change for review`／`Save for later`（退回草稿，別誤按） |
| **Changes in review** | 同一筆，**按下送審之後**（區塊會直接改名） | `Remove changes`（還收得回來） |

**這是免費的交叉確認**：如果你以為自己在動 Production，變更卻出現在
「Changes ready to publish」，那就是**動到 closed track 了**，反之亦然。
按鈕文字（publish vs submit for review）也會跟著不同。

送審前 Play 會**自動跑一輪 quick checks**（畫面上是進度條 ＋「Up to 8 minutes remaining」）：

> Running quick checks for commonly found issues —— These checks help to find certain
> policy and app quality issues, so you can fix them before review.
> **When you send changes, they'll be sent as soon as the checks complete successfully.**

所以**不必等它跑完才按** `Submit` —— 按下去會排隊，checks 一過就自動送出。送審後同一條
進度條還在，只是文案從「When you send changes…」變成「Changes will be sent for review
as soon as checks complete successfully」。

⚠️ **那個剩餘時間不是倒數，會往上跳**（2026-09-22 實測：按 Submit 前顯示
「Up to 8 minutes remaining」，按完之後變成「Up to 14 minutes」）。看到數字變大不要以為
卡住或出錯了，它是估計值。

完整的關卡數（managed publishing 開著）：

```
Save（進待送審清單）→ quick checks（自動，約 8 分鐘）
  → Submit for review（人）→ Google 審核 → 發布（人，因為 managed publishing）
```

#### 兩段是各自獨立的變更，順序不互相依賴

managed publishing 之下，兩段各自產生一筆「Changes ready to publish」，**可以分開按**。
2026-09-22 那次 Jay 是：先把 Production 的 release `Save`（進待發佈清單），
再回頭把 closed testing 那筆 `Publish` 掉 —— 兩者沒有先後要求。

> 我沒有 Play Console 的存取權，本節每一條都來自 Jay 2026-09-22 給的畫面截圖與當場確認。

### 10. 三條線的關係：rollback 跟著 production 走，beta（RC）可以單獨出

`neo_distribure_s3.yml` 有三個彼此獨立的版號輸入，機制上任意組合都行（至少填一個）。
但**實務上不是等價的**：

#### rollback 與 production 是一對

**Jay 2026-09-22 口述**：

> rollback 和 production 通常會一起出，這兩個版本**只有版號差異，codebase 是相同的**，
> 因為要讓使用者可以無痛退舊版 —— 雖然 app 版號是增加，但 codebase 是實質上的退版。

機制上對得起來（**讀碼與 manifest 可證**）：

- `combo-patch-production` 一次 bump **三個** key（`production_staging` / `production_release` /
  `rollback`），所以它們**出自同一顆 commit、同一次 build**，差別只有版號
- 版號是配對的：`3.10.204 ↔ 3.12.4`、`3.10.207 ↔ 3.12.7`、`3.10.208 ↔ 3.12.8`
  —— rollback 的 minor 固定 +2、patch 對齊
- rollback 的 OTA 路徑是 `uploads/MVBA_Rollback/V2`，flavor 清單與 beta 相同
  （`IFP EDLA IFP_ABI EDLA_ABI`，**沒有 STORE / OPEN**）

**為什麼要這樣做**：裝置端只接受版號往上的更新。把「上一版的程式碼」包成一個**更高的版號**
放在 rollback 通道，下次 production 出問題時，就能讓裝置「升級」到 3.12.x —— 版號往上、
**程式碼實際上退回去**。所以 rollback 通道裡躺的永遠是**前一版的 codebase**。

**build 與 distribute 都要一起。** build 一定一起（由 COMBO 決定，人無法只 build 其中一個）；
**對外 distribute 也必須一起 —— 放 production 就要放 rollback。**

`neo_distribure_s3.yml` 的實績，以及那個例外的真相：

| 日期 | beta | production | rollback | |
|---|---|---|---|---|
| 2026-08-25 | 3.11.4 | 3.10.204 | 3.12.4 | |
| 2026-09-08 | 3.11.5 | 3.10.205 | 3.12.5 | |
| 2026-09-18 | （空） | 3.10.207 | **（空）** | ⚠️ **出版失誤，未來不得援引此筆** |

> **Jay 2026-09-22 自陳**：「3.10.207 也是我出的，所以我沒出好，照理來說就是要一起出
> rollback 和 production。」

⚠️ **我一開始把這次漏放讀成「distribute 不一定要一起」寫進了本節 —— 那是錯的。**
一次失誤不是反證。**看到與人講的規則不符的歷史紀錄，要先問「那次是不是做錯了」**，
不要逕自把它當成慣例的例外（見 [`cross-system-claims.md`](../../rules/cross-system-claims.md) §1）。

**操作規則**：同一次 distribute 只要填了 `production-version=X.Y.Z`，就要一併填
`rollback-version=<對應版號>`（配對關係見上面的版號表：minor +2、patch 對齊）。

⚠️ **那次漏放的落差還在，但不需要單獨補。** 2026-09-22 的線上 API 實查：production OTA 是
`3.10.207`、rollback OTA 停在 `3.12.5` —— 依配對關係，rollback 通道裡躺的是 `3.10.205`
的 codebase，比 production 舊兩個版本。

**收斂方式（Jay 2026-09-22）：下一次 production 走正常程序、production 與 rollback 一起放，
落差就自然被蓋過去**，不必為了補 3.12.7 而額外跑一次。在那之前兩條通道是錯開的 ——
**這段期間如果真的需要退版，退到的會比預期更舊**，要先知道這件事。

> Jay 原話：「下一次出版就要照正常程序走，一次出 production 和 rollback，這樣就可以處理掉
> 9.18 的失誤。」

**要動 production OTA 之前先量一次**，別假設兩條通道是對齊的：

```bash
for repo in MVBA MVBA_Rollback; do
  curl -s "https://api.myviewboard.com/api/v2/application/repo/${repo}?extendsFolder=/V2/IFP/arm64-v8a&arch=arm64-v8a&model=IFP6561&soc=rk30board&version=2.15.3" \
    | grep -o '"file_name":"[^"]*"'
done
```

#### beta（RC）可以單獨出

**Jay 2026-09-22 明確說明：beta (RC) 是可以單獨出的。** 機制上成立（三個輸入獨立），
而且 beta 沒有跟其他兩條的任何耦合 ——
它有自己的 OTA 路徑（`uploads/MVBA_Beta/V2`），跟其他兩條沒有耦合。

實務上要**刻意把 production / rollback 留空**：dispatch 表單三個欄位並列，
很容易順手把三個都填上去 —— 那會把還在審核、或刻意不想出 OTA 的 production 版本一起放出去。

#### ⚠️ 按 Cancel **不會**收回已經複製出去的東西

`neo_distribure_s3.yml` 的 Phase 2 是一連串 `aws s3 cp --recursive --acl public-read`，
**每一次 cp 一完成就已經是對外的檔案**。取消 workflow 只會停止「還沒跑到的那幾步」，
已經寫進 OTA 路徑的物件**原封不動留著**。

而且 `aws s3 cp` **只加不刪** —— 舊版的 apk 不會被移走，新舊會並存在同一個資料夾。
所以善後只能**人工去 S3 刪檔**，沒有任何 workflow 做得到。

**反過來說，補跑是安全的。** `cp` 不做變更偵測（那是 `sync` 的事），所以整支重跑時：
已經複製過的 key 會被**同內容覆寫**、缺的會補上、既有的舊版 apk 留著。
`copy_and_verify` 數的是輸出的 `^copy: ` 行數，重傳一定會產生那些行，
**不會因為「已經存在」而變成 0 個而中斷**。中途取消之後直接補跑同一組輸入即可，
不必先清乾淨。（2026-09-22 3.11.6 RC 就是這樣補完的。）

**由來（2026-09-22）**：一次 dispatch 三個欄位都填了
（`beta-version=3.11.6` / `production-version=3.10.208` / `rollback-version=3.12.8`），
其中 production 與 rollback 是**刻意不該出**的（3.10.208 當時還在 Google Play 審核中，
且已決定只出 store 不出 OTA）。發現後按了 Cancel —— run 顯示
`Release APK — S3 copy: cancelled`、marker 那步 `skipped`，**但兩分鐘內已經複製了很多檔案**，
3.12.8 與 3.10.208 的 apk 都已經躺在對外路徑上，最後是人工去刪。

**判準**：

1. **dispatch 前把不要出的欄位清空，這是唯一有效的防線。** 按下去之後就沒有回頭鍵 ——
   這支 workflow 沒有 dry-run，Phase 1 的檢查只驗「來源齊不齊」，不會問你「真的要放這三條嗎」。
2. 真的按錯了：**立刻 Cancel（能少複製一點是一點），然後馬上找人工刪 S3**，
   不要以為 cancel 就沒事了。
3. 善後**進行中**不要急著用線上 API 的讀數下結論 —— 刪檔還在跑時，讀到的只是那一瞬間的狀態，見下一條。

#### ⚠️ 別人正在改動狀態時，相隔幾分鐘的兩次觀測不能相減

查 OTA 現況的探針是對的 ——
`https://api.myviewboard.com/api/v2/application/repo/<repo>?extendsFolder=/V2/<flavor>/<abi>&…`
（`scripts/mvb_version.py` 用的那支）確實反映該路徑上的版本。

**2026-09-22 我從它推出了一個錯誤結論。** 當時 Jay 說「3.12.8 與 3.10.208 的檔案已經在 S3 上」，
而我查 API 得到 `MVBA → v3.10.207`、`MVBA_Rollback → v3.12.5`，就據此寫下
「API 回的版號 ≠ S3 上有哪些檔案，兩者是不同的問題」—— **那是錯的**。
真相是**他的同事正在同一時間刪那些檔案**，所以「檔案在」與「API 回舊版」根本不是同一個時刻的狀態，
兩者之間沒有矛盾可言。是 Jay 當場指出來的。

**判準**：**狀態正在被別人改動時，不要拿不同時刻的兩個觀測去推結構性結論。**
「A 說有、我查沒有」在這種情況下最可能的解釋是**時序**，不是機制。
要下機制的結論，得先讓狀態靜下來，或在**同一時刻**取得兩邊的讀數。

**徵兆**：出現「某人告訴我的狀態」與「我自己查到的狀態」不一致，而且**正好有人在動那個東西**
（善後、刪檔、重跑 pipeline）。這時該做的是問「現在還在動嗎」，不是急著解釋差異。

這跟 [`cross-system-claims.md`](../../rules/cross-system-claims.md) §5 是同一族：
探針沒壞、輸出也沒錯，錯的是我對「這兩個數字可以比較」的假設。

### 11. 發版順序：後端先、前端後，兩邊都在 Teams 群組上公告

**非必要情況下，要等後端部署完成，才發前端 —— OTA 與商店都算前端發佈。**

通知是雙向的，而且走同一個地方：

| 方向 | 做什麼 |
|---|---|
| 後端 → 前端 | 後端部署完成會**在 Teams 群組公告**，那是前端可以開始發的訊號 |
| 前端 → 大家 | 前端**發版完成後也要在群組回報** |

**證據等級：Jay 2026-09-22 轉述**（他當天才得知），**我沒有自行查證**。
團隊文件與 repo 裡都找不到這條 —— 兩支發版 workflow 與 `mvb-hotfix-release` skill
都沒有任何「等後端」或「發完要通知」的步驟，所以它是**流程慣例，不是 CI 擋得住的東西**：
**沒有任何自動化會阻止你在後端還沒上之前把 OTA 放出去。**

**為什麼要在意**：前端先上、後端還沒上，使用者拿到的新版會去打還不存在或還是舊版的 API。
這種失敗通常沒有明確錯誤，只會表現成「某個功能怪怪的」。

#### 界線在哪：**產出可以先做，放出去不行**

擋的不是整個發版流程，只有「**使用者會拿到**」的那一步。Jay 2026-09-22 的說法是
「可以先發版、或是放 S3（但不是 OTA folder），但不能上架或 OTA」，對到實際步驟：

| 步驟 | 後端還沒部署時 | 對應的東西 |
|---|---|---|
| 第 1 支 workflow 整支（bump 版號、跑測試、build 全 flavor、打 tag） | ✅ 可以 | `neo-official-build-release.yml` |
| 產物上 S3 的 **backup 路徑** | ✅ 可以 | `uploads/MVBF_V3_Backup_Workflows/official/<ver>/<stage>/` |
| AAB 上傳到 Play 的 **closed testing**（`production_candidate`） | ✅ 可以（CI 自動做的，不是「上架」） | 第 1 支 workflow 的 Play 步驟 |
| 寫 release note | ✅ 可以（它連的就是 backup 路徑） | 見 §4 |
| **複製到 OTA 路徑** | ❌ **不行** | `neo_distribure_s3.yml` → `MVBA_Beta/V2`、`MVBA/V2`、`MVBA_Rollback/V2` |
| **Play 的 Production track**（建 release／送審／發布） | ❌ **不行** | Play Console 手動步驟，見 §9 |

**一句話判準：東西「產出來、放在只有我們拿得到的地方」都可以先做；
一旦那個動作會讓使用者拿到新版本，就要等後端。**

⚠️ **beta／RC 的 OTA 也算「放出去」** —— `MVBA_Beta/V2` 一樣是對外路徑
（`--acl public-read`，且後端會回報給裝置，見 §10）。不要因為它叫 beta 就當成內部。

> **`production_candidate` 那一列我標成可以，是因為它由第 1 支 workflow 自動完成、
> 而 Jay 把界線畫在「上架」。但我沒有直接問過這一列，證據等級是推論** —— 有疑慮就問。

#### 這一段我查不到，也不該由我做

**Teams 那部分我沒有辦法查證**（Jay 2026-09-22 明確說明），而且**通知必須由 Jay 本人發**。
所以不要嘗試去抓群組訊息來判斷「後端上了沒」，也不要以為這是可以自動化的一步。

**我在這條規則裡的角色只有一個：提醒。** 具體是 ——

- 要跑 OTA distribute 或 promote 商店版之前，**問一句「後端部署完成了嗎」**，
  不要因為 CI 全綠就當作可以發（沒有任何 gate 會擋）。
- 發版完成之後，**提醒 Jay 去群組回報**。那是他要做的事，不是我。

**待補（問到再寫，不要猜）**：「非必要情況」的例外邊界 ——
例如純 client 的修正（VB-2335 那種完全不碰後端的）是不是就不受這條限制。
