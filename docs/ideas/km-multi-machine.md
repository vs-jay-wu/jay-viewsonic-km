# 多台電腦共用一份 km：hub / satellite

**狀態：已定案（2026-09-30 與 Jay 討論後），分階段實作中。**

> ⚠️ 這份放在 `docs/ideas/` 但**不是「決定不做」的備案**，所以沒有照
> `docs-feature-spec.md` 的四段格式走。它是**設計定案 ＋ 為什麼這樣設計**，
> 實作進度看 git history，不要在這裡維護一份會過期的 checklist。

---

## 1. 要解決什麼

Jay 只有筆電，而且開始需要第二台：

- **AI 佔用機器**：讓 AI 開發／測試 Mac app 時，它驅動螢幕、鍵盤、滑鼠，
  那段期間**人沒有輸入管道**（手機打字不算）。要繼續工作就得有第二台。
- **負載分擔**：兩台的 CPU 與 RAM 總和可以扛更重的事。
- **平行處理不同平台的單**：Android 一張、Mac 一張，互不干擾。

但 km 現在是單機設計，直覺的「跑兩個 km」會產生：巡邏兩遍（打兩次 GitHub／Jira API）、
每個 repo clone 兩份、兩邊狀態各自漂移。

---

## 2. 核心切分：km 的資料有兩類，答案相反

**這是整份設計的地基。** 先分清楚再看後面每一個決定。

| 類別 | 例子 | 性質 | 結論 |
|---|---|---|---|
| **可遠端取得** | PR、Jira 單、VB Bug、repo 清單、docs | 從哪台抓都一樣 | **只該有一份，一個人去抓** |
| **綁在那台機器** | `/changes` 的未提交改動、`/repo/code` 的工作區、`/sessions` 的對話紀錄、worktree | 描述的是那台的磁碟 | **每台各自產生，不可能遠端取得** |

第二類是「單純讓 B 連到 A 的網頁」這個做法**會安靜壞掉**的地方：
`/changes`、`/repo/code`、`/sessions` 三頁會顯示 A 的東西，而畫面完全正常。

---

## 3. 形狀：同一份程式碼，兩種角色

```
你在 B 前面 → 瀏覽器開 B 的 localhost:9487（satellite）
                ├─ /changes /repo/code /sessions → 讀 B 自己的磁碟
                └─ 其餘全部 → server 端向 hub 取（Tailscale）

hub（A）是唯一的聚合點：
    ├─ 第一類資料自己抓（排程只在這裡跑）
    └─ 要跨機器的東西（例如「所有機器的 session」）→ hub 去問各 satellite
```

兩條規則：

- **不做 satellite ↔ satellite 直連。** 三台就要三對信任關係；全部經 hub 永遠是 N 條。
- **瀏覽器永遠只連自己面前那台**（同源 `localhost:9487`），所以跨機器交換是
  **server 到 server**，不是瀏覽器跨網域。這讓驗證簡單很多（見 §8）。

### satellite 就是 agent

不必另外寫一隻常駐程式。satellite 本來就是一個 web server，hub 要看 B 的未提交改動時
就去問 B 的 satellite。**加第三台的成本 = 跑起來 ＋ 在 hub 按 approve**，沒有第三件事。
這是這份設計的驗收標準。

---

## 4. 現況量測（2026-09-30，實測）

設計建立在這些事實上，翻案前先重新量一次。

| 量到的 | 指令 | 結果 |
|---|---|---|
| 主機是筆電 | `system_profiler SPHardwareDataType` | `MacBook Pro` / `Mac16,8` |
| km 怎麼跑的 | `ps -Ao command \| grep next` | `next dev --hostname 127.0.0.1 --port 9487`（dev 模式、只聽 loopback） |
| 沒裝常駐 | `ls ~/Library/LaunchAgents` | **沒有** km 的 plist —— 重開機不會自己回來（`scripts/setup-km-web.sh` 有 `--install`，只是沒跑過） |
| 睡眠設定 | `pmset -g` | `sleep 0`（不閒置睡眠）、`womp 0`（Wake-on-LAN 關） |
| 同步腳本抓多少 | 讀 `scripts/sync-org-repos.sh` | 清單來自 `gh repo list "$ORG" --limit 1000`（**整個 org**），沒有 `.git` 的目錄**直接 clone** |
| 狀態檔散落程度 | `grep -rn local-state web/lib scripts` | `data/local-state/` **29 個檔**，三種性質混在一起；web 側全部走 `repoPath("data/local-state/…")`，scripts 側各自組路徑 |
| 設定檔歸屬 | `git check-ignore -v local.workspace.json` | `.gitignore:5` —— **每台各自一份，不進版控** |

