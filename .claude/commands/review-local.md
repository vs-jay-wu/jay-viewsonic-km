在 commit 或 push 之前，對本地端還沒送出去的改動做一次交叉驗證。

球還在自己手上的時候抓問題，比等 reviewer 抓便宜。

## 說明

腳本 `scripts/review-local.sh` 負責**抓資料**，並丟給一個拋棄式子程序去**讀 diff**，
你負責**驗證它的結論並回報**。

跟 `/handle-pr-inbox` 用同一套切法（`--restricted --tools "Read,Grep,Glob"`，
Bash / Edit / Write 根本不存在、session 不落地），差別在：

| | `review-pr.sh` | `review-local.sh` |
|---|---|---|
| 對象 | GitHub 上的 PR | 本地工作區／分支 |
| 子程序看到的 repo | 可能停在別的分支，只能當背景 | **就是 diff 描述的狀態**，可以放心 Grep 呼叫端 |
| 產出去向 | 可能貼上 GitHub | 只印給 Jay 看，不外流 |

### 範圍自動判斷

- 工作區**有**未提交改動 → 看未提交的（staged + unstaged + untracked）
- 工作區**乾淨** → 看整條分支 vs merge-base

untracked 新檔會用 `git diff --no-index` 產合成 diff 納入，**不會**動到 index
（不用 `git add -N`，避免弄亂 Jay 自己的暫存狀態）。

### 已經內建的守門

- `.env` / `*.jks` / `*.keystore` / `key.properties` / `*.pem` / `*.p12`
  **內容不會進 diff**（`sensitive-files.md`）；有被改到就只報檔名，請 Jay 自己確認。
- 在**預設分支**上有改動時會標成 blocker（`cross-repo-workflow.md` §2）。
- repo → 該讀哪些 km skill 的對應寫在腳本裡；子程序會自己 Read，
  並接著讀該 repo 自己的 `.claude/rules/` 與 `CLAUDE.md`（團隊 rules 優先）。

## 範例

- `/review-local` → 對 session 裡正在動的那個專案 repo，範圍自動判斷
- `/review-local mvbf` / `/review-local edu-droid-flutter` → 指名 repo
- `/review-local --branch` → push 前看整條分支
- `/review-local --staged` → 只驗即將 commit 的那些
- `/review-local --all` → 分支 ＋ 未提交一起看
- `/review-local --base develop` → base 不是 main/master 時
- `/review-local --km` → 真的要看 km 自己的改動（少見）

## 執行

**先決定目標 repo，再跑。** 這支腳本 review 的是 session 裡在動的**專案 repo**，
不是 km 自己 —— 但 cwd 常常停在 km，所以腳本在「沒指明目標卻落在 km」時會直接擋下來。

決定目標的順序：

1. Jay 這句話有指名 repo 嗎？（`mvbf` → `edu-droid-flutter`、`cs` → `ragdoll-cat`，
   別名見 memory 的「Repo 口語別名」）
2. 沒指名 → 看 session 的 additional working directories 裡有哪個專案 repo，
   那通常就是這輪在動的那個。
3. 還是不確定 → **問 Jay，不要猜**。跑錯 repo 的 review 是純浪費。

```bash
./scripts/review-local.sh <repo 絕對路徑> ${ARGUMENTS}
```

## 拿到結果之後

### 1. 每條 finding 都要驗，不要照抄

子程序給的 finding **是待驗證的宣稱，不是結論**（`cross-system-claims.md` §2）：

- 標 `MUST` 的一律自己追到程式碼確認一次。
- 看 `confidence`：`inferred` 的預設不可信，要嘛驗成 `read_code`，要嘛拿掉。
- 「安全性」類的直覺主張最容易錯 —— 問「洩漏給誰」「對方本來就知道嗎」
  「這條路前面有沒有守衛」。
- **驗不過的就拿掉，並告訴 Jay 拿掉了什麼。** 只報「它說了什麼」而不報「我驗了沒」，
  等於把驗證責任推回給 Jay。

### 2. 要動手改之前，先叫該 repo 的 skill

`cross-repo-workflow.md` §0：專案 repo 的 rules 不會跨 repo 自動載入。
子程序讀過不算，**你自己**要改檔案就得自己讀一次。

順序：確認分支（`git branch --show-current`）→ 叫 skill → 才動手。

### 3. 回報格式

```
<repo> @ <branch>（<head>）  範圍=<scope>  verdict=<x>
<一到三句：這批改動在做什麼、能不能送>

要先處理：
  [MUST] <title>  — 我驗過：<怎麼驗的>
  ⛔ <blocker>
可以考慮：
  [SHOULD] <title>
我驗掉的：
  <title>  — <為什麼不成立>
```

### 4. 不要自動 commit、不要自動 push

修完之後把結果報給 Jay，由他決定要不要送。
（全域規則，見 memory 的「禁止自動 commit」。）
