---
name: olfparser
description: "Use when writing, reviewing, or committing code in olfparser (PPTX/Flipchart/Notebook/ENB/PDF/IWB → OLF converter; Python + Rust port) — before any Edit/Write in that repo. Covers where the checkout actually is, the dead CLAUDE.md pointers, Python/Rust dual-track layout, and the ticket/branch conventions. Examples: \"改 olfparser 的 xxx\", \"pptx 轉檔壞掉\", \"看一下 rust port 進度\""
---

# olfparser 工作核心

repo：`Viewsonic-EDU/olfparser`（GitHub，private）

**互動式白板檔案格式轉換器**：Flipchart / PPTX / Notebook / ENB / PDF / IWB → OLF。
Python 是**參考實作（oracle）**，Rust 是**進行中的 port**。發布 Windows NuGet
`ViewSonic.OlfParser` 與各平台 binary；mvbw v3（sparrow）用它做 PPTX 匯入。

---

## 步驟 0：先找到 checkout（它多半不在內接硬碟）

olfparser 目前列在 `local.workspace.json` 的 `offloaded`，實體在**外接硬碟**。
路徑會變，**動態讀，不要記死**：

```bash
cd /Users/jay.wj.wu/ProjectsWork_GitHub/jay-viewsonic-km
python3 -c "
import json,os
o=json.load(open('local.workspace.json'))['orgs']['Viewsonic-EDU']
for k in ('localPath','externalPath'):
    p=os.path.join(o[k],'olfparser')
    print(('✅' if os.path.isdir(p) else '❌'), k, p)"
```

找到就當一般本機 repo 用。外接沒掛載才退回 `gh api` 讀遠端。
詳見 memory `offloaded-repos-live-on-external-drive`。

### 外接的 checkout 常落後遠端

離線期間別人照樣在 push。**每次開工先對一次**：

```bash
git -C "$R" fetch origin && git -C "$R" log --oneline HEAD..origin/main | head
```

實際踩過：2026-08-26 外接 HEAD 落後 3 個 commit，缺的正好是整批 olf-vnext
governance 文件——照舊版做事會漏掉整節規範。

### macOS 在外接會產生 `._*` 噪音

exFAT/HFS 上每個檔都配一個 AppleDouble `._x`。`find` / `ls` 要過濾，
`git status` 會被洗版，`git` 對 `.git/objects/pack/._pack-*.idx` 會噴
`non-monotonic index` —— **那是噪音，不是 repo 壞掉**，指令照樣正確執行。

## 步驟 1：確認分支

```bash
git -C "$R" branch --show-current
```

各 repo 分支狀態獨立且會變動。**字串比對失敗時先懷疑「是不是在錯的分支」**。

分支命名（照既有慣例）：`MT-2612-olf-vnext-governance`、`MT-1946-conv-text-metrics`
——即 `<TICKET>-<英文 kebab slug>`。也有 `fix/…`、`ci/…`、`chore/…` 型，
但**有票就用票號開頭**。

> 團隊裡有人用 git worktree 開工（ledger 顯示 `~/.mvb-worktrees/MT-xxxx/olfparser`）。
> 你不一定要跟，但看到別人的紀錄提到 worktree 路徑時，那不是主 checkout。

## 步驟 2：不要引用 km 路徑

專案 repo 的任何檔案（原始碼註解、docs、PR 描述、commit message、Jira 留言）
都不可以出現 km 的路徑。結論寫進註解本身，指標指向 Jira / 同 repo 檔案。

---

## ⚠️ CLAUDE.md 指向的東西**全部不存在**，不要浪費時間找

這是 olfparser 與 mvbf 最大的差異，也是最容易空轉的地方。

`.gitignore` 從**初始 commit `cb6ae7e`** 就排除了 `prospec/`、`.claude/`、`.prospec/`，
`git log --all -- .claude prospec .prospec` 在所有分支上都是空的 ——
**這些目錄從未進過版控，也不在任何本機 checkout 裡**（2026-08-26 掃過 435 個
checkout ＋ `~/.claude` 全域，零命中）。

所以下列引用**一律讀不到**，看到就跳過：

