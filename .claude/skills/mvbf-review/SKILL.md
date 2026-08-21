---
name: mvbf-review
description: "Use when reviewing code in edu-droid-flutter (mvbf) — own changes before delivery, a PR, or when relaying another reviewer's findings. Covers the audit commands, what to check manually, and how to verify review claims before acting on them. Examples: \"review 這些改動\", \"幫我看一下這個 PR\", \"另一個 agent 給了 review 意見\""
---

# mvbf code review

**先讀 `mvbf` skill**（步驟 0–2、註解標準、引號、headless 邊界）。這裡只放 review 特有的部分。

---

## 1. 自動稽核（先跑，便宜）

```bash
cd Orgs/Viewsonic-EDU/edu-droid-flutter

# km 路徑洩漏（註解／README／PR 描述都算）
grep -rn "docs/features\|docs/domains\|docs/repositories\|jay-viewsonic-km" lib/ test/ android/app/src/main/java/

# 註解標準：描述 diff 的字眼
git diff --cached | grep "^+" | grep -nE "原本|之前是|現在改|一直沒|修正前|現階段"

# 會過期的相對詞（人工判斷：runtime 語意的「目前」是誤報）
git diff --cached | grep "^+" | grep -nE "目前|暫時"

# 空白噪音（codegen 產生的檔要豁免）
git diff --cached --check

# 殘留除錯碼
git diff --cached | grep "^+" | grep -nE "TEMP|TIMING|System\.out|print\(|debugPrint|Log\.d\("

# TODO/FIXME
git diff --cached | grep "^+" | grep -nE "TODO|FIXME"

# 團隊開不了的指標（km 路徑之外，還有本機／裝置專屬的東西）
git diff --cached | grep "^+" | grep -nE "/sdcard/|scratchpad|/private/tmp|~/\.Trash|[0-9A-Z]{10,}H[0-9A-Z]{3,}"
```

`docs/features/…` 那條大家都記得，**本機產物的檔名更容易漏**：實際犯過在 dartdoc 裡
寫「見 `mvbf-save-probe.olf`（寫 open_sans 的那份）」—— 那兩個檔在我自己裝置的
`/sdcard/Documents/`，別人 clone 下來沒有，等於死指標。連裝置序號也一起寫進 fixture
metadata 了（個人裝置識別，沒必要進版控）。

→ **量測數據要留，指標要指向 Jira／PR**：「來自一次實機量測，結果記在 VSFT-xxxx」。

### `原本 / 之前` 這條 grep 需要人判斷，誤報率不低

實測 4 個命中裡 2 個是誤報，兩種型態：

| 命中 | 判定 |
|---|---|
| 「非該尺寸**原本的**設計」 | ✅ 誤報 —— 指字體設計的原意，不是 diff |
| 「OLF **原本就標** bold 的 run 不受影響」 | ✅ 誤報 —— 描述輸入資料的性質 |
| 「**修正前**的行為：226 個 run 有 198 個…」 | ❌ 真的要改 —— 改寫成失效模式：「解析層失效時它們會全部掉到…」 |
| 「probe.olf（**修正前**）與 probe2.olf（**修正後**）」 | ❌ 真的要改 —— 改成描述內容：「寫 open_sans 的那份 / 寫 Open Sans 的那份」 |

判準：那個「原本」是在講**程式碼的過去**（要改），還是在講**資料／設計的性質**（保留）。

### ⚠️ 兩個會讓稽核靜默失效的坑

**① `git diff` 看不到未追蹤檔，而且不會警告。**
新檔還是 `??` 時，上面所有 `git diff` 系列的檢查會**整批跳過它們**，結果全是綠的。
先確認範圍：

```bash
git status --porcelain     # ?? 的檔案要另外用檔案系統掃
```

實際踩過：整個 Java 側（含 provider、JobService）被漏掃，是因為「Java 怎麼可能一條都沒中」才回頭查。

**② zsh 不做 word splitting。** 把檔案清單放進變數再展開會靜默不執行：

```bash
F="a.java b.java"
grep -n "pattern" $F      # ← ugrep: No such file or directory，然後你看到「✅ 無」
```

**規則：稽核指令要嘛寫死路徑，要嘛用陣列 `F=(a b); grep ... "${F[@]}"`。
看到「零命中」時先問一次「這個檢查真的跑到了嗎」** —— 拿一個你確定會中的字串試一次最快。

---

## 2. 人工複核（自動抓不到的）

