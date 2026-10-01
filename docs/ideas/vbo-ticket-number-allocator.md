# 備案：km 當 edu-vbo 票號的配發者

**狀態：不做（2026-10-01 討論後決定），留著當備案。**
未來「翻案條件」成立再回來看這份。

## 想做什麼

edu-vbo **沒有外部 tracker**，票號是 repo 自己的，登記在 `docs/tickets.md`。
2026-09-29 起改成每人一組：`VBO-<Handle>-<NNN>`（`VBO-Jay-001`…）。

想讓 km（hub）當 Jay 自己那組號碼的協調者：

- AI 要開票就打 km 的 API 要號碼，不要各自猜
- 支援 **dry-run**（只問下一個是幾號）與 **run**（真的佔住）
- km 的 `/tickets` 也持有 `VBO-Jay-*`，像 VB-* 一樣可以點「Orca 開啟」、關聯 session

## 討論出來的東西（這才是這份文件的價值）

### 1. 這個洞是 repo 自己寫下來的，而且**只在自己的前綴內**

`docs/tickets.md` 原文：

> **Your own collisions are yours.** Two of your worktrees or agent sessions can still
> claim the same number — the scheme only separates people. Check your section below
> before claiming, and claim before the first commit.

per-person 前綴解決的是**人跟人**撞號；**同一個人的多個 session／worktree 撞號是明文
留著沒解的**。所以這件事落在自己的前綴裡 —— **不碰團隊的 claim 協定、不需要 Jacky 裁決**
（`vbo` skill：「會擴大鎖定範圍的問題不是自己答」）。這是它值得做的主要理由。

### 2. ⚠️ 天真地 grep 會拿到錯的下一個號碼

2026-10-01 實測，整份 `docs/tickets.md` grep `VBO-Jay-[0-9]*` 得到：

```
VBO-Jay-001   ← 真的票（Jay 區段的表格列）
VBO-Jay-002   ← 規則說明的舉例：「VBO-Jay-001, VBO-Jay-002, …」
VBO-Jay-1000  ← 規則說明的舉例：「it simply grows past 999」
```

**散文裡的舉例跟真的票號長得一模一樣**，於是 `max + 1` 會算出 **1001**。
配號器必須**解析 Jay 區段的表格列**，不能 grep 全檔 —— 而且這種錯**不會報錯**，
只會安靜地跳號。

> 這條跟實作做不做無關：**任何**要讀這個 registry 的東西都會踩到。

### 3. km 現在解析不了這種票號（這也擋住「顯示」那半）

`web/lib/workItemRules.ts` 的 `EMBEDDED_KEY_RE` 是 `\b(PROJ)-(\d+)\b`，
`VBO-Jay-003` **配不上**（中間多一段）。

所以「像 VB-* 一樣點 Orca 開啟」的第一步是把票號文法擴成
`<PREFIX>(-<Handle>)?-<NNN>`，不是 UI 的事。

### 4. km 不該「持有」號碼，只該提供「互斥」

真相來源是 **repo 裡進版控的 `docs/tickets.md`**。km 自己存一份計數器 = 兩份登記簿，
而它一定會漂移（手動加的列、被放棄的分支、`data/hub/` 搬家重建、別人動到你的區段）。

正確的形狀是**算出來、不是記下來**：

```
下一個 = max(所有 ref 上看得到的 Jay 區段表格號碼  ∪  還沒過期的保留) + 1
```

⚠️ **不能只看 `origin/main`** —— 已經 claim 但還沒 merge 的號碼躺在 feature branch 上，
只看 main 會重發。這跟 repo 說的「claim before the first commit」是同一件事的兩面。

km 唯一不可取代的貢獻是**那幾秒的保留**（兩個 session 同時算出 003 時，有人先說「我拿走了」）。
保留要有 TTL，而且過期要**看得見**，否則被放棄的 session 會永久燒掉一個號碼，
而你不會知道為什麼跳號。

**好處**：km 掛了最多是那段窗口內可能撞號，不會產生一份跟 repo 對不起來的假登記簿。

### 5. run 的時候 km 不要寫任何工作區

