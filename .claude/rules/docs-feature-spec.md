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

### 想法備案（**不屬於三軸**）

```
docs/ideas/<idea-name>.md
```

`docs/` 的三軸（`features` 需求／`repositories` 單一 repo／`domains` 技術領域）
講的都是**已經存在的東西**。「討論過但決定先不做」不屬於任何一軸，硬塞進去
只會讓那一軸的內容變得不可信（讀的人會以為那是現況）。所以另外放，
而且**刻意不放進 km web 的「文件」頁**（那頁只收 HTML 文件集，見下一節）——
備案是拿來查的，不是拿來瀏覽的。

一份備案至少要寫到這四件事，少了就沒有保存價值：

| 段落 | 為什麼要有 |
|---|---|
| **狀態**（不做／延後，加日期） | 沒有它，半年後讀的人會以為這是待辦事項 |
| **討論出來的結論** | 真正的價值在這裡 —— 當時想通了什麼、數過哪些數字（附實際數值） |
| **為什麼先不做** | 沒有理由的「不做」會被反覆重新提議 |
| **翻案條件** | 寫成**可判定**的觸發條件，不是「等有需要」。這是未來的你唯一真正需要的東西 |

範例：[`docs/ideas/people-role-map.md`](../../docs/ideas/people-role-map.md)
（人員 ↔ 職位／GitHub 帳號對應表，2026-09-14 決定不做）。

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

## HTML 文件集的慣例

`docs/` 底下用 HTML 寫的文件（不是 Confluence clone、不是 md 筆記）照這一套，
km web 的「文件」頁靠它索引（`web/lib/docsRules.ts`，有測試）。

- **一個 feature 資料夾 = 一份文件集**，放在
  `docs/features/<feature>/`（跨產品）或
  `docs/repositories/<org>/<repo>/features/<feature>/`（單一 repo）。
- **入口一律 `index.html`**（2026-09-11 起；在那之前叫 `overview.html`，已全部改名）。
  目錄 URL 會自動解析到它，瀏覽器與 web server 兩邊都成立。
- 每份 HTML 的 `<head>` 要有：

  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="km-doc-kind" content="overview">
  <meta name="km-doc-status" content="active">
  <meta name="km-doc-tickets" content="VSFT-6964,VB-1945">   <!-- 沒有就省略 -->
  <meta name="km-doc-icon" content="slides">                 <!-- 選填，見下 -->
  ```

  | meta | 值 |
  |---|---|
  | `km-doc-kind` | `overview` `goal` `findings` `investigation` `verify` `test` `defects` `report` `handoff` `reference` `open-questions` `superseded` |
  | `km-doc-status` | `active`（預設）／`done`／`superseded` |
  | `km-doc-tickets` | 逗號分隔的票號，**只寫這份文件的主題票**，不要把內文提到的全列進來 |
  | `km-doc-icon` | **選填**。文件清單上的主題示意圖示。不填就用 `km-doc-kind` 的預設圖示，所以**忘了填不會壞**，只是比較通用 |

- `km-doc-icon` 的可用值是**白名單**（寫在 `web/lib/docsRules.ts` 的 `SUBJECT_ICON`）：
  `slides` `font` `package` `window` `pen` `quiz` `license` `code` `repo` `chart`。
  **打錯或寫了清單外的值會退回 kind 的圖示**，不會畫出破掉的東西 —— 要加新的就在那個
  map 加一行，並確認 `web/components/Icon.tsx` 有對應的 path。
- 圖示一律**單色示意**（吃 `currentColor`），不要放品牌彩色縮圖（Office／PDF 那種）：
  它們在深色主題下不會跟著變色，也不會跟 hover／selected 的狀態走。

- **狀態不要只寫在 `<h1>` 的裝飾字裡**（「開發中」「已被取代」）——那是給人看的，
  機器讀不到；`km-doc-status` 才是索引與排序的依據。兩邊要一致。
- `<html lang="zh-Hant">`。
- **樣式與 mermaid 初始化是全 docs 共用的一份**：`docs/assets/style.css`、
  `docs/assets/mermaid-init.js`，各文件用**相對路徑**指過去
  （`../../assets/style.css`、深一點的是 `../../../../../assets/style.css`）。
  用相對路徑而不是 `/docs-view/...` 這種絕對路徑，是為了讓 `file://` 直接
  雙擊打開也成立。**不要再在各 feature 資料夾放副本**——2026-09-14 收斂前有
  8 份 style.css、已經漂移成 2 個版本（4 份 mermaid-init.js 則還一致）。

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
| **「明天要出 X」「下一版會一起處理 Y」** | 排程是**當下的打算**，隔天就可能改，而文件不會跟著改。讀的人會把它當成已定案的計畫去執行 |

### ✅ 改成

- **stash**：記 **stash 訊息**（`git stash list | grep '<訊息關鍵字>'` 才是穩定的找法），
  外加**檔案清單**或檔案數，讓人能自己確認找對了。
- **commit**：記 **SHA**（短 SHA 也行）或 Jira key，不要記相對位置。
- **改動位置**：記「在哪個 repo 的工作區／哪條分支、staged 還是 untracked」這種**可驗證的敘述**，
  並附上驗證指令（如 `git status --porcelain`），而不是叫人直接照著 pop / checkout。
- **排程**：skill／rules 記的是**規則與現況**，不是「接下來要做什麼」。
  該記的是「production 與 rollback 必須一起 distribute」（規則）與
  「目前 production OTA 是 3.10.207、rollback 是 3.12.5，落差未處理」（現況，附量測指令），
  **不是**「明天會把 3.10.208 與 3.12.8 一起放」。排程屬於對話、Jira 單或交付說明。
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
