# 開發行程記憶體回收：什麼在漏、殺哪一隻

24 GB 的機器跑到「未壓縮可用 0.2 GB、壓縮器 49.3 GB → 1.5 GB（33x）、swap 26.7/28 GB」，
開機碟只剩 30 GB。這份記錄的是**當時實測的元凶、殺錯目標的坑，以及回收工具**。

相關：[dart-analysis-server-memory.md](dart-analysis-server-memory.md)（VS Code 側的 Dart analysis
server）、[README.md](README.md)（Gradle daemon 的記憶體上限設定）。

---

## 先講結論：swap 不是能調的旋鈕

macOS 的 swap 由 `dynamic_pager` 自動管理，**沒有可調上限**；實質上限就是開機碟可用空間。
當時已經有 28 個 `/System/Volumes/VM/swapfile*`，而磁碟只剩 30 GB。

所以「增加 swap」不但沒得調，還是**危險方向** —— 撞到磁碟滿是救不回來的當機。
要做的是把佔用降下來，swapfile 總量會自己縮（實測從 28 GB 收回到 18 GB）。

---

## 元凶一：`dart mcp-server`（Claude Code 的 Flutter MCP）

### 判準：看的是「有沒有用過」，不是年齡

| PID | 存活 | Footprint |
|---|---|---|
| 19229 | 2 時 26 分 | **18 MB** |
| 75423 | 10 分 | 26 MB |
| 57634 | 14 分 | **2287 MB** |
| 72055 | **5 天 23 小時** | 2421 MB |

年齡完全不相關。剛啟動只有 18 MB，**一旦真的跑過專案分析就膨脹到 ~2.3 GB 且不再縮回**。
當時 9 隻裡有 5 隻是膨脹狀態，合計約 11 GB。