「真的新增 ticket」要切兩半，否則會做錯：

- km（hub）自己的 edu-vbo checkout 在 **A 上、而且在 `main`**，而 repo 規則**不准 commit 到 main**。
- 真正要寫 `docs/tickets.md` 那一列與 change 的 `metadata.yaml` 的，是**正在做事的那個
  agent，在它自己的分支、自己的 worktree**（可能在另一台機器上）。

| | 誰做 |
|---|---|
| 配號 ＋ 保留 | km（稀缺資源的協調，唯一不可取代的角色） |
| 寫 tickets.md 那列、metadata.yaml、commit | agent 在自己的工作區 |
| 把保留升級成「已佔用」 | km 掃到那個號碼出現在任何 ref 上時，自動 |

這也跟 km 既有的原則一致：`/code` 整條路徑唯讀，km 從不改別人的工作區。

於是 dry-run / run 的界線很自然：

- **dry-run**：純算，不寫任何東西，**不需要 hub**（satellite 自己讀 git 就能算）
- **run**：登記一筆保留，**這步才需要 hub**

### 6. 「顯示 ＋ Orca 開啟」那半可以單獨做，而且比較便宜

km 的 `/tickets` 本來就是「掃外部資料 → 建索引 → 關聯 session／PR」。VBO 的差別只在
資料源從 Jira API 變成**讀 repo 的 markdown 表格**，而且完全是衍生資料
（放 `data/hub/` 的快取，不是真相）。

接上之後「Orca 開啟」「關聯 session」**會自動成立** —— 那套是靠 session 標題裡的票號串的
（`[km/vbo] VBO-Jay-003 描述`），前提是 §3 的文法先擴好。

**這半不依賴配號器。** 想要的話可以只做這半。

### 7. 另一條路：用 git ref 當鎖（不需要 km）

claim 時 `git push origin refs/tickets/VBO-Jay-003` —— 遠端 ref 更新是原子的，
已存在就失敗 → 天然的分散式互斥，**km 掛了也能用、跨機器自動成立**。

**代價**：會在團隊共用的遠端長出一堆 ref，是別人看得到的改變 —— 依 `vbo` 的規則
那要問 Jacky。km 版本則完全在自己這邊。

如果哪天覺得「km 當協調者」太重（例如常在沒有 hub 的地方工作），這是現成的升級路。

## 為什麼先不做

Jay 2026-10-01 決定不做（沒有展開理由）。討論中浮出來、支持這個決定的幾點：

- **撞號還沒真的發生過。** Jay 區段目前只有 `VBO-Jay-001` 一張票 —— 以這個頻率，
  「開票前看一眼表格」本來就夠。
- **`dry-run` 其實就解決九成**，而 dry-run 不需要 km 當服務（讀 git 就能算）。
  `run` 的保留只是把「我看完 → 我寫進去」那幾分鐘的窗口關掉。
- 開票頻率這個關鍵數字**沒有被量過**，而它決定 TTL 要訂多長、保留層值不值得。

## 翻案條件

任一成立就回來看這份：

1. **真的撞號一次** —— 兩個 session claim 到同一個號碼，在 merge 才發現。
   這是最直接的訊號，也是 repo 自己預言的那個失敗模式。
2. **開票頻率上升到每週 3 張以上**，或同時有兩台機器的 agent 在開 VBO 票。
3. **已經為了「顯示／Orca 開啟」把票號文法擴好了**（§3）—— 那時配號只是多一小塊，
   邊際成本低很多。
4. 發現 **Jacky 的 orchestrator 也會產生 `VBO-Jay-*`** —— 那時 km 不是唯一來源，
   設計要重想（保留仍有用，但要接受外部來源）。
   > 2026-10-01 的理解是「每人管自己的，所以不會」，但那是**推論，沒有查證**。

## 相關

- `.claude/skills/vbo/SKILL.md` —— edu-vbo 的工作核心（票號、分支、commit 格式）
- `docs/ideas/km-multi-machine.md` —— hub／satellite 的角色與「誰擁有哪筆狀態」
- edu-vbo 的 `docs/tickets.md` —— 票號 registry 本身（真相來源）
