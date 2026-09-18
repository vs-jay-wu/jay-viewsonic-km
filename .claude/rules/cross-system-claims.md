# 跨系統搬結論 ＋ 宣稱的證據等級

這份規則的每一條都來自 **2026-09-09～10 VSFT-9718 那一輪**實際犯的錯，多數是被 reviewer 抓到、
而不是自己發現的。它們全屬同一族：**把一個系統成立的事，當成另一個系統也成立**，或
**把推論寫成既定事實**。

---

## 1. 不要把 A 系統的慣例外推到 B 系統

**外推的來源可以是任何東西：另一個 repo、另一個 Jira 專案、另一份文件、甚至使用者的一句話。**
共同點是「聽起來合理、而且查證只要一分鐘，但我沒查」。

那一輪的五次（全部都錯）：

| 我外推的 | 實際 | 一分鐘就能查出來的方式 |
|---|---|---|
| fishing-cat 的 commit 票號 221/221 都是 `VSFT-` → 新單開 VSFT | 組織已改開 `VB-` | 直接問，或看 VB 專案近期有沒有同類的新單 |
| VSFT-9961 把 repo 名寫在標題文字 → VB 也這樣寫 | VB 用**第二層 bracket**（`[Canvas][Flutter]`），全形冒號 45 張裡零出現 | `project = VB AND created >= -45d`，看 summary |
| VSFT 有 `Scrum Team` 下拉欄 → VB 也有 | VB 是 `Team`（Atlassian Team，**吃 uuid**），而且**有預設值會自動帶入別的隊** | `jira_get_create_fields` |
| edu-participant-web 的 plan doc 說「與 ocelot `(?<!\\)\$` 對齊」→ 抄進 fishing-cat 的註解與 KB | 那條正則屬於 **Word 匯出的消費端**，而且**有一樣的 bug**；ocelot 沒有任何地方轉義 `$` | `grep -rn 'regex_latex' app/` 看它在哪個模組、誰呼叫 |
| 使用者說「所有 ticket 開 VB」→ 照抄「所有」 | **當時**狸貓版仍在用 `MT-`（前一天還在建票） | 查 MT 專案最近有沒有新票 |
| mvbf 的 `.mcp.json` 有 `Flutter-MCP-Server` → 在 km 跑出來的那隻也是它來的 | km 自己有一份 `.mcp.json`（mvbf 那份的複製），行程 cwd 全在 km | `lsof -a -p <pid> -d cwd -Fn` 看行程實際掛在哪 |
| 「`~/.gradle` 的優先序高於專案 gradle.properties」寫進註解 | 沒實測過。而且本次三個 key 專案根本沒設，優先序**根本不適用** | 先 `grep` 確認有沒有衝突，沒衝突就別提優先序 |
| standalone CS 的 `AccountManager.logout()` 會 `stopCSService()` → 融合版登出也會停前景服務 | 融合版的 MVB 登出**沒有**走進 CS 的 `logout()`（`startRequested` 仍是 true）；而且即使走進去，MVB 的 binding 還活著 → service 不會 destroy、通知留著 | `adb shell dumpsys activity services <pkg>`，看 `startRequested` 與 `Bindings:` |
| 「CS 完全沒有生命週期處理」（我只 grep 了 `android/`） | 處理在 **mvbf 的 Dart 層**（`classswift_bloc.dart` 的 `_onAppLifecycleStateChanged`）—— 跨語言的功能，一邊沒有不代表沒有 | grep 範圍要含 `lib/` 與 `*.dart`，不只 `android/` |

> ⏱️ **後續（2026-09-16）**：MT 已停用，「所有 ticket 開 VB」現在是對的。
> 但第一列那次仍然是錯的——**錯在沒查證就照抄，不在結論本身**。同一句話在不同時間點
> 真假會翻轉，這正是要查證而不是照抄的理由。

**做法**：要寫「與 X 一致／依據 X」之前，先回答兩個問題——