**hub 的風險不是「會當」，是「會離開」**：闔蓋睡眠、被帶出門、重開機。前兩個是筆電當 hub
的固有代價（Jay：物理限制，基本上不闔蓋），第三個裝 LaunchAgent 就解決。
`caffeinate` 擋不了闔蓋睡眠，真要擋是 `sudo pmset disablesleep 1`（很霸道，不建議常開）。

---

## 5. 資料歸屬：`data/` 切成三塊

**這是「現在做便宜、以後做很貴」的那一項**，不加任何功能，但之後每個功能都踩在上面。

```
data/hub/       ← 只有 hub 寫。換 hub = 搬這個目錄，完。
data/machine/   ← 每台自己的，不同步、不搬遷
data/cache/     ← satellite 快取的 hub 資料，可丟棄，隨時能重抓
```

現有 29 個檔的歸屬（**依檔名與 writer 判斷，實作時逐檔確認**）：

| 去處 | 檔案 |
|---|---|
| `hub/` | `my-prs.json`、`my-prs-events.json`、`my-prs-config.json`、`my-tickets.json`、`vb-bugs.json`、`vb-bugs-config.json`、`pr-inbox-handled.json`、`pr-inbox-watch.json`、`health.json`、`engine-health.json`、`repo-first-commit.json`、`repo-moves.jsonl`、`work-index.json`、`work-lines.json`、`jira-upload/`、`repo-sync-config.json`、**pins 全部**（`changes-pinned` `git-pinned` `docs-pins` `session-pins` `ticket-pins`）、`note.json` |
| `machine/` | `changes-snapshot.json`、`build-dirs.json`、`orca-presence.json`、`orca-sessions.json`、`session-meta-cache.json`、`repo-sync.json`、**`ui-settings.json`** |
| `cache/` | （新的）satellite 快取的 PR／單／bug 等，含各自的取得時間戳 |

**判準與由來**：

- **pins 與 note 歸 hub**（Jay 2026-09-30 拍板）：在 A 上 pin 的東西，在 B 上要看得到。
- **`ui-settings.json` 留 machine**（同上）：深淺色主題這類視覺設定跟著螢幕環境走，
  在 B 上調不該改到 A。
- **`repo-sync` 設定與結果要分開**：設定（哪些 org）共用 → hub；結果（這台抓了什麼）
  → machine。同一個功能的兩半歸屬不同，這就是為什麼不能整個目錄一起搬。
- `data/teams.db` 與 `data/repos-overview.json` **是進版控的**，靠 git 同步，不在搬遷範圍。

### 寫入守衛

對 `data/hub/` 的任何寫入先斷言 `role === "hub"`，不是就丟例外。
**這讓「B 不得主動更新 hub 資料」變成程式擋得住的事，而不是要記住的規則。**

---

## 6. repo 的身分要脫離絕對路徑

現在 km 幾乎全部拿**絕對路徑**當 repo 識別：`/repo/code?dir=/Users/…`、
`/code-view/<base64 絕對路徑>/…`、local-state 的 key、session cwd 對應、worktree 掃描。

跨機器之後這會產生**最難發現的壞法**：

> A 上複製的 km 連結貼到 B → 路徑在 B 上也合法（兩台短名都是 `jay.wj.wu`）→
> 頁面正常打開 → 但顯示的是 B 的磁碟。**沒有任何錯誤訊息。**

改成：

