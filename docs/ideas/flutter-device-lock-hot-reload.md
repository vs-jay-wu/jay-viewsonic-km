# 備案：不靠 MCP 的 hot reload ＋ 裝置佔用鎖

**狀態：延後（2026-09-14 討論、查證完，決定有空再做），設計已經定案。**
這不是「不做」——是「值得做，但現在還沒排進去」。要動手時從下面的「最小可用版」開始。

## 想解決的三個實際情境（Jay 2026-09-14 原話）

1. 「我請 ai run flutter app，請他幫我做 hot reload，**常常會拒絕我，說什麼 FIFO 問題**」
2. 「如果我關掉 claude session 了，然後重開，這個時候也許 claude **會不知道要連哪個**」
3. 「我有多個 agent 同時對同一台裝置**互搶**」

三件事根因相同：**沒有任何長命的東西握著 `flutter run` 的 stdin。**

---

## 討論出來的東西（這才是這份文件的價值）

### 1. 「FIFO 問題」是真的，不是 AI 推託（實測過）

Claude Code 的 Bash 工具**沒辦法對已經在背景跑的行程寫 stdin**，所以 agent 會改用
具名管線。那條路第一次會成功、之後全部無聲失敗。實測（2026-09-14，zsh／macOS）：
開一個 FIFO 與讀取迴圈，連寫三次 `r`，逐字輸出是

```
讀到: r
== 讀取迴圈結束（收到 EOF）
```

`echo > fifo` 每寫完一次就關閉 → 讀端收到 EOF 就收工 → 第二、三次寫進去沒有人在讀
（而且會卡住）。`flutter run` 的鍵盤指令就是讀 stdin，所以症狀是
**第一次 hot reload 成功、之後靜默無效**。

→ 下次再看到 agent 說「做不到 hot reload」，**不要當成它偷懶**，這條是結構性的。

### 2. hot reload 不需要 MCP，也不需要 DTD —— 官方 daemon 協定就有

`flutter run --machine` 是文件化的 JSON-RPC（stdin/stdout，一行一個訊息，外面包方括號）：

```json
[{"method":"app.restart","id":1,"params":{"appId":"...","fullRestart":false}}]   // hot reload
[{"method":"app.restart","id":2,"params":{"appId":"...","fullRestart":true}}]    // hot restart
```

證據等級：**讀碼＋讀官方文件**（Flutter 3.41.5，`~/fvm/versions/3.41.5/`）

| 出處 | 那一行寫什麼 |
|---|---|
| `packages/flutter_tools/doc/daemon.md:134` | `#### app.restart` — 下面列了 `appId` / `fullRestart` / `reason` / `pause` / `debounce` |
| `packages/flutter_tools/lib/src/commands/daemon.dart:855` | `final bool fullRestart = _getBoolArg(args, 'fullRestart') ?? false;` |

附帶好處：`daemon.dart` 的 `_queueAndDebounceReloadAction` **已經內建「同時只跑一次
reload、短時間內重複請求會合併」**，多 agent 同時戳不會打架。
而且 `--machine` 的回應是結構化的（`{code, message}`），agent 讀得到編譯錯誤，
不是只能盯畫面猜。

**DTD 用不到。** DTD 是 IDE ↔ 工具互相問「現在開哪個專案／哪台裝置」用的，
Flutter MCP server 靠它；hot reload 要的是 daemon 的 stdin。

### 3. ⚠️ 光有 VM Service／DTD URI **不能** hot reload —— 要保存的是「行程」

這條推翻了「把 URI 記下來，下次重連就好」的直覺（Jay 的原始構想是這樣）。

hot reload 的實際流程是：flutter_tools 用**常駐在自己行程裡的增量編譯器**產生
`main.dart.incremental.dill`，上傳到裝置的 DevFS，再呼叫 `reloadSources` 把
`rootLibUri` 指過去。

| 出處 | 那一行寫什麼 |
|---|---|
| `packages/flutter_tools/lib/src/run_hot.dart:1297` | `const entryPath = 'main.dart.incremental.dill';` |
| `packages/flutter_tools/lib/src/run_hot.dart:1378` | `rootLibUri: deviceEntryUri,` |

編譯器的狀態在 `flutter run` 這個行程裡。**行程死了，URI 就是一張廢紙。**
所以能跨 session 的不是「把 URI 寫下來」，而是「行程活著、而且有人握著它的 stdin」。

### 4. 鎖的依據要是「行程活著」，不是「session 有沒有 active」

Jay 原本的構想是用 session id ＋「該 session 有沒有被 active」當回收條件。
**這層是整個設計裡最脆的，建議換掉**：