1. **X 是產生端還是消費端？** 消費端的實作不是契約，它可能跟你一樣有 bug。
2. **這個結論的出處，是我查的還是我抄的？** 抄來的就回去查原始出處，不要接力傳遞。

**使用者的措辭也算外推來源。** 使用者說「所有」時，若手上有反證（例如另一個系統昨天還在用舊做法），
**要回頭確認再記錄**，不要把沒查證的措辭寫成規則。記下來時要標明「這是當場裁定的工作規則，
不是查證過的組織政策」，並寫出翻案條件。

## 2. 宣稱要標證據等級，推論不要寫成事實

那一輪被抓到的三個過寬宣稱：

| 我寫的 | 實際 |
|---|---|
| 「與 KaTeX auto-render **同一條規則**，所以兩端切法一致」 | 只有**尋找結束分隔符時的跳脫**那一條相同。另有四處不同（純文字 `\$`、跨行、`{}` 內裸 `$`、找開頭分隔符完全不看跳脫） |
| 「含 lookbehind 的 regex literal 是**解析期** SyntaxError，整個 chunk 載不起來」 | 實測 esbuild 以 safari14 為目標會**悄悄降級成 `new RegExp(...)`**，失敗變成執行期。結論（不要用）不變，機制寫錯 |
| 「ocelot 產的內容**有這層保證**」 | 不存在。內容由 LLM prompt 產生，prompt 只說「用 `$...$`」，未提跳脫 |

**做法**：分清楚三級——**實測過**（附指令與逐字輸出）／**讀碼看到**（附檔案與行）／**推論**。
第三級不要寫進註解與文件，或至少標明。`edu-participant-web` 的 `FormattedContent.tsx`
就在註解裡標了「證據等級：只在程式中觀察到」，那個習慣值得抄（雖然它標的那條歸因本身也是錯的）。

## 3. 改文件不要只改一半

修掉一個錯誤說法之後，**整份 grep 那個關鍵字**，確認沒有別處還用舊框架寫。

那一輪：我改掉 KB 上半段的 ocelot 歸因，卻留下兩處仍寫「與 ocelot 對齊」「翻譯內容不走出題端的
`(?<!\\)\$`」，整份文件自相矛盾，被 reviewer 抓到（fishing-cat PR #578 兩則 [SHOULD]）。

```bash
grep -n '<被推翻的說法>' <改過的檔案>
```

**半改比不改更糟**：讀的人會看到兩種說法，而且新的那段看起來更像是特例。

## 4. 自己宣稱的行為，要有測試釘住

那一輪：我在 PR 描述、Jira 留言、以及開給另一個 repo 的票裡，**三度**拿「inline 不跨行」當賣點，
但那條路徑**沒有任何測試**——是覆蓋率報告指出「唯一未覆蓋的兩行」才發現，而那兩行正是它。

**做法**：PR 描述寫完之後回頭看一遍——**每一項我宣稱的行為，指得出對應的測試嗎？**
指不出來就補，或把宣稱拿掉。

## 5. 探針會給出看似合理的假結果 —— 寫錯的、和讀漏的

那一輪：我寫 node 腳本比對兩個實作，**把 `(text, delimiter, …)` 的參數順序餵反**，拿到 `-1`
（「找不到結束分隔符」）。那個結果剛好可以編出一套說法，只因為數字看起來怪才重跑。

**做法**：探針跑出**支持你預期**的結果時最危險。至少加一個**已知答案的對照案例**
（例如同時餵一個一定會成功的輸入），對照組不合預期就是探針有問題。

### 「沒有發生 X」要用看得見 X 的探針

2026-09-17（VB-2294）：我用 `adb shell logcat` 過濾 `[ClassSwiftBloc] [Lifecycle]` 判斷各情境
有沒有進背景，據此記下「下拉通知列**無任何事件**」。實際上通知列**會**進 `inactive` ——
但那支 bloc 只在 `paused` / `resumed` 兩個分支寫 log，`inactive` 兩邊都不走，
**探針在結構上就看不到它**。同一份記載裡「軟鍵盤是短暫 inactive」也錯（實測是完全沒有事件），
那條是照抄程式碼註解。兩處都是實作者後來自己量出來才更正的。

