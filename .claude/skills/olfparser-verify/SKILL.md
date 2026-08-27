---
name: olfparser-verify
description: "Use when verifying a change in olfparser — running tests, parity between the Rust port and the Python oracle, golden files, or deciding whether a red gate is a real regression. Covers the L0–L6 verification pyramid, the scoped waivers, and the font-environment trap that makes results non-reproducible. Examples: \"跑一下 olfparser 的測試\", \"parity 紅了\", \"golden 要不要更新\""
---

# olfparser 驗證

**先讀 `olfparser` skill**（checkout 在哪、環境安裝）。這裡只放驗證特有的部分。

正典：`docs/rust-port/VERIFICATION.md`（金字塔）＋ `docs/rust-port/PARITY_ORACLE.md`
（parity 的精確定義）。**兩份都是團隊維護的契約，以 repo 內容為準**，這裡只給地圖與陷阱。

---

## 「正確無誤」被拆成五個命題

記這個分解，回報時才講得清楚你驗到哪一層：

| | 命題 |
|---|---|
| **P1** | 與 Python 行為一致（parity） |
| **P2** | 輸出本身有效（validity） |
| **P3** | 視覺正確（visual） |
| **P4** | 平台封裝無損（FFI / platform） |
| **P5** | 不隨時間漂移（regression） |

P1 是槓桿：Python 版已經過 myViewBoard 實測與 golden 把關，byte 級 parity 讓 Rust
直接繼承那些保證。**P2/P3 防的是「兩邊一起錯」，P5 防的是 Python 修了 bug 而 Rust 沒跟上。**

## 金字塔（L0 最快 → L6 最慢，fail-fast）

| 層 | 驗什麼 | 怎麼跑 |
|---|---|---|
| L0 | fmt / clippy / workspace tests | `cargo fmt --all --check`；`cargo clippy --workspace -- -D warnings`；`cargo test --workspace` |
| L1 | 結構 parity：Rust vs **live Python**，0 ERROR | `poetry run python parity/run_parity.py --ext <fmt>` |
| L2 | 有效性 gate：zip 完整／可解析／頁數>0／**渲染不噴錯** | `parity/validity_gate.py` |
| L3 | 視覺 parity：兩邊各出圖逐頁 mean-abs-diff（門檻 0.5%） | `parity/visual_parity.py` |
| L4 | FFI 符號表 vs `dll/olfparser.h`、corpus 走 FFI 重跑、Swift test | `scripts/verify_rust.sh` step 5–6、8 |
| L5 | 真機抽驗：每格式 2 檔匯入 myViewBoard 目視 | 人工，每次發版 |
| L6 | CI/回歸 | `.github/workflows/rust-verify.yml` |

**單指令入口**（本地／CI 共用）：

```bash
scripts/verify_rust.sh                 # PR 級（28 檔 pptx 子集 + 其他格式全部）
FULL_CORPUS=1 scripts/verify_rust.sh   # 發版級（~136 檔，~40 分）
```

⚠️ `scripts/verify_rust.sh` **hard-code 了外部 corpus / FFI 路徑**。corpus 不在 repo 裡，
你本機沒有就跑不動——那不是失敗，是不適用。**照 ledger 的做法誠實記成
「Did not run」並說明原因**，不要假裝跑過。

## CI 實際擋什麼（hosted runner 能跑的只有一部分）

| workflow | 觸發 | 內容 |
|---|---|---|
| `pytest.yml` | PR/push → main | olf-vnext anchor check（3 行 grep）→ `poetry install` → `poetry run pytest -q -x` |
| `rust-verify.yml` | paths 含 `rust/**`、`parity/**`、**`src/olfparser/**`**、`tests/fixtures/hub/**` | L0 → release build → FFI 符號表 → hub corpus 的 L1/L2/L3 |

**`src/olfparser/**` 那條是 drift guard**：改 Python 也會觸發 Rust 驗證。
CI 上的 corpus 只有 in-repo 的 hub fixtures，**全 corpus 要在本機跑**。

---

## ⚠️ Waiver：已核准的差異，但**不得用放寬容差來蓋掉**

`PARITY_ORACLE.md` 目前記了兩個 scoped waiver，都只限 `.pptx`：

| waiver | 範圍 |
|---|---|
| **MT-1946** | textarea 文字寬度／換行／content height；table row/column lengths、width、height；由上述衍生的 placement geometry；runless paragraph 由 `a:endParaRPr@sz` 產生的 `font-size`（Python 仍固定 20.0） |
| **MT-2113** | **僅限**「Rust 多出 `source-id` 這一個 key」的 field-set diff |

紀律（原文就用「不得」）：

- **不是**全域放寬 ATOL/RTOL，**不**豁免結構、文字內容、`fonts[]`、資產集合或其他格式。
- MT-2113 的欄位**值**錯誤、缺 stamp、任何其他結構差異 → 仍是 FAIL。
- raw runner 尚未分類 waiver，所以 `run_parity.py --ext .pptx` **本來就會**把這些列成
  ERROR。**不能把那個 raw exit code 單獨解讀成回歸**——要按 path 分類後判讀。

> 這是這個 repo 最重要的一條文化：**紅燈不一定是壞掉，但「調寬門檻讓它變綠」永遠是錯的。**
> `PARITY_ORACLE.md` 開頭就寫「所有 agent 以此為契約，**不得自行放寬**」。