```
repo id:        Viewsonic-EDU/ragdoll-cat            ← 全網通用，進 URL、state、關聯
workspaceRoot:  /Users/jay.wj.wu/ProjectsWork_GitHub ← 每台自己的設定
externalPath:   /Volumes/…                           ← offloaded，本來就 per-machine
```

**路徑結構兩台要一樣**（`<root>/Orgs/<org>/<repo>`），這樣一個 `workspaceRoot` 就夠。
絕對路徑相同與否不重要 —— **但程式不可以依賴它相同**，否則換機器／換短名時就是上面
那種無聲錯位。

---

## 7. sync 策略跟著 role 走

現況（實測）：`sync-org-repos.sh` 的清單是整個 org，缺的直接 clone。
**原封不動放到 B 上跑 = 把整個 org 抓下來**，正是要避免的。

| 角色 | 策略 | 行為 |
|---|---|---|
| hub | `clone-missing`（現狀） | org 有新 repo 就抓下來 |
| satellite | `existing-only` | **只對已有 `.git` 的目錄** fetch / ff-merge，缺的一律跳過 |

B 上要多一個 repo 是**明確動作**（清單上按「在這台 clone」），不會被排程長出來。

免費拿到的東西：**`/repo/code` 的「看得到但不能點」清單 = hub 的 org 清單 − 本機實際有的**，
不需要另外維護狀態。灰字要分兩種原因（「只在 書房 Mac 上」vs「offloaded 到外接碟」），
不然會重演「看到灰的但不知道為什麼」。

### `local.workspace.json` 的欄位也要分

| 欄位 | 歸屬 | 理由 |
|---|---|---|
| `excluded` | **共用** | keystore 保護，每台都必須生效 |
| `localPath` | machine | 這就是 `workspaceRoot` |
| `externalPath` | machine | 外接碟路徑 |
| `offloaded` | machine | 哪些搬到外接，本來就各機器不同 |

⚠️ **`excluded` 不可以依賴「連得到 hub」才生效。** 本機留一份「最後已知」，而且
**空清單一律當成讀取失敗並停下來**，不是當成「沒有排除項」。fail-closed —— 否則 B 離線
同步時 keystore 的保護就沒了。

---

## 8. 角色：明確設定，絕不自動

```jsonc
// local.workspace.json（每台各自一份，不進版控）
"km": {
  "role": "hub",                    // 或 "satellite"
  "hubUrl": "http://mac-hub:9487",  // satellite 才需要
  "machine": { "id": "<一次性 uuid>", "name": "書房 Mac" }
}
```

- **沒有自動偵測、沒有自動轉換**（Jay 2026-09-30）。連「連得到 hub 就自己當 satellite」
  這種聰明作法也撤掉 —— **身分自動變動會連帶資料同步方向自動變動**，那是預期外行為
  最貴的一種。角色沒設就開不起來並明講，不要猜。
- 切換要一行指令：`setup-km-web.sh --role satellite --hub …` 改設定並重啟。
- **啟動時印出角色，UI 側邊欄常駐顯示機器名 ＋ 角色。**
- `machine.id` 是一次性產生的 uuid，**不要拿 hostname 當 id**（macOS 的 hostname 會被
  網路環境改掉）。`machine.name` 是給人看的標籤，隨時可改。

---

## 9. 安全：這是前提，不是附加項

**km 會開 Claude session、會跑腳本、能讀整個 workspace。被打穿 = 有人以 Jay 的身分
在他的機器上執行任意指令。** 目前它安全只有一個理由：只聽 `127.0.0.1`。

### 傳輸：Tailscale，而且綁介面不綁 `0.0.0.0`

WireGuard 加密、裝置層級認證本來就有、離家也能用、給穩定名字不必追 DHCP。
bind 到 **Tailscale 那張介面的 IP（`100.x.y.z`）**，不要 `0.0.0.0` ——
差別在接到咖啡廳 Wi-Fi 時前者完全不暴露。（`setup-km-web.sh` 的註解本來就寫了
「0.0.0.0 不建議」。）