處置方式（**不關設定、改成事後回收**）與理由見下方
[「決定：不從 `km/.mcp.json` 拿掉 `Flutter-MCP-Server`」](#決定不從-kmmcpjson-拿掉-flutter-mcp-server)。

### 它從哪個設定檔來：用 `lsof` 查，不要用猜的

`km/.mcp.json` 自己就有 `Flutter-MCP-Server`（是 mvbf 那份的近乎複製，只是 token 改 `${VAR}` 佔位），
所以**在 km 開 agent 一樣會生出這隻**，跟 mvbf 的 `.mcp.json` 無關，也不是 global。

查證方式 —— 行程實際掛在哪個目錄：

```bash
lsof -a -p <mcp-pid> -d cwd -Fn | grep '^n'
```

當時 4 隻活著的 mcp-server，cwd 全部是 km repo。三個來源的實際狀態：

| 來源 | 有沒有 Flutter-MCP-Server |
|---|---|
| `~/.claude.json` 的 global `mcpServers` | ❌ 只有 `chrome-devtools` |
| `~/.claude/settings.json` | ❌ 完全沒有 mcp 欄位 |
| `km/.mcp.json` | ✅ |
| `mvbf/.mcp.json` | ✅（但那是 mvbf session 的路徑） |

### 決定：**不**從 `km/.mcp.json` 拿掉 `Flutter-MCP-Server`（2026-09-11 已推翻）

> ⚠️ **這個決定已經被推翻，下面保留原文只為了記錄理由的演變。**
> 2026-09-11 起 Flutter MCP 一律停用，見 km `CLAUDE.md` 的「禁止使用 Dart / Flutter MCP」。
> 翻案的是下面列的第一條條件，而且比預期更糟：
> - `dart mcp-server` 本身只有 31–41 MB，但它生的 `dart language-server` 漲到 **800 MB–1.1 GB**
> - **它們不跟著 session 結束**——把所有 Claude 視窗關掉重開之後，三組行程 PID 原封不動還在
>   （合計 2.9 GB），只能手動 kill。所以「事後用 memclean 回收」等於每次都要人工介入。

2026-09-10 討論後的結論，記下來避免日後（包括 AI）重新提議關掉。

**理由**：關掉的成本是「每次要用都得改設定＋重開 session」，是**日常、每次都付**的成本；
而省下的只有「你真的用了 Flutter MCP」的那幾次 —— 那幾次本來就是你需要它。
配合上面「用過才膨脹」的判準，沒用到的 session 它只佔 18 MB，本來就不是負擔。

**所以改成事後回收**：`memstat` 看到不對勁時打一次 `memclean`。

**翻案條件**（其中任一成立就該重新評估）：

- 剛啟動、沒用過的 mcp-server 也開始佔數百 MB 以上 —— 表示「用過才膨脹」不再成立
- Claude Code 提供 session 內即時切換 MCP 且免重開（`/mcp` 可能已經可以，**未實測**）
- km 的日常工作開始經常需要 Flutter MCP —— 那反而該讓它常駐

---

## 元凶二：Gradle / Kotlin daemon

三隻 JVM 全是 `-Xmx4096m`（`ps -o args=` 直接讀出來的），合計 10.2 GB：

- Android Studio 起一隻 Gradle daemon（用 AS 內建 jbr）
- CLI 起另一隻（用 homebrew openjdk）—— **兩者 context 不同，無法共用**
- Kotlin daemon 再一隻，**繼承 Gradle 的 jvmargs**

處理方式與實測見 [README.md 的「daemon 記憶體收斂」](README.md#daemon-記憶體收斂)。

---

## 殺錯目標的坑：`language-server` ≠ `mcp-server`

長期習慣性執行 `pkill -f "dart language-server"`，**完全沒有效果**，原因有兩層：

1. **匹配不到元凶。** `dart language-server` 和 `dart mcp-server` 是兩個不同行程，
   那個 pattern 從頭到尾沒碰到那 5 隻 2.3 GB 的。
2. **殺了也會立刻回來** —— 但這只對**父行程還活著**的那些成立。`language-server`
   是 VS Code 的 Dart 分析器，編輯器還開著就會在幾秒內重啟。
   實測重啟後 9 分鐘從 431 MB 漲到 1209 MB。

> **判準**：`pkill` 沒效果時，先確認 pattern 真的匹配到你以為的行程
> （`pgrep -f '<pattern>' | wc -l` 對照 `ps` 的實際佔用排名），
> 而不是加大力道重殺。

### 修正（2026-09-10）：孤兒 `language-server` 是另一回事

上面第 2 點曾被當成「language-server 一律不值得殺」，這個推論過寬。
**`ppid == 1` 的 language-server 沒有任何編輯器會重開它** —— 殺了就是淨回收。

當天實測，7 隻 language-server 合計 footprint **30.3 GB**，其中兩隻是孤兒
（6137 MB + 5434 MB = 11.5 GB），已存活 2 小時以上。清掉後全機 footprint
從 73 GB 降到 44.9 GB，記憶體可用率 33% → 67%。

危險的是它**在 `ps` 裡看不出來**：

```
pid=77916  footprint 1870M   RSS 6M    ← 差 300 倍
pid=63423  footprint 1340M   RSS 5M
```

整隻被壓進 swap，RSS 只剩個位數 MB。**任何用 RSS 排序的檢查都會判它無害。**
`memclean` 從一開始就是用 footprint，所以看得到；`ps aux | sort` 看不到。

因此 `memclean` 自 2026-09-10 起：孤兒 language-server **預設納入**，不需要 `-l`；
`-l` 的語意收斂成「連編輯器持有的（會立刻重開的）也一起清」。

---

## 工具：`memclean`

本體在本 repo 的 [`shell/memclean.zsh`](../../../shell/memclean.zsh)，跟 `memstat` 同一個口徑，
用 top 的 `MEM`（physical footprint）而非 RSS。

```bash
./scripts/setup-memclean.sh --dry-run   # 先看會改什麼
./scripts/setup-memclean.sh             # 在 ~/.zshrc 附加一行 source
./scripts/setup-memclean.sh --remove    # 移除
```

寫進 `~/.zshrc` 的只有一行 `source`，**函式本體留在版控裡** —— 改 `shell/memclean.zsh`
立刻生效，不必重跑 setup。腳本冪等，並且會擋下「`~/.zshrc` 裡另有內嵌 `memclean()` 定義」
的情況（那會覆蓋 repo 版本）。

> `memstat` 是既有的個人函式，仍然只在 `~/.zshrc`，沒有納入本 repo。

```
memclean              # dry-run，只列出與可回收量，不殺
memclean -f           # 真的殺（SIGTERM → 等 2 秒 → 不理的才 SIGKILL）
memclean -a 30        # 年齡門檻改 30 分（預設 120）
memclean -g           # 一併處理 Gradle / Kotlin daemon（不看年齡；build 中勿用）
memclean -l           # 連編輯器持有的 language-server 也清（會立刻重開）
                      #   ※ 孤兒 language-server 已預設納入，不需要 -l
memclean -h           # 說明
```

設計上的取捨：

- **預設 dry-run**，`-f` 才動手。
- **預設清 `dart mcp-server`**，門檻 120 分鐘 —— 當下正在用的 session 不會被誤殺。
- **父行程已死的孤兒不看年齡直接列**，`mcp-server` 與 `language-server` 都算
  （後者自 2026-09-10 起納入，見上一節）。
- **`-g` 不看年齡**（idle daemon 多久都該回收），所以 build 進行中不要用。

實測一次 `memclean -f -g`：回收 13.6 GB，swap 從 21.8 GB 掉到 16.2 GB。

### 為什麼不做成自動排程

先前那隻活了 5 天 23 小時的 mcp-server，**父 claude session 是活著的**，不是孤兒。
也就是真正的來源是「開著沒關的 claude session」，不是行程漏掉。所以：

- **只自動殺孤兒**（`ppid == 1`）→ 100% 安全，但抓不到這一類。
- **自動殺超過 N 小時的** → 抓得到，但會誤殺「開著過夜、隔天要繼續」的 session 的 MCP，
  而且是**無聲失效** —— 回來用 Flutter 工具才發現壞了。

結論是維持手動：`memstat` 看到不對勁時打一次 `memclean`。

### 實作坑：`top -n` 會截斷

第一版寫 `top -l 1 -stats pid,mem -n 400`，但機器上有 875 個行程，
**大部分 pid 查不到 footprint、畫面顯示 `0 MB`**，看起來像那些行程很小。
現在是 `-n 5000`。

> 這是「探針給看似合理的假結果」的典型：`0 MB` 不會報錯，只會讓人做出錯誤判斷。
