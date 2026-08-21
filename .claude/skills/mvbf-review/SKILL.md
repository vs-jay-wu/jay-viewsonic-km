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
```

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

## 4. 描述失效模式時，寫完整因果鏈

**不要**用「已知且有處理的降級」「應該還算安全」這種軟話帶過——那會低估後果，
而且讓下一個人以為不用管。要一路寫到**使用者／呼叫端看到什麼**。

實際犯過的例子：把「兩個 isolate 撞 Hive lock」描述成「已處理的降級」，
真正的鏈是 `撞鎖 → 退回空快取 → 判定沒有 id → 再產生一個覆蓋`，
而被覆蓋的那顆**已經回報給雲端**了——那正是這個功能存在要防止的失敗，且靜默。

→ 差別不在措辭，在於**看完鏈之後你會不會改變處理優先序**。

---

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