- **小 diff 逐行看**：`git diff --cached -- <file>`。10–30 行的檔最容易被跳過，而旗標配對、生命週期掛載點都在那裡。
- **旗標／狀態的配對與失效模式**：設在哪、清在哪、**沒清會怎樣**。
  例：`setMainEngineAlive(true/false)` 掛在 `configureFlutterEngine` / `onDestroy`——
  要問「onDestroy 沒跑會怎樣」（答案：process 死了 static 也沒了，預設安全）。
- **新增的抽象方法有沒有漏實作**：`grep -rn "implements <Interface>" lib/`。
- **codegen 產出的檔不要手改**（Pigeon、l10n）。它們的 whitespace/格式問題是上游的，
  改了下次重新產生就沒了。
- **測試是不是空轉**：用 mutation 驗——把被測的守衛拿掉，確認測試會紅。沒紅就是沒測到。

---

## 3. review 自己剛加的東西時，多問三個問題

這三個問題是交叉 review 抓到、而我自己漏掉的類型：

1. **「這個新狀態讓哪些既有的判斷失效？」**
   最貴的一個 bug 就是這樣來的：新增一個**永久性**狀態（「值不會自行出現」），
   而既有守衛隱含假設「值是空的 ＝ 還沒好 ＝ 暫時的」，於是每輪輪詢都重跑一次昂貴的工作。
   → **新增永久性狀態時，回頭 grep 所有以「結果為空」為條件的早退／重試。**

2. **「這個非同步流程的每條路都會收工嗎？」**
   有回報完成訊號的設計（見 `mvbf` skill 的 headless 段），要逐條檢查
   **新增的分支有沒有回報**。漏掉的話不是壞掉，是**空轉到 timeout**——症狀很輕，成本很高。

3. **「post 出去的東西取消得掉嗎？」**
   `new Handler(...).post(...)` 的匿名 handler 取消不了。生命週期會被提前終止的情境
   （job 被 cancel、Activity 被 destroy）都要能撤回。

---

## 3.5 「把 N 個呼叫點統一到一個 helper」時，逐點比對語意

這是交叉 review 抓到、我自己漏掉的**最貴的一類**：diff 看起來只是「改走新的 helper」，
形狀整齊、每個呼叫點長得一樣，所以很容易一眼掃過。但**只要有一個呼叫點原本的語意跟
新 helper 的預設不同，它就會靜默地被改掉**。

實際案例（VSFT-9208）：4 個讀取點改走同一個 resolver，`?? 使用者偏好字體`。其中 3 個
本來就是這行為，但 iwb 那個本來是**原名原封不動帶過**：

```
解析失敗 → 蓋成偏好字體 → 存檔寫出偏好字體 → 作者的字體名從檔案裡永久消失
```

而那正是同一張 PR 的描述裡在批評對方產品的失效模式（`Replace(font, newFont)`）。

→ **檢查清單**
- 對每個被改的呼叫點，寫出「改動前這裡拿到什麼／改動後拿到什麼」，不要只看 helper 對不對。
- 特別看 **fallback 分支**：統一之後大家共用同一個 fallback，而那往往是差異所在。
- 資料保存語意（原值 vs 覆蓋）**不算實作細節**，改了要寫進 PR 的風險段。
- **如果 PR 描述裡在批評某個失效模式，回頭 grep 自己的 diff 有沒有犯同一條。**

## 4. 描述失效模式時，寫完整因果鏈

**不要**用「已知且有處理的降級」「應該還算安全」這種軟話帶過——那會低估後果，
而且讓下一個人以為不用管。要一路寫到**使用者／呼叫端看到什麼**。

實際犯過的例子：把「兩個 isolate 撞 Hive lock」描述成「已處理的降級」，
真正的鏈是 `撞鎖 → 退回空快取 → 判定沒有 id → 再產生一個覆蓋`，
而被覆蓋的那顆**已經回報給雲端**了——那正是這個功能存在要防止的失敗，且靜默。

→ 差別不在措辭，在於**看完鏈之後你會不會改變處理優先序**。

---

## 4.5 驗證「宣稱」，不只驗證程式碼

好的 review 會把 PR 描述當成待驗證的宣稱。Jacky 對 VSFT-9208 做的三件事值得照抄：

1. **把整個 key space 列舉過** —— 不是讀 `_normalize` 的實作，而是把 61 個
   `FONT_FAMILIES` 全推過去對撞看有沒有碰鍵，再拿約 40 個真實家族名手推後綴剝除。
   **而且列了反向案例**：`Merriweather Sans`、`Playfair Display SC`、`Arial Narrow`、
   `Segoe UI Semibold` 應該回 `null` —— 正向全過但誤吞近似名，是這類比對層最典型的 bug。