**判準**：要宣稱「X 沒有發生」之前，先確認探針對「X 發生」有**獨立的**觀測能力。
拿生產程式碼自己寫的 log 當探針，只看得到**被記錄的那幾條路徑** ——
「沒有 log 的分支」和「沒有發生」在輸出上長得一模一樣。

**做法**：自己加一行把**所有可能值**都印出來的 log（或換一個不依賴生產程式碼的觀測面，
例如 `dumpsys`、系統事件），再下結論。這跟上面「探針掃不到東西時有兩種可能」是同一族，
差別只在那次是探針找錯地方，這次是探針**視野裡根本沒有那個狀態**。

### 變異測試：先確認「變異真的套用了」

2026-09-11 在 km web 驗一條測試有沒有空轉：把修正種回舊寫法，結果**測試照樣全綠**，
差點下結論「這條測試沒守住」。實際上是**我的變異沒套用**——
`str.replace()` 比對字串沒中時不會報錯，檔案原封不動。

第二次改用 `assert a in s` 才發現真的套用了；但**變異本身仍然寫錯**——
我去 cap `size`，而那段程式的第一次 read 就已經把整個檔案讀進來，cap 根本擋不到。
改成限制「實際可讀位元組」後才真的變紅。

→ 變異測試至少要做兩個確認：**變異有進到檔案**（grep 一個標記），
以及**變異真的改變了行為**（不是改到一個不影響結果的地方）。

**第三個確認：測試真的會走到被變異的那一行。**
2026-09-16（VB-2193）：為了守住 catch 裡新加的 `if (context.mounted)` 守衛，
我加了一個「context 已 unmounted」的測試，全綠。把守衛拿掉再跑 —— **還是全綠**。
原因是**更外層**另有一個 `if (context.mounted)`，unmounted 時整段 try 根本不會進去，
catch 自然沒執行。那個 case 從頭到尾是空轉的。

這種「測試存在、而且測的東西名字對，但執行路徑根本沒碰到」最難自己發現，因為
**新增測試通過**看起來就是成功訊號。所以：**每加一條宣稱「這守住了 X」的測試，
就把 X 破壞掉跑一次**。沒變紅就是沒守住 —— 這時老實把宣稱降級，
不要因為測試名字寫得很像就當作有保障。

**推論：一個測試檔有 N 條宣稱，就要做 N 次變異，每次打在該條宣稱對應的那一行。**
2026-09-17（VB-2267）：新測試檔 4 條 case，我做了 3 次變異（常數、資產色值、path 數）
全部變紅，就當整批都守住了。實際上「手掌擦固定取亮色版」那條**完全沒碰到**
`eraser_palm_helper.dart` —— 它只是自己重算一次 `getThemeFileName`。把手掌擦的
`isLight: true` 改成 `false`，**測試照樣全綠**。是 review 子程序抓到的，不是我。

**別把「我的探針壞了」寫成「這件事驗不了」。** 探針掃不到東西時，有兩種可能：
真的沒有，或**我解錯編碼／找錯地方**。前者才是結論，後者只是我的問題 ——
而兩者在輸出上長得一樣（都是「找不到」）。
2026-09-17（VB-2267）：用 ARGB uint32 掃 `.svg.vec` 的顏色掃不到，我就寫下
「`.vec` 的顏色沒辦法用位元組驗」並記進 skill。實際上它是 **3-byte BGR** 的顏色表，
掃得到、而且足以寫成測試 —— 是 PR reviewer 指出來的。
**做法**：宣告「驗不了」之前，先拿一個**已知該有差異**的對照檔（本例：亮色版）
確認探針在它身上抓得到東西。抓不到就是探針的問題，不是對象的問題。

**徵兆**：測試斷言裡**重算了一次生產程式碼的邏輯**，而不是去讀生產程式碼的產物。
看到 `expect(自己再呼叫一次同樣的 helper, 預期值)` 就要問：這條跟被測的那個檔有關係嗎？
修法是把生產端的決策暴露成具名符號（本例加了 `EraserPalmHelper.logoAssetName`），測那個 ——
改完同一個變異就會變紅。

