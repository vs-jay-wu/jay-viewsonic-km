---
name: colima
description: "Use whenever a task needs Docker/containers on this machine — before any `docker build` / `docker run` / `docker compose`, or when `docker` reports it cannot reach a daemon. Docker Desktop is NOT licensed here; Colima is the runtime. Covers starting it, the DOCKER_HOST trap, the $HOME-only mount limit, and when a container is the wrong tool. Examples: \"用 docker 跑一下\", \"cannot connect to the Docker daemon\", \"在 linux 環境重現\""
---

# Docker on this machine = Colima

**Docker Desktop 不能用（公司授權限制）。不要 `open -a Docker`，也不要建議安裝它。**

已安裝的是 Homebrew 的 CLI-only `docker` ＋ **Colima**（MIT，跑 Lima VM）：

```
/opt/homebrew/bin/docker   ← CLI only，沒有 daemon
colima                     ← 提供 daemon
```

`/Applications/Docker.app` 不存在。看到「Cannot connect to the Docker daemon」
時要做的是啟動 Colima，不是裝 Desktop。

---

## 啟動（每次重開機後都要）

```bash
colima status || colima start
unset DOCKER_HOST                 # ⚠️ 見下
docker info --format '{{.ServerVersion}} / {{.OSType}} / {{.Architecture}}'
```

### ⚠️ `DOCKER_HOST` 會蓋掉 context，而且只是 warning

`colima start` 結尾會印：

> Warning: DOCKER_HOST environment variable overrides the active context.

**它只是 warning，然後你所有 docker 指令都會連到錯的地方（或連不上）。**
`colima start` 之後一律 `unset DOCKER_HOST`，不要相信 `docker context use colima`
單獨就夠。

---

## 兩個會讓人卡很久的限制

### 1. 只掛載 `$HOME`

`~/.colima/default/colima.yaml` 的 `mounts: []` ＝ 用預設，**只有 `$HOME` 在 VM 內可見**。

- `/private/tmp`、`/tmp`、`/Volumes/*`（外接硬碟）**都看不到**
- 症狀是 `bash: /x/run.sh: No such file or directory` 或掛載點是空目錄——
  **不會有「路徑沒掛載」這種明確錯誤**

→ 要餵進容器的東西先複製到 `$HOME` 底下的暫存目錄（例如 `~/.<task>-tmp`），
**用完刪掉**。scratchpad 在 `/private/tmp`，直接 `-v` 掛過去會安靜地失敗。

驗證方式（別用猜的）：

```bash
docker run --rm -v "$HOME:/h" alpine ls /h | head -3
```

### 2. 架構是 aarch64，`--platform linux/amd64` 走 qemu

Colima 在 Apple Silicon 上是 `aarch64`。要對齊 x86 CI 就得加
`--platform linux/amd64`，代價是模擬：**同一批測試 CI 63 秒、本機 290 秒**。

→ 先問「這個任務在意架構嗎」。只是跑 lint／單元測試就用原生 aarch64。

---

## 決定要不要用容器之前，先問這個

**容器 ≠ CI。** 想「在 Linux 重現 CI」時，`python:3.13-slim` 這類 base image
跟 GitHub 的 `ubuntu-latest` runner差很多——runner 預裝了大量字型與系統函式庫。

判準很簡單：**先用「完全未修改的程式碼」跑一次目標測試。**

- 全綠 → 環境對得上，可以繼續
- 有紅 → **環境不對，此時的任何產出都不可信**

實際踩過（MT-2725，olfparser 的 golden 重生）：未修改的 checkout 在
macOS/arm64 失敗 43–45 / 54、在 `python:3.13-slim` amd64 容器也失敗 43 / 54，
而 `ubuntu-latest` 是 54 / 54 全過。差別就是 runner 預裝的字型。

**但「跑不過就搬到 CI」也是錯的方向。** 全紅之後要先問的是
**這個測試的基準是在哪裡錄的**，而不是去哪裡才會綠：

- 基準是 **CI 錄的** → 推一條暫時的 workflow（`on: push: branches: [<branch>]`）
  產生 artifact，下載回來驗證。姊妹 repo 有 `ci(temp):` 前綴的先例。
- 基準是**某台開發機錄的** → CI 和容器**都**不合格，換環境只是把別人的字型堆疊
  烙進去。這種產出物只能由錄製環境的擁有者更新。

MT-2725 就是踩了第二種：我把 golden 重生推上 `ubuntu-latest`，而
`tests/conftest.py` 明文 `if os.environ.get("CI"): collect_ignore.append(...)`
——那正是規範排除的環境。**先讀 conftest／CI 設定確認那個 suite 在 CI 到底有沒有在跑**，
比找一個會綠的環境重要。

---

## 收尾

```bash
rm -rf ~/.<task>-tmp     # 複製到 $HOME 的暫存副本
colima stop              # 只在確定沒有別的工作在用時
```

`colima stop` 會影響使用者其他正在跑的容器，**不確定就不要停**——留著不花什麼成本。