2. **數 PR 描述裡的數字**：「37 條測試」核成 25+6+6；並確認 fixture **真的有被載入並斷言**，
   不是擺著好看。宣稱與現實脫鉤比程式碼有 bug 更難發現。
3. **算覆蓋率的分母是呼叫點，不是測試數**：那張 PR 動了 8 個呼叫點（4 讀 4 寫），
   只有 1 個有端到端測試。「37 條測試」聽起來很多，但它們幾乎全在 resolver 這個
   pure function 上。

→ 自己送 PR 前先自問：**動了幾個呼叫點、其中幾個有測試守著？** 差距要嘛補、要嘛在
PR 裡講明白（「這條路徑需要 BuildContext + MediaQuery bootstrap，沒有便宜的接縫」
是可接受的答案；不提是不可接受的）。

### 驗別人的 review 前，先確認你的反駁基礎在哪個 repo

我犯過的：斷言「mvbw 沒裝 Arimo」與「Windows 裝的是 static 版 Merriweather」，兩者都錯。
正解是去讀**對方 repo 的 manifest**（`Sparrow.Package/Package.appxmanifest` 的
`uap4:SharedFonts`）＋ 比 sha256，而不是從自己這邊的行為推論。
**跨產品的環境主張，一律要在對方的版控裡找到證據再說。**

## 4.6 做「改動前後對照」時不要用 git stash

review 常需要「把我的改動拿掉，看看診斷／測試會不會變」。**不要用
`git stash push -- <files>` 然後 `git stash pop`**：

- zsh 不做 word splitting，`git stash push -- $FILES` 會整串當成一個 pathspec 而**失敗**；
- 若後面接了無條件的 `git stash pop`，它會**彈出使用者既有的 `stash@{0}`**。
  我踩過，把別人的 `build.gradle` WIP 倒進工作區。

安全做法（不碰 stash）：

```bash
F=(lib/a.dart lib/b.dart)
mkdir -p /tmp/mine && for f in "${F[@]}"; do mkdir -p /tmp/mine/$(dirname $f); cp "$f" /tmp/mine/$f; done
fvm dart analyze "${F[@]}" > /tmp/after.txt
git checkout -- "${F[@]}"                       # 暫時回 HEAD
fvm dart analyze "${F[@]}" > /tmp/before.txt
for f in "${F[@]}"; do cp /tmp/mine/$f "$f"; done   # 放回
```

比對時**去掉行號**再 `comm`（行號會因為新增行而位移，不去掉會全是假差異）。

若真的誤 pop 了：`git fsck --dangling` 找回 stash commit，用 blob hash 比對確認是哪一筆，
`git stash store -m "<原訊息>" <sha>` 放回，再 `git checkout --` 清工作區。

## 4.7 一次寫多份 artifact 的 metadata：loop 本身就是 bug 來源

用一個 for-loop 把同一份 `capture` metadata 寫進兩份 fixture，結果第二份的「擷取方式」
描述的是第一份的流程 —— 而 metadata 存在的唯一目的就是讓別人能重跑並複核，照著它做
重跑不出那份檔。

→ **每份 artifact 的來源描述要分開寫，寫完 assert 它們不相同**：

```bash
python3 -c "...; print('method 相同?', a['method']==b['method'])"
```

## 5. 收到別人的 review 意見：不要照單全收

逐條追到程式碼確認再動手。這輪 5 條意見裡有 3 條需要修正或撤回：

| 意見 | 查證結果 |
|---|---|
| 「這條 catch 抓不到，實際丟的是另一種例外」 | ✅ 成立——去讀 codegen 的 throw 就確認了 |
| 「守衛看不到新狀態 → 無限迴圈」 | ✅ 成立——追 3 個守衛的條件即確認 |
| 「錯誤回應洩漏呼叫端 package name」 | ❌ 不成立——那是呼叫端**自己的** package name，資訊量為零 |
| 「例外訊息可能夾帶內部路徑，該收」 | ❌ 不必——存取控制排在它**之前**，只到得了已授權的呼叫端；對已授權者那是診斷資訊 |
| 「`late` 欄位會丟 LateInitializationError」 | ⚠️ 可達性要看呼叫鏈才知道；此例潛伏但註解承諾了不外拋，故仍值得修 |

**特別小心「安全性」類的直覺主張**——「這樣會洩漏」聽起來永遠合理，
但要問「洩漏給誰」「對方本來就知道嗎」「這條路的前面有沒有守衛」。

反過來，對方的意見**比你原本的寫法更完整**時就採用（本輪的 in-flight 窗口 javadoc
就是直接採用對方措辭）。判準是內容，不是誰提的。
