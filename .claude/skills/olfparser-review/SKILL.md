---
name: olfparser-review
description: "Use when reviewing code in olfparser — own changes before delivery, a PR, or relaying another reviewer's findings. Covers the finding classes this repo's own AI review loop keeps hitting (oracle divergence, non-hermetic tests, test seams leaking into production, superset-as-output), plus the ledger format for reporting. Examples: \"review 這些改動\", \"看一下 olfparser 這個 PR\", \"幫我檢查 rust port 的 diff\""
---

# olfparser code review

**先讀 `olfparser` skill**（checkout、CLAUDE.md 死指標）與 `olfparser-verify`
（waiver 紀律、字型環境）。這裡只放 review 特有的部分。

---

## 0. 這個 repo 沒有 PR 討論串

近 30 個 PR 的 `reviews` / `comments` **全部是 0**。review 不發生在 GitHub 上，
而是**在 PR 描述裡自己寫完證據**，以及**離線的 AI review loop**（產出
`docs/review-loop-ledger/`）。

→ 兩個推論：
1. **PR 描述就是 review 的載體**。寫得不夠 = 沒被 review 過。
2. 想知道這個專案在意什麼，**去讀 ledger 而不是找 comment**。

---

## 1. 自動稽核（先跑，便宜）

```bash
cd "$R"

# 語言／工具鏈基本盤
cargo fmt --all --check
cargo clippy --workspace -- -D warnings      # clippy 升版會冒新 lint（PR #134 就是專門修這個）
poetry run ruff check src/ && poetry run mypy src/
git diff --check                             # 空白噪音

# km 路徑洩漏（註解／docs／PR 描述都算）
grep -rn "docs/features\|docs/domains\|docs/repositories\|jay-viewsonic-km" src/ rust/ docs/ tests/

# 本機／個人專屬指標（比 km 路徑更容易漏）
git diff | grep "^+" | grep -nE "/Users/|/Volumes/|scratchpad|/private/tmp|\.mvb-worktrees"

# 殘留除錯碼
git diff | grep "^+" | grep -nE "dbg!\(|println!\(|eprintln!\(|print\(|TODO|FIXME|unwrap\(\)"

# 描述 diff 的註解（人工判斷，誤報率不低）
git diff | grep "^+" | grep -nE "原本|之前是|現在改|修正前|目前|暫時"
```

⚠️ **`/Users/` 那條在這個 repo 特別重要**：ledger 裡就留著
`spec: /Users/peter.l.zhou/Documents/code/myViewBoard/docs/...` 這種別人本機的
絕對路徑，等於死指標。**量測數據要留，指標要指向 Jira／PR。**

⚠️ **`git diff` 看不到未追蹤檔，而且不會警告。** 先 `git status --porcelain`，
`??` 的檔要另外掃。看到「零命中」時先問一次「這個檢查真的跑到了嗎」。

---

## 2. 這個 repo 反覆出現的 finding 類型

以下八類直接來自它自己的 AI review loop 抓到的 43 條 findings（MT-1946，
`docs/review-loop-ledger/2026-07-31-MT-1946-finding-fixes.md`）。
**這是最有價值的一節** —— 它反映的是這個 codebase 的結構性弱點，會一再重演。

### ① 同一語意有兩個實作，而它們不一致

最常見、也最貴。轉換器算文字高度、渲染器也算文字高度；兩邊對「空行算不算一行」
「零寬字元讓不讓一行變非空」判斷不同 → 幾何靜默錯開。

→ **改任何量測／換行／幾何邏輯時，先問「誰是這件事的另一個實作？」**
典型配對：`pptx-convert/src/text/metrics.rs` ↔ `thumbnail/src/elements/textarea.rs`、
Rust crate ↔ `src/olfparser/` 的 Python 對應檔。
測試要**以另一個實作為 oracle 對撞**，不是各自斷言自己的期望值。

### ② 測試依賴 host 環境（非 hermetic）

`cjk_line_count_matches_thumbnail_renderer` 原本走 production 的 host-font 路徑，
換台機器就變。→ **用明確的 uniform-advance oracle 或注入真實 fixture bytes**，
不要讓測試碰系統字型或網路。這條和 `olfparser-verify` 的字型環境陷阱是同一件事。

### ③ 測試接縫洩漏進 production 解析路徑

`font_for_run` 曾消費一個 magic JSON key `__text-layout-test-uniform-advance`，
Cargo feature unification 一開就在正式路徑上可達。

→ **測試專用行為要靠參數或 feature-gated 的私有入口傳入，不要藏在資料裡讓
production parser 認得。** 修完要 `grep` 全 repo 確認 magic key 不存在。

### ④ 把「發現用的超集」直接當成「輸出集合」

`discover_used_fonts` 是量測用的**超集**（含後來被 bake／fallback／clip 掉的文字），
卻直接指派給 `doc.fonts` → 輸出宣告了根本沒用到的字型。

→ **discovery 與 output 是兩個集合。** 真正的輸出要在最後一次 pass 之後，
拿實際產出的內容去**交集**回來；發現「最終用到但 discovery 沒抓到」要 warn。

### ⑤ alias／正規化洩漏到輸出

`open_sans` 的量測 alias（映射到 Google `Open Sans`）跟著進了 `fonts[]`，
於是輸出宣告了一個不該內嵌的 face。