### 探針輸出的每一項都要能解釋，不能只挑出自己在找的那幾項

前面幾條講的是**探針壞了**。這條相反：**探針是好的、答案就印在畫面上，而我只讀了
自己在找的那一面。**

2026-09-18（mvbf PR #288）：把 `make mcp_config` 的產出從 `.cursor/mcp.json` 改成
`.mcp.json` 之後，我實跑了一次產生器驗證，印出的 server 名稱清單是：

```
['Atlassian MCP', 'Figma MCP Server', 'POEditor MCP Server', 'Firebase MCP',
 'Atlassian-MCP', 'Figma-MCP-Server', 'Firebase-MCP', 'POEditor-MCP-Server']
```

我要找的是「那四支在不在、Flutter 在不在」，兩個都得到答案，就下結論送 PR ——
**沒有問為什麼是 8 個**。實際上那是同一份檔有兩個 writer（`jq > $OUTPUT_FILE` 寫空格版、
其後的 `claude mcp add-json -s project` 寫連字號版），同一支 server 會被重複啟動，
而且再跑一次結果還不同。是 reviewer 抓到的，而證據我開 PR 前就拿到了、還當成正面
證據寫進 PR 描述。

**判準**：探針輸出裡**每一項**都要能解釋。多出來、數量對不上、名字長得像重複的 ——
在解釋清楚之前，那次驗證不算完成。「我要找的那幾項都對」不是通過條件。

**徵兆**：輸出的筆數你沒數過，或數了但沒去對「應該是幾筆」。

### 「把產出從 A 搬到 B」要雙向查：B 的既有佔用 ＋ A 的殘留

同一個 PR 的第二條，根因同上 —— 只驗了自己動的那一面。

| 方向 | 我漏掉的 | 後果 |
|---|---|---|
| **B（新位置）本來有沒有人在寫？** | `.mcp.json` 原本就被 `claude mcp add-json -s project` 寫著 | 兩個 writer 撞在一起（上一條） |
| **A（舊位置）的既有本機檔還在** | `.gitignore` 刪掉 `.cursor/mcp.json` 那條 | `.cursor/` 從版控刪掉了，但**既有開發者磁碟上那個含 token 的檔不會跟著消失**，只是從 ignored 變成 untracked → 誤 commit 憑證的風險 |

**判準**：

- 改任何「產出路徑／輸出位置」之前，先 grep 新路徑在 repo 裡還有沒有別的 writer
  （`grep -rn '<新路徑>' --include='*.sh' --include='Makefile' --include='*.mk' .`），
  並確認最後只剩一個。留下的那個 writer 要就地加註解寫明「這是唯一 writer」與違反後果。
- **從版控刪掉一個目錄，不等於它從大家的磁碟上消失。** 它的 ignore 規則要留到遷移期結束，
  尤其是護著憑證的那條。刪 ignore 規則前先問：「這條擋的東西，在既有 checkout 上還在嗎？」

驗證方式（`git check-ignore` 會指出是哪一行生效，順便抓到重複規則）：

```bash
git check-ignore -v <舊路徑> <新路徑>
```

### 工具語意的沉默陷阱

前四條是同一天踩到的，第五條是 2026-09-16（VB-2193）。

| 寫法 | 沉默的錯誤結果 |
|---|---|
| `jq '.x.enabled // true'` | jq 的 `//` 把 **`false` 也當成「沒有值」** → 停用被翻回啟用。改 `.x.enabled != false` |
| `set -- $var`（zsh） | zsh **不做 word splitting**，`$1` 拿到整串。改 `${=var}` 或用陣列 |
| `cd web && python3 …` | 已經在 `web` 時 `cd` 失敗，**整串不執行但後面用換行接的照跑**，看起來像「跑過了」 |
| 走 CSSOM 找規則 | 規則在巢狀 `@layer` 裡，`sheet.cssRules` 的單層走訪看不到 → 誤判「這條 CSS 不存在」。改抓樣式表原文 grep |
| 拿 log／`toString()` 當**型別**證據 | 例外的字串表示法**不保證**是 runtimeType。Dart 的 `FormatException.toString()` 前綴是**寫死的 `FormatException`**，所以子類別 `ArchiveException` 印出來也是 `FormatException:` → 我據此宣告「實測型別與單子推測的不同」，實際上單子沒猜錯。要型別就印 `runtimeType` 或用 `isA<T>()` 斷言 |

