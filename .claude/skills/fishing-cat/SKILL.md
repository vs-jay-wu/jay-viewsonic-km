---
name: fishing-cat
description: 在 fishing-cat（ClassSwift 現役學生端 Web，host learn-swift.*）工作時先叫。涵蓋動手前要載入的知識庫、改完要回頭更新知識庫、CI 的四道檢查與本地等價指令、commit/PR 格式，以及新版重寫 edu-participant-web 的關係。
---

# fishing-cat（ClassSwift 現役學生端 Web）

repo：`Orgs/Viewsonic-EDU/fishing-cat`　host：`learn-swift.*`　技術：React + Vite + TypeScript

**新版重寫在 `edu-participant-web`**（尚未上線，會取代 participant UI/UX）。兩份並存期間，
講「學生端」要先確認是哪一份。

這是**個人層**補充。團隊慣例的 source of truth 在該 repo 的 `AGENTS.md` 與 `docs/knowledge/`，
**不要複製進 km**。

---

## 步驟 0：先載入知識庫（該 repo 自己的規定）

該 repo 有 `.claude/skills/knowledge-base-loader`，明寫「**任何任務的第一個動作**」都要先讀
`docs/knowledge/`，包括只是回答問題。照它做：

```
Read: docs/knowledge/README.md          # 入口
Read: docs/knowledge/<領域>/_index.md   # 依任務類型
```

高風險區（碰到就一定要先讀該檔）：socket／畫布 Excalidraw／`fishing_cat_src` 舊樹／座位與
sid／Task 狀態／環境變數／測試慣例。對照表在那支 skill 裡。

## 步驟 0.5：**改完要回頭更新知識庫**

> ⚠️ 這條最容易漏，因為 loader skill 只講「載入」，沒講「回寫」。

`docs/knowledge/` 記的是「**現在是什麼**」。改了行為、改了跨端契約、或發現既有描述是錯的，
**同一個 PR 就要更新它**，而不是留給下一個人。判準是 `docs/knowledge/README.md` 的維護原則：
事實導向、不寫 code 讀得到的東西、**記錄 why（附 commit sha 或 Jira 票號）**、
一檔一主題、新增檔案要同步更新該目錄 `_index.md`。

### 那支指令叫 `/prospec-knowledge-update`，但有兩個但書

團隊口語會說「跑一下 knowledge-update」。正式名稱是 **`/prospec-knowledge-update`**，
出處是 `prospec/CONSTITUTION.md:111`：

> Knowledge 變更（新模組、邊界改名）透過 `/prospec-knowledge-update` 更新 `prospec/ai-knowledge/`

**兩個但書，用之前先看**（2026-09-10 查證）：

1. **它不在版控裡。** fishing-cat 的 `.claude/` 只有 `knowledge-base-loader` 一支，唯一的指令檔是
   `.cursor/commands/vsx.pr-description.md`；`prospec/` 底下沒有 `.claude` 也沒有 `commands`。
   我另外掃過 `edu-participant-web` / `ragdoll-cat` / `ocelot`，都沒有。
   同一個模式 km 已經記過一次——見 [[olfparser-ai-setup-not-in-vcs]]。
   **所以它可能只存在於個別成員的本機**；要用先跟對方要定義。
2. **它宣稱的目標目錄已被淘汰。** 它寫的是更新 `prospec/ai-knowledge/`，而該目錄自己的
   `_index.md` 開頭就寫「**已被 `docs/knowledge/` 取代。新內容一律寫在那裡**」。
   照字面跑會寫錯地方。

**結論：真正該做的事不變——在同一個 PR 更新 `docs/knowledge/`。** 有沒有指令只是省不省手工，
沒有任何機制會在你忘記時提醒。這一節就是那個提醒。

**改一半比不改更糟。** 2026-09-09 的 VSFT-9718 實例：我修掉 KB 上半段一個錯誤歸因，卻留下
兩處仍用舊框架寫的段落，整份文件自相矛盾，被 reviewer 抓到（PR #578）。回寫之後
**整份 grep 一次那個關鍵字**，確認沒有殘留：

```bash
grep -n '<被推翻的說法>' docs/knowledge/features/<檔案>.md
```

---

## CI 的四道檢查與本地等價

**push 前先在本地跑完**，其中一道非得先 commit 才驗得到。

| CI | 本地等價 | 需要先 commit？ |
|---|---|---|
| `Test and Coverage` | `CI=true yarn test:coverage` | 否 |
| changed-file coverage gate（門檻 80%，**warn-only 不擋合併**） | `node scripts/check-changed-coverage.mjs` | 否 |
| **`trigger-deploy / Pre check PR`** | 見下方 regex | **是** |
| `scan / DevSecOps PR Scan`、`Build image` | 無本地等價 | — |

**`Pre check PR` 驗 PR 標題與每一筆 commit subject**，規則在 `sand-cat` 的 reusable workflow：

```bash
PATTERN='^(\[[A-Z]+-[0-9]+\])+ (feat|chore|fix|ci|refactor|test|style|build|docs)(\(\w*\))?!?: .|^Merge |^Sprint|^Revert '
{ gh pr view <PR> --json title --jq '.title'; git log origin/main..HEAD --format='%s'; } \
  | while IFS= read -r l; do echo "$l" | grep -qE "$PATTERN" && echo "✓ $l" || echo "✗ $l"; done
```

⚠️ **`.github/pull_request_template.md` 與 CI 規則不一致**：模板寫 `[Jira票號] 改動內容`，
沒提 conventional-commit 的 type。照模板寫會被擋（2026-09-09 踩過）。

⚠️ **改 PR 標題不會重跑 CI**（workflow 只在 `opened / reopened / synchronize` 觸發）。
改完要 `gh pr close && gh pr reopen` 才會重驗。

⚠️ **CI 沒有跑 `yarn lint`**。lint 只在 pre-commit 由 `lint-staged` 對 **staged 的 diff 行**
驗，所以全 src 的既有 warning 不會擋任何東西。（KB `conventions/lint-and-git.md` 寫「CI 才擋」，
與現行 workflow 對不上。）

### 已知的 flake

`lessonService.test.ts` 偶發 `TypeError: globalScope.addEventListener is not a function`
（Amplitude 在測試環境拆掉後才註冊事件），vitest 把 unhandled error 算成整體失敗。本地連跑
多次重現不了，**重跑同一個 commit 就過**。看到這個先重跑，不要當成自己改壞。

---

## Commit 與 PR

- Commit：`[VSFT-1234] type: 英文摘要`，hook 強制；type 白名單同上。**無 gitmoji**
- 英文散文 body 是既有風格；`Co-Authored-By` 有先例（近 80 筆有 23 筆）
- PR 描述照 `.github/pull_request_template.md`，但標題要照上面的 CI regex

---

## 相關

- 新版學生端 `edu-participant-web`：治理嚴格（`CONSTITUTION.md` ＋ lane 分流 ＋ 兩道人類關卡），
  動它之前讀那個 repo 的 `CLAUDE.md`
- Jira：新單開 `VB-`，見 `jira-vb` skill