→ **量測用的 family 與輸出用的 family 要分開存**（`FontPreflight` 就是為此拆的）。
凡是「為了比對／查找而正規化過的值」，都要問一次：**它會不會被寫進輸出？**

### ⑥ 幾何 pivot 用了 stale 的框

表格因內容自動長高後，`table_placement_matrix` 仍拿**原本 frame 的 w/h** 當旋轉中心
→ 旋轉／翻轉的位移全錯。

→ **先算出最終尺寸，再用最終尺寸做 transform。**
review 旋轉/翻轉相關 diff 時，逐一確認 pivot 用的是 emitted box 還是 source box。

### ⑦ 關聯物件在後處理階段被拆散

table 被豁免 clip，但它**各自 emit 的 cell textarea** 沒被豁免 → 表格還在、
超出 viewbox 的儲存格文字不見了。

→ **凡是「A 引用 B」的結構（`cell-content.ref` 這類），任何整批處理
（clip／過濾／重排）都要先把被引用者收集起來一起處置。**

### ⑧ 第三方解碼可能 panic，而 `Result::ok` 抓不到

WOFF2 decode 直接跑在 `resolve_face` 裡，畸形字型 → panic 貫穿整個轉換。

→ **第三方 parser／decoder 外面要有 panic barrier（`catch_unwind`），
並把失敗結果 negative-cache**，不然每個 run 重試一次。
PR #117 標題就是 `panic barriers` —— 這是全 repo 的共識做法。

### 附帶兩類「非程式碼」finding，同樣會被記成 finding

- **dead seam**：文件描述的架構（`FontResolver` trait／measurement-time 解析）
  production 根本走不到 → **連 trait 帶文件一起刪**，不要留著誤導。
- **stale docs**：`PARITY_ORACLE.md` / `VERIFICATION.md` / `port-specs/*.md`
  跟不上實作。**行為改了就要在同一張 PR 更新契約檔**（waiver 尤其）。

---

## 3. review 自己剛改的東西時，多問四個問題

1. **「這件事的另一個實作在哪？」**（見 ①）——Rust ↔ Python、converter ↔ renderer。
   只改一邊就是製造 parity 債。
2. **「這個值會不會被寫進輸出？」**（見 ⑤）——量測值、alias、正規化過的鍵。
3. **「上游修好之後，我這個修法會不會反而錯？」**
   PR #135 的做法值得照抄：與其寫死「x-only」，不如**偵測特徵**
   （linear part = identity 且 matrix 平移 == x/y），這樣**對 exporter 修不修都正確**。
   → 針對「某個上游目前的壞習慣」寫的修法，要問它是否 robust。
4. **「這改動動到 OLF 語意了嗎？」**
   有的話 → `olf-vnext` skill 的守則 3：**不要在消費端自行改語意**；
   在 olfparser 內改則要走 O-ledger append，並在 PR 點名五個消費端。

---

## 4. 跨消費端的主張，要在對方的版控裡找證據

PR #135 的「跨消費端證據」那節是這個 repo 的標竿做法：宣稱「五個消費端現行讀法
都是 x/y」時，逐一附上實地讀碼的位置——

```
Swallow OlfBoardMapper.cs:4552-4553、mac OLFCanonicalMapping.swift:456-475、
android OlfBoardMapper.kt:2605（DTO 無 matrix 欄）、Sparrow OLFWidgetPlayer.cs:117-126、
droid-flutter olf_reader.dart:591-594；唯 mac-port legacy OLFReader.swift:1503 離群
```

**注意它連「離群的那一個」都列出來了。** 全部一致的結論最可疑——
找不到反例通常代表沒找完。

→ **不要從自己這邊的行為推論對方的行為。** 跨產品主張一律去讀對方 repo。
（那些 repo 多半也在 offloaded → 見 `olfparser` skill 步驟 0 的找法。）

---

## 5. 收到別人的 review 意見：不要照單全收

逐條追到程式碼確認再動手。**「診斷對、修法錯」是常見組合**——對方指出的問題成立，
但他提的替代方案會波及另一條路徑。判準很單純：**把兩個版本各代入所有輸入組合算一次**，
不要用讀的。

在這個 repo 特別要警覺的一類：**「把門檻調寬就綠了」**。
`PARITY_ORACLE.md` 明文「不得自行放寬」——收到這種建議一律回退到分類判讀。

## 6. 寫 review 報告：照 ledger 的三段式

`docs/review-loop-ledger/` 的格式（**每條 finding 都要三件事**）：

```
### N. <一句話講清楚失效模式>
- Reproduced/root cause: <怎麼重現> + <根因在 file:line>
- Fix: <改了什麼> (<file>:<行區間>)
- Tests: <具名測試> assert 了什麼（要能看出它真的會紅）
```

**「Tests:」不能寫「已補測試」**——要寫測試名 ＋ 它斷言的效果。
`docs/review-loop-ledger/` 進版控，檔名 `YYYY-MM-DD-HHMMSS-<TICKET>.md`，
front-matter 記 `rounds` / `findings: N (blocker/major/minor)` / `outcome`。
（分層 A–E 的定義在一份外部 spec，你手上沒有 → **不要杜撰層別**，
需要分類就用 blocker/major/minor。）