| 出現在 | 引用了什麼 |
|---|---|
| `CLAUDE.md` | `prospec/CONSTITUTION.md`、`prospec/ai-knowledge/*`、10 個 `/prospec-*` skill |
| `docs/rust-port/WORKFLOW.md` | `.claude/skills/` 的五個角色、`.claude/workflows/rust-port-module.js` |
| `docs/olf-convert/WORKFLOW.md` | `.claude/workflows/olf-convert.js` |
| `docs/rust-port/FFI_PLAN.md` | `.claude/workflows/rust-verify.js` |
| 舊 review ledger | `.claude/rules/conversion.md`（連 CLAUDE.md 都不再提它） |

別人的 agent 也撞過同一件事並誠實記在
`docs/review-loop-ledger/2026-07-31-MT-1946-finding-fixes.md`：
「The required `.claude/rules/conversion.md` path and the `prospec` files
referenced by `CLAUDE.md` do not exist and are not tracked in this worktree;
no file outside the worktree was substituted.」

**照抄那個處理方式**：確認不存在 → 在交付說明裡寫明「這幾份規範讀不到」→
繼續做，**不要**拿別處的檔頂替。

### 真正有效力的規範在版控裡

| 讀什麼 | 何時 |
|---|---|
| `docs/olf-vnext/README.md` 開頭五條「AI 消費守則」 | **動到 OLF 格式語意前必讀**（見 `olf-vnext` skill） |
| `docs/rust-port/PORT_STATUS.md` | 要動 Rust crate |
| `docs/rust-port/PARITY_ORACLE.md` | 要判 parity、想調容差 |
| `docs/rust-port/VERIFICATION.md` | 要驗證改動（見 `olfparser-verify` skill） |
| `docs/olf-convert/*` | 動 legacy↔v-next 轉換 |
| `README.md` §開發 | 環境安裝 |
| `AGENTS.md` | ⚠️ 前半段是**別的專案**（Flipchart .NET）殘留，不要照做；只有結尾 OLF schema 那節有效 |

---

## 專案結構：Python 是 oracle，Rust 在追

```
src/olfparser/        Python 參考實作（正典行為的來源）
rust/crates/          26 個 crate：*-parser / *-convert / olf-{types,core,canonical,
                      upgrade,downgrade,convert-vnext} / thumbnail / olf-{ffi,jni}
parity/               跨語言比對 oracle（normalize / run_parity / validity_gate / visual_parity）
tests/                Python pytest（含 golden）
docs/                 見上表
dll/ exe/ mac/ native/  各平台封裝出口
```

**改 Python 會連動 Rust 的 CI**：`rust-verify.yml` 把 `src/olfparser/**` 列進
paths 當 **drift guard** —— Python 動了就必須重證 parity。改 Python 前先想
「Rust 那邊要不要跟」，答案是「不跟」時要在 PR 講明白。

## 環境

Python 3.13+、Poetry。**`-E dev` 與 `--with dev` 是兩個不同的 PEP，別搞混**：

```bash
poetry install -E dev          # pytest / ruff / mypy（PEP 621 optional-dependencies）
poetry install --with dev      # numpy 等本機便利套件（PEP 735 dependency-groups）
poetry install -E dev --with dev
```

⚠️ 只跑 `poetry install --with dev` **不會**裝到 pytest / ruff / mypy。

```bash
poetry run pytest            # 測試（CI 用 -q -x）
poetry run ruff check src/   # line-length 120, target py313
poetry run mypy src/
cd rust && cargo fmt --all --check && cargo clippy --workspace -- -D warnings && cargo test --workspace
```

---

## 語言慣例：繁中敘述、English 識別字

`docs/olf-vnext/README.md` 結尾明寫這條慣例。實際上 commit subject、PR 描述、
文件敘述都是中英混寫（`fix(pptx): 序列化 normAutofit line-height-factor…`），
但**識別字、路徑、欄位名一律英文**。跟著現況寫。

## 相關 skill

- `olf-vnext` — OLF 格式合約的五條 AI 消費守則（**跨 repo**，mvbf 也是消費端）
- `olfparser-verify` — 驗證金字塔、parity、golden、waiver 紀律
- `olfparser-review` — review
- `olfparser-commit` — commit 與 PR 描述
- `handoff-docs` — 對外文件。不限 repo
