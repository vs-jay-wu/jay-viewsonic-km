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

## 適用時機

- 需求範圍大、跨多個 Jira ticket
- 開會後文件與實際實作可能有落差，需要本地端對照修改
- 小型 Jira work item 不需要 clone，不適用此規則
