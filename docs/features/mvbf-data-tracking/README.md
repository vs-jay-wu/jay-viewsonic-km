# MVBF Data Tracking（VSFT-8368）

> 跨產品需求：在 **mvbf** 加入 Amplitude 事件埋點，與既有 **cs (ClassSwift)** 的 tracking 對齊，
> 並評估 **mvbw** 的對應實作。Beta Program 與 App Launch / Login 兩個範疇。

## 來源

- Jira：[VSFT-8368 \[Data\] MVBF data tracking](https://viewsonic-vsi.atlassian.net/browse/VSFT-8368)
- Confluence：
  - [Beta Program](https://viewsonic-vsi.atlassian.net/wiki/spaces/myViewboar/pages/529629261/BetaProgram)（page id `529629261`, v16）
  - [App Launch & Login](https://viewsonic-vsi.atlassian.net/wiki/spaces/myViewboar/pages/525729796/AppLaunch+Login)（page id `525729796`, v17）
  - [User Properties（VSX ClassSwift Amplitude Event Tracking）](https://viewsonic-vsi.atlassian.net/wiki/spaces/VCAET/pages/96043154)（page id `96043154`, v95）— spec 引用的 user properties 定義來源

## 為什麼放在 `docs/features/` 而不是 `docs/repositories/<repo>/`

依 `.claude/rules/docs-feature-spec.md`，repo-bound 的功能需求放在 `docs/repositories/<org>/<repo>/features/`。
這份需求**跨多個 repo**：

- mvbf 端要實作（埋點）
- cs 端是參照來源（user properties / event 命名規範既有實作）
- mvb 後端決定哪些 user property 必須由 server 提供
- mvbw 端可能需要對齊（題目敘述 Beta Program / App Launched 都標註 Windows + Android）

放在 `repositories/edu-droid-flutter/features/` 容易誤導讀者以為只在 mvbf 範疇內。
因此另開 `docs/features/` 容納跨產品需求。

## 目錄結構

```
mvbf-data-tracking/
├── README.md                    ← 本檔（索引）
├── user-properties-sources.md   ← mvbf 端 user property 逐欄位來源／現況／落差表
├── open-questions.md            ← 需要他人決策的疑問（VSFT-8368 範圍內）
├── out-of-scope-suggestions.md  ← 不屬於 VSFT-8368 的後續建議（給其他 team 參考）
├── investigation/               ← 調查記錄
│   ├── investigation.md           ← 調查前的問題清單與 repo 對應
│   ├── findings.md                ← 調查結果（跨 repo 現況、結論、技術限制）
│   └── role-investigation.md      ← role user property 的詳細調查
└── confluence/                  ← Confluence 頁面本機快照（依 space 分組，一頁一檔）
    ├── myViewboar/                  ← Confluence space key
    │   ├── beta-program.md
    │   └── app-launch-and-login.md
    └── VCAET/                       ← VSX ClassSwift Amplitude Event Tracking
        └── user-properties.md
```

## 文件

| 檔案 | 用途 | 性質 |
|------|------|------|
| [`confluence/myViewboar/beta-program.md`](confluence/myViewboar/beta-program.md) | clone 自 Confluence「Beta Program」(v16) | 📥 Confluence clone |
| [`confluence/myViewboar/app-launch-and-login.md`](confluence/myViewboar/app-launch-and-login.md) | clone 自 Confluence「App Launch & Login」(v17) | 📥 Confluence clone |
| [`confluence/VCAET/user-properties.md`](confluence/VCAET/user-properties.md) | clone 自 cs Amplitude「User Properties」(v95) | 📥 Confluence clone |
| [`investigation/investigation.md`](investigation/investigation.md) | 開始調查前列的問題清單、產品/repo 對應、調查順序 | 📝 本機文件 |
| [`investigation/findings.md`](investigation/findings.md) | **調查結果**：每個 repo 的現況、跨產品結論、技術限制 | 📝 本機文件 |
| [`user-properties-sources.md`](user-properties-sources.md) | mvbf 端 user property 逐欄位來源／現況／落差表 | 📝 本機文件 |
| [`investigation/role-investigation.md`](investigation/role-investigation.md) | `role` user property 的詳細調查（mvb / cs 多套定義、Amplitude 實測誰在送、`gp:` 前綴真相） | 📝 本機文件 |
| [`open-questions.md`](open-questions.md) | 需要他人決策的疑問（Zoe / 跨團隊），含背景、選項、影響、AI 建議。**VSFT-8368 範圍內** | 📝 本機文件 |
| [`out-of-scope-suggestions.md`](out-of-scope-suggestions.md) | 調查過程發現的、**不屬於 VSFT-8368** 的後續建議（給其他 team 參考） | 📝 本機文件 |

## 當前狀態

**mvbf 端基礎實作已完成**（user property 注入、Beta event 補 `email`、App Ended 拔 `end reason` + flush、
device EDID 等）。VSFT-8368 的最終形態仍待 `open-questions.md` 中的決策題定案
（Q1 login method enum、Q5 App Ended 是否保留、Q10 role 對齊、Q12 plan 詞彙等）—— 屆時可能再調整。

## 閱讀順序

1. **`user-properties-sources.md`** — mvbf 端各欄位來源／實作狀態，工作主參考
2. **`investigation/findings.md`** — 跨 repo 調查結論
3. **`open-questions.md`** — 看尚待決策的疑問
4. **`investigation/role-investigation.md`** — role 欄位的深度調查（cs/mvb 多套定義對照）
5. **`confluence/*.md`** — 需要查原始需求或 user property 定義時翻查
6. **`investigation/investigation.md`** — 想了解最初的調查思路與 repo 對應

## Confluence Clone 維護紀律

`confluence/` 目錄下每個檔案都是 Confluence 內容的本機快照，**一個 Confluence 頁面對應一個
md 檔**。為了讓未來的更新可追蹤：

1. **檔名用頁面標題的 kebab-case**（如 `app-launch-and-login.md`），不要混合多頁
2. **每份 clone 的開頭都有 `SOURCE TRACKING` HTML 註解區塊**，記錄 `page_id` / `url` / `space` / `cloned_version` / `cloned_at`。重新 clone 時這幾項要同步更新
3. **Commit 訊息附 Confluence URL**，依專案規則格式（見 `.claude/rules/docs-feature-spec.md`）：
   ```
   📝 docs: 同步 <頁面標題> 規格（Confluence v<N>, YYYY-MM-DD）
   來源：<confluence page url>
   ```
4. **不要直接覆寫**：先看 `git diff` 確認本機是否有未上 Confluence 的補充註解；若有，先 commit 本機改動再重新 clone