## ⚠️ 字型環境會讓結果不可重現（P5 的前提會失效）

未指定字體的 run 序列化成 OLF 內建 `open_sans`；Rust Stage-1 把它映射到 Google Fonts
的 `Open Sans`，查找順序是 **process cache → disk cache → network**。

所以：**online/offline、warm/cold cache、CI/本機，可能改變換行、內容高、列高與
table width/height。** 跨機器比 corpus/golden，只有在字型 cache、網路可用性、
timeout 結果都相同時才能直接比。

→ 看到幾何差異時，**先分類成 font-environment variance，再判斷是否還有非 waiver 的 ERROR**。
這項相依性是「已接受的取捨」，同樣**不得以全域容差掩蓋**。

## Golden 檔

Python 側 golden 在 `tests/test_pptx_golden_file/olf/`，比對前會正規化 UUID
（DFS 順序換成 `uuid-0`…）與時間戳；二進位資產 byte 比對，但
`images/thumbnail.png` 豁免（渲染像素跨環境不保證穩定）。

### ⚠️ CI **完全不跑**這個 suite —— 不要以為它會把關

`tests/conftest.py`：

```python
if os.environ.get("CI"):
    collect_ignore.append("test_pptx_golden_files.py")
```

它是**單機開發者快照**：layout bake 走 freetype + fontconfig，跨 OS／字型堆疊
不穩定，所以「只在產生 goldens 的那台機器上有意義」。

**症狀是靜默的**：`poetry run pytest -q` 在 CI 一片綠，54 個 golden 測試根本沒被收集。
辨識法是看測試數與時間 —— main 的全套 2738 passed / 72s，而 golden suite 單獨就要 83s，
對不上就是沒收。

由來（MT-2725）：我照上一版這裡寫的「留給 CI 把關」，推了一條暫時 workflow
到 `ubuntu-latest` 重生 golden。那正好是規範明文排除的環境，產出不能用。
**不穩定的東西不會因為換到 CI 就變穩定，只會變成別人的字型堆疊。**

### 影響的不只是圖片 bytes，還有 content.json 的元素數量

很容易誤判成「反正只是渲染差異」。實際上文字排版決定 emit 幾個
textarea／paragraph／text 元素，所以 `content.json` 的**結構**也跟著變。
實測 `bg_picture_hyperlink_on_shape`：committed golden 有 1 個 `image.id`、0 個
`textarea.id`；本機同一份 pptx 轉出 31 與 4。

### 動 golden 之前先驗「這台機器算不算數」

拿**完全未修改**的 main 跑一次：

```bash
PYTHONPATH=src python -m pytest tests/test_pptx_golden_files.py -q
```

全過才有資格 `--update-golden`。有紅就代表這台不是錄製環境，**這時重生等於把
自己的字型堆疊烙進去**，要留給環境的擁有者處理，並在 PR 寫明原因與實測數字。

### `_eot` 沒 build 會讓失敗數暴增，而且看起來像別的問題

沒有 `olfparser._eot` 時內嵌 MTX/EOT 字型解不開 → `olf.fonts` 整個消失、文字走
fallback。實測未修改的 main：**有 `_eot` 失敗 25/54，沒有失敗 45/54。**
只會印一行 `_eot native module not importable` 的 warning。

`native/build_eot.py` 的 docstring 說「不受 cwd 影響」，**不成立**：cffi 會 chdir
到 `src/`，而 `set_source` 的 include／source 是相對路徑（`native/eot_glue.c`），
所以獨立執行一定失敗。變通：

```bash
ln -s ../native src/native && python native/build_eot.py && rm src/native
```
（另外 Python ≥3.12 的 cffi 需要 `pip install setuptools`，否則錯誤訊息完全不提字型。）

### 其他

1. `--update-golden` 會**覆寫全部** golden。先確認每個 diff 都是你要的。
2. 發版檢查單第 4 條：golden 漂移要先過 `pptx2olf-golden-review`
   （那是別人的 skill，你手上沒有 → 就人工逐檔說明漂移原因）。

## 回報格式：照 ledger 的「完成／未完成」兩段寫

`docs/review-loop-ledger/2026-07-31-MT-1946-finding-fixes.md` 的結尾值得照抄——
**帶指令、帶數字，而且獨立列出沒驗的**：

```
## Verification completed
- cargo fmt --all --check — green.
- cargo clippy -p pptx-convert -p thumbnail --all-targets --all-features -- -D warnings — green.
- cargo test -p pptx-convert --lib — 885 passed, 0 failed, 2 pre-existing ignored.
- cargo test --workspace --quiet — green（PPTX golden corpus 1 passed, 187.08s）
- git diff --check — green.

## Not verified
- 未跑 scripts/verify_rust.sh：它 hard-code 了本 worktree 外的 corpus/FFI 路徑。
- 未做線上 Google Fonts 解析；字型行為以注入的真實 WOFF2 fixture bytes 密封測試。
- 未跑 xcodebuild / Android 封裝 / myViewBoard 匯入 / 目視。
```

**「pre-existing ignored」「pre-existing failing」要標出來**，否則下一個人分不清
是不是你弄壞的。
