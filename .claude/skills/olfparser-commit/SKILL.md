---
name: olfparser-commit
description: "Use when committing code or writing a PR description in olfparser. Enforces this repo's Conventional-Commits format (NOT km's gitmoji, NOT mvbf's [Type] format), the MT-ticket placement, and the evidence-heavy PR description this repo uses in place of review comments. Examples: \"幫我 commit olfparser\", \"寫 PR 描述\", \"這些改動可以送了\""
---

# olfparser commit / PR

**先讀 `olfparser` skill**（checkout、分支、不引用 km 路徑）。這裡只放 commit 特有的部分。

---

## ⚠️ 三種格式不要互串

| repo | 格式 |
|---|---|
| km | `<gitmoji> <type>: <繁中簡述>` |
| mvbf（edu-droid-flutter） | `[Type VSFT-x] 標題` ＋ `What:/Why:/How:/Changes:` |
| **olfparser** | **Conventional Commits**：`type(scope): 描述 (MT-xxxx)` —— **無 gitmoji、無 `[Type]`** |

## Subject

```
fix(pptx): keep per-run links in bulleted table cells, anchor the marker to its text (MT-2140)
feat(olf-jni): nativePptxToOlf 輸出 v-next（Android olf-core 只收 v-next）MT-2541
docs: O30 errata — backgrounds[] entry 外形勘誤 + cookbook §18 補結構轉換規則 MT-604
chore: bump version to 2.8.2
```

- **type**：`fix` / `feat` / `docs` / `test` / `chore` / `ci` / `refactor` / `style`
- **scope**（括號，可省）：實測最常見 `pptx`（26/120）、`rust`、`hub`、`ffi`、`cli`、
  `upgrade`、`table`、`release`、`thumbnail`、`parity`、`olf-jni`、`verify`、`enb`、`pdf`。
  **用領域或 crate 名，不要用檔名。**
- **ticket**：`MT-xxxx` 放**句尾**，加不加括號都有先例（`(MT-2140)` / `MT-2541`）。
  跟著該分支既有 commit 的寫法走。多張票就並列（`MT-1813 MT-1814`）。
- **語言**：中英皆可，實務上英文居多；**識別字、路徑、欄位名一律英文**。

> 票號系統是 **MT-**（不是 mvbf 的 VSFT-）。但確實有 `Kellly/VSFT-9519-*` 這種
> 跨系統分支存在 —— **照票本身的 key 寫，不要自作主張換前綴。**

## Body：散文式、帶證據與數字

這個 repo 的 commit body 很長，而且**是真的在講原因與證據**，不是條列改了哪些檔。
既有 commit 的骨架：

1. 一句話定調（`Three defects the MT-2140 review left open.`）
2. **逐個缺陷編號**（`A1 — …` / `A2 — …`），每個講：症狀 → 根因（含
   `函式名` / `檔名` / 資料形狀）→ 修法 → **為什麼這樣改是對的**
3. **量化證據**：「bulleted cell now yields 3 elements, 2 DISTINCT link refs,
   byte-identical between Rust and Python」「142 bulleted paragraphs in the corpus
   are left-aligned and their output is untouched」
4. **parity 數字要 apples-to-apples**：「PR-branch Python vs PR-branch Rust,
   on the same tree: 418 errors vs base 411」
5. `Verified:` 段落 —— 指令 ＋ 結果 ＋ **pre-existing 的要標明**
   （「Python suite: 4 failures, all pre-existing on base」）

**「pre-existing」這個標註是這個 repo 的硬要求**：不標，下一個人分不清是不是你弄壞的。

## Trailer

近 100 個 commit 裡 **65 個有 `Co-Authored-By`**、10 個有 `Claude-Session` URL。
這是既有慣例，跟著加。不確定就數一次：

```bash
git log origin/main --format='%b' -100 | grep -c 'Co-Authored-By'
```

---

## PR 描述：這個 repo 的 review 就發生在這裡

近 30 個 PR 的 review／comment **全是 0** —— 沒有人在 PR 上留言。
**PR 描述寫得不夠，等於這張 PR 沒被 review 過。**

照 PR #135 的骨架（它是目前最完整的一份）：

```markdown
## 摘要
<現況哪裡錯 → 具體數字（480.93 → 961.86）→ 誰先發現（哪個 gate 抓到）>
**修法（<一詞概括>）**：<做法> → <為什麼對三種情況都成立>
> 註：<初版走過的死路與為何放棄>   ← 保留失敗路徑，避免下一個人重走
Fixes **MT-xxxx**；回退 **MT-yyyy**；根因見 **MT-zzzz**。

## <本次涉及的既有慣例盤點>
| # | 產出點 | 現況寫法 | 本 PR 處置 |    ← 用表格窮舉，逐列打勾

## 跨消費端證據（實地讀碼）
<五個消費端逐一 檔案:行號，含離群的那一個>
normative 依據：cookbook §16、spec 0106

## 受影響消費端（contract PR 紀律）
<點名五個消費端中的哪些>      ← 動到 docs/olf-vnext/ 語意時必寫

## 測試
- unit：<具名測試>
- integration：<具名測試>
- `cargo test -p olf-upgrade -p olf-downgrade` → 123 passed / 0 failed；clippy 乾淨

## 待辦（merge 後）
- <重建 dylib / golden 交給 CI / 正本清源的後續票>
```

幾個值得照抄的細節：

- **保留走過的死路**（「初版曾採純 x-only，但會 regress `.vf`/flipchart 慣例」）。
  連分支名為何對不上都解釋了（「branch 名沿用 `-x-only` 只是歷史因素」）。
- **明說自己的修法對上游修不修都成立**（robust），並把根因另開票（MT-2708），
  講清楚它**不是這張 PR 的阻擋項**。
- **待辦要寫進 PR，不要只留在腦袋裡**：本機字型不符所以沒 `--update-golden`
  → 寫明「golden gate 由 CI 把關」。

---

## Commit 前的檢查

1. **分支**：`git branch --show-current` —— 不是 `main`。
2. **是否落後遠端**：`git log --oneline HEAD..origin/main`（外接 checkout 常落後）。
3. **km 路徑與本機絕對路徑洩漏**：
   ```bash
   grep -rn "docs/features\|docs/domains\|docs/repositories\|jay-viewsonic-km" src/ rust/ docs/ tests/
   git diff --cached | grep "^+" | grep -nE "/Users/|/Volumes/|\.mvb-worktrees"
   ```
4. **gates**：`cargo fmt --all --check`、`cargo clippy --workspace -- -D warnings`、
   `poetry run pytest -q -x`、`git diff --check`。
5. **動到 `docs/olf-vnext/` 了嗎**：是 → O-ledger 用 **append**（不可 in-place 改語意），
   PR 描述點名消費端，且別碰 CI anchor check 那三個字串（見 `olf-vnext` skill）。
6. **`._*` 沒被 add 進去**（外接硬碟的 AppleDouble 檔）：
   ```bash
   git status --porcelain | grep '\._' | head
   ```

## 不要自動 commit

除非明確被要求，或該行為本身具 commit 意義。這條對所有 repo 適用。