- 「active」沒有可靠訊號。transcript 檔的 mtime 只是心跳的近似 ——
  agent 在思考、在跑 20 分鐘的 build 時它不會動，會被誤判成閒置然後**機器被搶走，
  而被搶的人不會收到任何錯誤**，只會發現 app 突然變成別人的。最難 debug 的那種失敗。
- 反過來，視窗直接關掉的 session 會永遠佔著。
- 更根本的是：佔用裝置的是 `flutter run` **那個行程**，session 只是誰下的指令。

改成：

| | |
|---|---|
| 行程活著 | 裝置被佔用（ground truth，查 pid 就好，不用心跳、不用 TTL） |
| 行程死掉 | 鎖自動釋放 |
| session id | 照記，但角色是**歸屬**（誰佔的、哪張票），不是回收依據 |
| 同一個 session 再要同一台 | 把既有 `appId` 還給它 —— **不必重 build，這才是真正省到的時間** |
| 閒置回收 | 看**最後一次 reload 的時間**，km web 顯示「已閒置 3 小時」給人一鍵釋放 |

---

## 最小可用版（動手時從這裡開始）

由 **km web 當常駐的持有者**（`instrumentation.ts` 那套排程本來就住在裡面），
`spawn('flutter', ['run','--machine', ...])`，Node 的 `child.stdin` 活到行程結束，
沒有 EOF 問題。

| API | 行為 |
|---|---|
| `GET /api/devices` | `flutter devices --machine` 的結果 ＋ 每台現在被誰佔、閒置多久 |
| `POST /api/devices/<id>/claim` | 被佔用回 **409 ＋ 佔用者資訊**；沒人佔就起 daemon，回 `{appId, vmServiceUri}` |
| `POST /api/devices/<id>/reload` | 轉成 `app.restart`，`{full}` 決定 reload／restart，**如實回傳 `code`/`message`** |
| `POST /api/devices/<id>/release` | 自己放；`?force=1` 踢別人 |

加一個 `flutter-device` skill 告訴 agent：**動任何 flutter app 之前先 claim，
做完 release，被 409 就換一台或問 Jay**；`force` 沒有 Jay 點頭不准用
（那會直接殺掉別人正在跑的 app）。

先支援單一 repo、單一 flavor，驗收標準是「agent 真的能跑完一輪 hot reload 並讀到結果」。

### 已知限制與陷阱（做的時候不要重新發現一次）

- **km web 自己重啟時 daemon 會失聯**：行程可能還活著，但 stdin 的管子斷了，
  只能砍掉重跑。要連 km web 重啟都撐過去，得把 daemon 放進 tmux、用
  `tmux send-keys` 餵 JSON 進去（可行，但回應要從 pty log 撈，髒很多）。
  建議先接受這個限制。啟動時要**對帳**：記錄裡 pid 還活著但連不上的，砍掉並清掉那筆。
- **claim 的 key 是 device + repo + flavor**，不只是 device —— flavor 不同就得重 build。
- 同一台 Android 上同一個 applicationId 只能跑一份；fusion（CS 跑在 mvbf 裡）
  是「一台機兩個 app」，這塊比鎖本身麻煩。
- **hot reload 有些改動吃不到**（改 `main()`、改 const、改 native、往有狀態的 class
  加欄位）。daemon 的 `{code, message}` 要原封不動轉給 agent，
  不然它會以為改生效了而繼續往下推論。

---

## 為什麼先不做

1. 眼前沒有被它擋住 —— 目前的 flutter 工作用 `fvm flutter test` / `analyze`
   走得下去（見 `mvbf` skill），hot reload 是加速，不是解鎖。
2. 真正的工程量不在鎖，在**環境**（flavor、fusion、多 app），那部分要邊做邊試，
   不是一個下午的事。
3. km web 這陣子在動的是「未提交的改動」那條線，插進來會把兩件事都拖長。

## 翻案條件（成立就回來做）

- 同一週內出現 **≥2 次** 多 agent 互搶同一台裝置（症狀：app 突然被換成別人的、
  或 `flutter run` 裝到一半失敗）。
- 或：一天內有 **≥3 次** 因為「agent 做不到 hot reload」而必須自己手動跑
  `flutter run` 的情況。
- 或：Flutter 官方把 hot reload 開成不需要常駐編譯器的介面（那時第 3 節的結論
  要重驗，整份設計可以大幅簡化）。

## 相關

- `CLAUDE.md`「禁止使用 Dart / Flutter MCP」—— 這份提案正是要補上那條留下的缺口
  （原文寫「真的需要 hot reload 的情境先問 Jay，臨時開 MCP」）。
- `docs/domains/app-build-performance/dev-process-memory-reclaim.md` ——
  禁用 MCP 的原因（`dart language-server` 吃 800 MB–1.1 GB 且不隨 session 結束）。
- `.claude/skills/mvbf/SKILL.md` —— 目前的 CLI 做法。