共同形狀：**回傳了一個合法的值，只是那個值是錯的**。所以「沒有錯誤訊息」不能當成「做對了」，
只要結論會影響後續決定，就要用第二種方式再確認一次。

## 6. 搜尋範圍要包含舊樹與非主要目錄

那一輪：我 grep `src/` 找呼叫端，回報「6 處」，漏掉 `fishing_cat_src/` 底下的第 7 處
（`TranslationContent`）—— reviewer 抓到。同一天也漏過 `res/layout-xxhdpi/`（那是更早的案例）。

**做法**：報數量之前先確認搜尋根目錄涵蓋整個 repo，特別是 legacy／平台變體目錄。
數量本身就是一種宣稱（見第 2 條）。

### merged manifest 才是真相，不是 `app/src/main/AndroidManifest.xml`

2026-09-17：我 grep mvbf 自己的 manifest，回報「3 個 `FOREGROUND_SERVICE*` 權限」。
真正送 Play 的 AAB 有 **4 個** —— 第 4 個 `FOREGROUND_SERVICE_REMOTE_MESSAGING`
是 library manifest（`:classswift` ＝ ragdoll-cat）合併進來的，Play 因此擋掉整個 3.11.6 release。

**判準**：凡是「這個 app 有哪些權限／宣告」的問題，答案在**合併後**的 manifest，
不在任何單一 sourceSet。library、AAR、Flutter plugin 都會塞東西進去。

實測可用的探針（AAB 裡的 manifest 是 protobuf，`aapt2 dump` 對 `.aab` 直接回
`could not identify format of APK`）：

```bash
unzip -p app.aab base/manifest/AndroidManifest.xml \
  | strings -a | grep -o 'android\.permission\.[A-Z_]*' | sort -u
```

對照組：同一支指令要掃得到你已知一定有的權限（例如 `CAMERA`）；掃不到就是探針壞了。
mvbf 另有 gradle 任務可產 merged manifest（`processEdlaReleaseManifest`）。

⚠️ **這件事 km 其實已經記過了**：
`docs/repositories/Viewsonic-EDU/edu-droid-flutter/features/classswift-embedded-apk/findings.html`
就寫著「融合前後 merged manifest 比對，MVB 僅新增 `FOREGROUND_SERVICE_REMOTE_MESSAGING` 一項」。
**記了事實、沒記後果**（新增敏感權限要去 Play Console 補宣告），
所以它在真正需要的那天沒有發揮作用 —— 寫 findings 時把「所以之後要做什麼」一起寫進去。
後果本身見 memory `play-console-fgs-declaration`。

---

## 動手前的固定動作（濃縮版）

0. 講「某某設定／檔案是這個行為的來源」之前，用**執行期證據**確認
   （行程用 `lsof -a -p <pid> -d cwd -Fn`；設定值用 `ps -o args=` 讀實際參數），
   不要從「哪個檔案裡有這個字串」反推
1. 這個 repo 有沒有自己的入口？（`CLAUDE.md`／`AGENTS.md`／`CONSTITUTION.md`／
   `.claude/skills/` 的 loader）——有就先讀，見 [`cross-repo-workflow.md`](cross-repo-workflow.md) §0
2. 我要寫的每一句「依據 X」，X 查過了嗎？是產生端還是消費端？
3. 改完文件，grep 一次被推翻的說法
4. PR 描述裡每一項宣稱，都指得出測試嗎？
5. 拿來當證據的那段輸出，**每一項**我都解釋得了嗎？（不是「我要找的那幾項都對」）