#### ⚠️ 註冊帳號與授權：兩件要先想清楚的事（2026-09-30 Jay 問）

**① 不要用公司帳號登入。** Jay 的信箱是 `@viewsonic.com`。若公司已經有以那個網域
建立的 tailnet，用它登入會**把你的機器併進公司的 tailnet** —— 裝置清單、ACL、
稽核紀錄都在 IT 手上。用個人的 Google／GitHub 帳號另開一個自己的 tailnet。

**② 授權：官方怎麼寫的（2026-09-30 實查，附出處）。**

| 出處 | 原文（重點） |
|---|---|
| [定價頁](https://tailscale.com/pricing) | Personal 方案「**only suitable for non-commercial use**」、「for individuals who want to use Tailscale **at home**」、「perfect for things like building a homelab or home VPN」 |
| 定價頁／[Free plans and discounts](https://tailscale.com/docs/account/manage-plans/free-plans-discounts) | **用什麼網域註冊決定分類**：公開網域（Gmail、Apple、個人 GitHub）→ 視為 personal use，自動進免費 Personal；**自訂網域 → 視為 business use**，自動進試用 |
| [ToS §2.1](https://tailscale.com/terms) | 授權範圍是「solely for your own **personal use or internal business purposes**」—— 注意它**沒有**把免費方案限定成非商業 |
| ToS §2.3 | 禁止「**commercially exploit** any part of the Services」（＝轉售／拿它牟利，不是「工作時用到」） |
| ToS §1 | 「If you are purchasing or using the Services **on behalf of your company or using a company domain**, all references to "you" reference such company.」 |

**所以灰在哪裡**：有約束力的 ToS 並沒有寫「免費方案不得用於工作」，它寫的是
personal use **或** internal business purposes；把 Personal 講成 non-commercial 的是
**定價頁的行銷文案**。而 Tailscale 實際用來分類的機制是**註冊網域**，不是你拿它做什麼。

對照到這裡的情境：

- ✅ **不是** 「commercially exploit」—— 那指轉售或靠它牟利。
- ✅ **不是** 「using a company domain」—— 只要用個人 Gmail／GitHub 註冊。
- ⚠️ **「on behalf of your company」可以吵**：連的是公司配的筆電、做的是工作 ——
  但這是為了自己方便，不是公司要求或公司部署。
- ⚠️ 定價頁的 **at home / homelab** 措辭並沒有祝福「工作用途」。

**結論**：兩台機器、不轉售、用個人網域註冊，落在「Tailscale 自己的機制會判成
personal」那一邊；真正被引用來說你不該這樣用的，只會是定價頁那句行銷文案。
風險低但不是零。

**另一個獨立的風險（跟授權無關）**：在公司配的電腦上裝第三方 VPN 類軟體、把公司
機器接進個人 tailnet，可能牴觸公司 IT 政策 —— 那跟 Tailscale 收不收錢是兩回事。

三條路：

| 做法 | 費用 | 風險 |
|---|---|---|
| 個人網域註冊 ＋ Personal | 免費 | 定價頁的 non-commercial 文案；公司 IT 政策 |
| **SSH port forward**（`ssh -L 9487:localhost:9487 <hub>`） | 免費 | **沒有第三方、沒有授權問題**；要開 Remote Login、IP 變了要重接、離開家不方便 |
| Standard（US$8／人／月） | 付費 | 沒有授權疑慮；仍受公司 IT 政策管 |

> ⚠️ **不要用公司信箱註冊**：自訂網域會被直接判成 business use；而且若公司已有
> tailnet，你的機器會被併進去（裝置清單、ACL、稽核都在 IT 手上）。

**做決定之前，km 這邊不受影響**：`proxy.ts` 的三道檢查、裝置 token、
`--tailscale` 綁定都跟用哪條通道無關 —— 它們防的是「有人打得到這個 port」，
不是「通道是誰提供的」。SSH 那條甚至更單純：對 km 而言那就是 loopback。

### 驗證：配對 → 裝置 token，沒有會員系統

| 通道 | 驗證 |
|---|---|
| 瀏覽器 → 自己機器的 km | **維持現狀不用驗**（還是 localhost） |
| km ↔ km | 裝置 token（配對時在 hub 上按 approve） |
| 手機／其他瀏覽器 → hub | cookie 配對流程（**後期**，見 §12） |

配對流程：B 第一次連 → 顯示 6 碼 ＋ 送上 hostname／機器碼 → 你在 hub 上看到那些資訊
確認是哪一台 → approve → hub 產 32 bytes 隨機 token。撤銷 = 刪一行。

⚠️ **MAC 位址／機器碼當標籤可以，當鑰匙不行。** 它不是秘密（同網段誰都改得掉），
而且 MAC 在 link layer，HTTP 根本看不到（只能翻自己的 ARP 表，跨網段就沒有了）；
機器碼是客戶端自己報的字串。它們唯一該扮演的角色是**approve 時顯示給你確認**。

### 預設值：非 loopback 一律要 token

手機現在是**進不去**，不是「沒擋」。「先不管」的失敗模式必須是不方便，不是敞開。

### 兩個現在不痛、開出去就會痛的洞

- **km 的 API 不檢查 `Origin`**（當初 HTML 預覽選 `connect-src 'none'` 就是因為這個）。
  一旦不再 localhost-only，任何網站都能在瀏覽器裡對它發 POST。
- **DNS rebinding**：惡意網站把自己的域名解析到內網 IP 來打 9487。Host header 白名單
  同時擋掉這條。

**這兩條要跟「開始對外聽」同一批做，不能排到後面。**

---

## 10. hub 不在的時候

三條規則：

1. **常駐警告列**：「書房 Mac 未連線 · 顯示的是 10:42 的快取」。灰底提示不是紅色錯誤 ——
   這是可預期狀態，不是故障。
2. **每一塊快取資料旁邊都要有時間戳。** 沒有時間戳的舊資料**比沒有資料危險**：
   你會照著昨天的 PR 狀態做決定而不自知。
3. **需要 hub 的動作用「禁用 ＋ 說明原因」，不要隱藏。** 隱藏會讓人以為功能壞了。

B 本機的 `/changes`、`/repo/code`、`/sessions` 完全不受影響。
**B 在沒有 hub 時不得自己去抓 GitHub／Jira**（Jay 2026-09-30）—— 那會把最想避免的
「兩邊各巡一遍」從設計上請回來。

`/changes` 已經有「SWR ＋ 磁碟快照」那套（`scanChangesCached`），離線快取照抄它。

---

## 11. 只在 satellite 上「跑」km，不在上面「開發」km

**非 hub 身分的機器不得開發 km**（Jay 2026-09-30）。寫三個地方，讀者不同：

1. `.claude/rules/km-multi-machine.md` ＋ 根 `CLAUDE.md` 規則表加一列 —— 給 agent。
2. `web/AGENTS.md` 工程慣例區 —— 給在 `web/` 底下工作的人。
3. **UI 上的角色徽章** —— 規則要被讀到才有用，畫面一定會被看到。

**自我執行機制（免費）**：satellite 的自動更新條件是「工作區乾淨 ＋ `--ff-only`」，
所以有人在 B 上動了 km，自動更新就會停下來並在首頁報「工作區不乾淨，無法更新」。
那就是違規的徵兆，不必另外做偵測。

### 版本落後：各自比 `origin/master`，不是互比

hub 自己也可能落後，所以比較基準是**每台各自與 `origin/master`**（Jay 的提法，比互比簡單，
而且三台四台都一樣）。首頁警告區塊顯示「**書房 Mac** 落後 3 個 commit」。

⚠️ **`git pull` ≠ 生效。** dev 模式的 HMR 覆蓋不到這些：

- `instrumentation.ts` 的 `register()`（排程都掛在那裡）
- `next.config.ts`
- `package.json` 的相依（要 `npm ci`）
- 新的巢狀 API route（Turbopack 會 404 到 `touch` 為止，見 `web/AGENTS.md`）

自動 pull 的結果會是「原始碼一致、行為不一致」，**比版本不一致更難查** ——
畫面上所有線索都說你已經更新了。所以：

| 角色 | 更新方式 |
|---|---|
| hub | **偵測自動、套用手動**：一顆「更新並重啟」（`git pull --ff-only` → lockfile 變了才 `npm ci` → `setup-km-web.sh --restart`） |
| satellite | 自動（工作區乾淨 ＋ ff-only 成立時），因為不在上面開發 |

hub 絕不自動的另一個理由：**km 就是開發 km 的地方**，工作區不乾淨是常態
（討論當下 `git status` 就有 5 個檔是別的 session 的改動，而規則明寫那些不能動）。

---

## 12. 階段

```
階段 0  ① repo 身分改 org/repo + workspaceRoot
        ② data/ 切成 hub / machine / cache（含 29 個檔逐一歸屬）
        ③ 角色設定 + 對 data/hub/ 的寫入守衛
        ④ Tailscale + 綁 tailscale 介面 + Origin/Host 檢查 + km↔km token
        ⑤ hub 安裝 LaunchAgent（重開機會自己回來）
階段 1  satellite 角色：排程關閉、三個 local 頁讀自己的、其餘向 hub 取
        + 離線快取、時間戳、警告列
階段 2  hub 聚合：跨機器 session 索引、機器命名 UI、/repo/code 的「只在 X 上」
        跨機器開 session（含即時詢問目標機器有沒有那個 repo）
階段 3  版本落後偵測；satellite 自動更新、hub 一鍵更新
後期    對執行中 session 送 prompt；手機／iPad 的 cookie 配對
```

### 跨機器開 session 的機制（階段 2）

km 現在開 session 是 `claude -p "/rename <標題>" --session-id <uuid>` 再用 Orca resume。
**`--session-id` 是呼叫端自己產的 uuid**，所以：

1. 在 B 的畫面上按「開 session」→ 選機器（預設「這一台」）
2. 選 A → B 產 uuid 與標題 → 經 hub 轉給 A → A 本機執行那兩步
3. 回報「已在 **書房 Mac** 開啟」，uuid 記進索引

uuid 共用，所以 A 的 satellite 之後回報 session 清單時，hub 一比對就串起來 ——
**不必靠猜，也不會少連 ticket。**

⚠️ 按下去之前要**即時問目標機器有沒有那個 repo**（不儲存，問一次就好，
免得狀態要維護又會過期），沒有就明講「A 上沒有這個 repo，要先 clone 嗎」。

---

## 13. 刻意不做的

| 不做 | 為什麼 |
|---|---|
| 「機器佔用中」的宣告與鎖 | 原本以為痛點是螢幕被佔用，實際上 Jay 是**換一台繼續工作**，不需要協調誰在用哪台（2026-09-30 討論後移除） |
| 同一個 repo 在兩台同時改的防護 | git 本來就是為這件事設計的（pull／push／解衝突），而且 Jay 自己知道哪張單在哪台上 |
| satellite ↔ satellite 直連 | N² 的信任關係，全部經 hub 就是 N 條 |
| 自動角色切換 | 見 §8 |
| 把 gitignored 的狀態併成一個 SQLite | 2026-09-30 討論過，Jay：「效益不大」。§5 的三塊切分是**目錄層級**的整理，不是換儲存引擎 |

---

## 14. 什麼情況要回來重看這份

- **hub 換機器**（買桌機、換筆電）→ §5 的 `data/hub/` 搬遷路徑要真的走一次，
  走過才知道分類有沒有漏。
- **第三台加入** → 驗收標準是「跑起來 ＋ approve，沒有第三件事」。若出現第三件事，
  表示有東西沒有真正做到 per-machine。
- **開始需要手機／iPad** → §9 第三列（cookie 配對）要補，預設值不要因此放寬。
- **要對執行中的 session 送 prompt** → 那是另一個東西（要接 Claude 的輸入管道，
  不只是啟動器），工程量與這份設計不同量級。
