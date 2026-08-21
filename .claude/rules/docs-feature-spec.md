# 需求文件管理規則

當使用者要把 Confluence 規格文件存到本地端，依照以下方式處理。

## 存放位置

### Repo-bound 功能（單一 repo）

```
docs/repositories/Viewsonic-EDU/<repo-name>/features/<feature-folder-name>/
```

- `<repo-name>` — 對應的 GitHub 專案名稱（如 `ragdoll-cat`）
- `<feature-folder-name>` — 用功能語意命名（英文 kebab-case），不用 Jira ID

### 跨產品功能（多個 repo）

```
docs/features/<feature-folder-name>/
```

- 適用於需求牽涉 ≥2 個 repo，或牽涉跨產品團隊（如 mvbf + cs + mvb backend）
- `<feature-folder-name>` 同樣用功能語意命名

## 資料夾結構

```
<feature-folder-name>/
├── README.md             ← 索引（必要時建立）
├── investigation.md      ← 調查問題清單（跨產品功能必備）
├── findings.md           ← 調查結果（跨產品功能必備）
├── open-questions.md     ← 需要他人決策的疑問（依需要建立）
└── confluence/           ← Confluence 頁面本機快照（依 space 分組，一頁一檔）
    ├── <space-key>/                 ← 用 Confluence space key 當資料夾名
    │   ├── <page-title-kebab>.md
    │   └── ...
    └── <another-space-key>/
        └── ...
```

## Confluence Clone 規則

**一個 Confluence 頁面對應一個 md 檔**，依 **space** 分子資料夾、全部放在 `confluence/` 下。

- **資料夾名用 Confluence space key**（不是 space display name），key 是最穩定的識別。
  例如 space key `myViewboar`、`VCAET`（即使 display name 為「myViewboard」「VSX ClassSwift Amplitude Event Tracking」也用 key）
- **檔名用頁面標題的 kebab-case**（如 `app-launch-and-login.md`、`user-properties.md`）
- 不要把多頁合併進同一檔
- 跨 space 互相連結用相對路徑（如 `../VCAET/user-properties.md`）
- 每個 clone 開頭加 `SOURCE TRACKING` HTML 註解 + 表格，記錄：
  - `page_id`
  - `url`
  - `space`
  - `cloned_version`
  - `cloned_at`（ISO 8601 日期）

### SOURCE TRACKING 範本

```markdown
<!--
==============================================================
SOURCE TRACKING — 更新 Confluence 後請同步更新此區塊與內文
==============================================================

page_id:        <id>
url:            <full url>
space:          <space key>
cloned_version: <N>
cloned_at:      YYYY-MM-DD

Maintenance rule: 每次重新 clone 時，先 commit「同步前差異」說明，再覆寫此檔；
                  版號跟 cloned_at 要同步更新，commit 訊息附 Confluence URL。
==============================================================
-->

> | 來源頁面 | page_id | clone 版本 | clone 日期 |
> |---|---|---|---|
> | [頁面標題](<url>) | <id> | v<N> | YYYY-MM-DD |
```

## Commit 訊息

包含 Confluence URL 與版本（頁面標題 + 版本號）：

```
📝 docs: clone <頁面標題> 規格（Confluence v<N>, YYYY-MM-DD）
來源：<confluence page url>
```

同步更新時：

```
📝 docs: 同步 <頁面標題>（Confluence v<舊> → v<新>, YYYY-MM-DD）
來源：<confluence page url>
```

## 後續維護

- `confluence/*.md` 視為 Confluence 鏡像，**不直接改內容**（除非要記錄「本機補充註解」，且 commit 訊息需註明）
- 本機調查結果、與 spec 的差異討論寫到 `findings.md` 或 `open-questions.md`，不要寫進 `confluence/*.md`
- 透過 git history 追蹤「原始規格 → 實際開發差異」
- Confluence 有更新時，先 `git diff` 看本機是否有未上游的補充註解（若有，先 commit 本機改動），再重新 clone 並更新 `cloned_version` / `cloned_at`

## 不要記「會漂移的指標」

文件會活得比它描述的狀態久。凡是**指標會靜默指向別的東西**的寫法都不要用——
壞掉時沒有任何錯誤訊息，讀的人會照著做然後拿到錯誤的東西。

### ❌ 禁止

| 寫法 | 為什麼危險 |
|---|---|
| `stash@{0}`、`stash@{2}` | 索引是**相對的**：每存一筆新 stash 全部往後推，pop 一筆全部往前移。同一個編號幾天後是完全不同的改動 |
| `HEAD~3`、「上一個 commit」 | 一旦有新 commit 就位移 |
| 「改動目前在 stash / 在 X 分支」 | 狀態會變，而文件不會跟著變 |
| 裸的 `檔案:行號` | 行號會位移，而且**看不出已經位移** |

### ✅ 改成

- **stash**：記 **stash 訊息**（`git stash list | grep '<訊息關鍵字>'` 才是穩定的找法），
  外加**檔案清單**或檔案數，讓人能自己確認找對了。
- **commit**：記 **SHA**（短 SHA 也行）或 Jira key，不要記相對位置。
- **改動位置**：記「在哪個 repo 的工作區／哪條分支、staged 還是 untracked」這種**可驗證的敘述**，
  並附上驗證指令（如 `git status --porcelain`），而不是叫人直接照著 pop / checkout。
- **`檔案:行號`**：km 引用專案 repo 的行號是允許的（見
  [`cross-repo-workflow.md`](cross-repo-workflow.md) §1），但要**同時貼上那一行的內容**。
  行號位移時，讀的人一比對就知道要重新搜尋——指標壞了會被發現，這才是重點。

### 由來

`manager-mvb-instance-id-provider/README.md` 寫過「改動已 `git stash`，`stash@{0}`…，
需 `git checkout stash@{0} -- lib/debug_credentials.dart`」。隔天那批改動已 pop 回工作區，
而 `stash@{0}` 變成另一筆完全無關的 `build.gradle signingConfig fix`。
照原指引執行會取回錯誤的檔案，而且**不會有任何錯誤訊息**。

---

## 適用時機

- 需求範圍大、跨多個 Jira ticket
- 開會後文件與實際實作可能有落差，需要本地端對照修改
- 小型 Jira work item 不需要 clone，不適用此規則
