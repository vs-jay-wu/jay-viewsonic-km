---
name: orca
description: 用 Orca（Jay 的 ADE）的 CLI 做事時先叫。涵蓋 /usr/local/bin/orca 為什麼是壞的、terminal create 的兩個陷阱、每次呼叫都會啟動新行程導致 macOS 一直跳權限、以及能拿來做什麼（terminal / worktree / orchestration）。
---

# Orca（ADE）的 CLI

Orca 是 Jay 的 **ADE**（agentic development environment，`com.stablyai.orca`），
不是編輯器也不是終端機模擬器。km web 的「在 Orca 開啟 session」就是走它的 CLI。

**先看有沒有現成的包裝**：`scripts/orca.sh`（km repo）已經處理好啟動方式，
直接 `./scripts/orca.sh <原本的參數…>`。程式碼端見 `web/lib/orca.ts`。

---

## 1. `/usr/local/bin/orca` 是壞的，不要用

```
$ orca --help
Unable to determine Orca.app path from symlink: /usr/local/bin/orca
```

那個 symlink 是 `root:wheel`、權限 `lrwx------`，一般使用者**讀不到 link target**，
於是它自己的 `app_realpath()` 算不出 app 路徑就中止。

繞過方式（`scripts/orca.sh` 做的就是這件事）：

```bash
ELECTRON_RUN_AS_NODE=1 /Applications/Orca.app/Contents/MacOS/Orca \
  /Applications/Orca.app/Contents/Resources/app.asar.unpacked/out/cli/index.js <args> --json
```

要修原本那支：`sudo chmod 755 /usr/local/bin/orca`（未實測，Jay 自行決定）。

## 2. 每呼叫一次就啟動一個新的 Orca.app 行程

沒有常駐 daemon 可以打。這會有兩個後果：

- **macOS 26 的 App Data 保護會跳權限**（「Orca.app would like to access data from
  other apps」）。連續呼叫＝連續跳，很煩。
- 單次成本其實不高（**實測 0.1–0.2 秒**），所以慢不是問題，**次數才是**。

→ 寫整合時把呼叫次數壓到最少：能從錯誤碼判斷的就不要先查一次狀態。
`web/lib/orca.ts` 的開啟流程就是這樣從 5 次降到 2 次（重用時 1 次）。

授權狀態可以直接查（要 Full Disk Access 才讀得到）：

```bash
sqlite3 ~/Library/Application\ Support/com.apple.TCC/TCC.db \
  "select service, auth_value, datetime(last_modified,'unixepoch','localtime')
   from access where client='com.stablyai.orca';"
```

`kTCCServiceSystemPolicyAppData` 的 **`auth_value=5` 就是「已允許」**（不是 2）——
比對過同機器上 iTerm2 / Warp / Claude Code / DiskInventoryX 全都是 5。
Full Disk Access 在**系統層**的 `/Library/Application Support/com.apple.TCC/TCC.db`，
不在使用者層那份。

## 3. `terminal create` 的三個陷阱

| 陷阱 | 實測 |
|---|---|
| **帶 `--focus` 會 timeout** | 回 `Timed out waiting for terminal handle after creation`；不帶就正常。改成建立完再 `terminal switch --terminal <handle>` |
| **`--title` 會被執行中的程式蓋掉** | 帶 `--title km-probe-3 --command "sleep 40"`，`terminal show` 回來的 title 已經是 `sleep`。**所以標題不能當識別鍵** |
| **只認註冊過的 repo** | 沒註冊的路徑回 `{"ok":false,"error":{"code":"selector_not_found"}}`。要 `orca repo add --path <path>`，那會改到 Orca 的設定，**先問過人再做** |

回傳結構是 `result.terminal.handle`（不是 `result.handle`）。

## 4. 要辨識「同一個東西已經開著」，用自己的記帳

因為標題不可靠，`web/lib/orca.ts` 的做法是：

1. 自己存 `sessionId → terminal handle`，要開之前直接 `terminal switch`，
   成功就是還活著（handle 死了它會失敗，不必先 `terminal show` 多花一次呼叫）。
2. 兜底再 `pgrep -f "claude .*--resume <id>"`，涵蓋記帳檔掉了、或人在別處開的情況。

## 5. 它還能做什麼

`./scripts/orca.sh --help` 有完整清單，重點：

- **terminal**：`list` / `create` / `send`（送輸入）/ `read`（讀輸出）/ `wait` /
  `switch` / `close`。`list --json` 看得到 `worktreePath`、`branch`、`agentIdentity`、`preview`
- **worktree**：`list` / `create` / `ps`（跨 worktree 的編排摘要）
- **orchestration**：多 agent 的 run / task / dispatch / worker / gate
- **automations**：排程

`agent-context` 會印出機器可讀的指令 schema，要寫整合時先看它。

## 由來

2026-09-11 做 km web 的「從清單在 Orca 開啟（resume）session」時逐項實測出來的。
上面每個「實測」都是當天跑過的結果，不是從文件推的。
