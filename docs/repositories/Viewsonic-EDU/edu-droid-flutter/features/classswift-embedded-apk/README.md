# ClassSwift 內嵌 APK 取代 OTA 下載（VSFT-9785）

MVB 不再從 OTA server 下載 ClassSwift（讀 `version.json` → 下載 ~15 MB → 安裝）。
ClassSwift apk 改由 CI 在 build 時內嵌進 MVB assets，啟動後比對版號、背景靜默安裝，全程不需網路。

> 接手 Stephen Yang 的進度繼續研究（2026-07-31）。

## 北極星目標（Jay，手段開放）

**老師想用 Quiz Tool 時就能馬上用** —— 不經歷下載 / 更新 / 檢查 / 安裝，不讓使用者做「要不要安裝」的抉擇。

> **決策更新（2026-07-31）**：原前提「CS 一定要處於最新版」已移除 —— **不要求最新版**（永久決策）、
> 目前**無最小版本限制**（暫時現狀，未來可能設計，見 Q10），上層拍板**版本相容由後端負責**。
> 原本最大的差距（CS 版本綁在 MVB release / OTA 節奏）因此解除。

PR #208 解掉「首次可用性」；剩餘差距是三條使用者抉擇路徑（F4/F5/F6）、region gate 離線缺口與開機競態窗口
—— 完整分析見 [goal.html](goal.html)。

## Jira / PR

| 來源 | 摘要 | 狀態（2026-07-31） |
|---|---|---|
| [VSFT-9785](https://viewsonic-vsi.atlassian.net/browse/VSFT-9785) | [ClassSwift] MVB 內嵌 ClassSwift APK，停止從 OTA server 下載 | KICK-OFF · Assignee: Stephen Yang |
| [edu-droid-flutter#208](https://github.com/Viewsonic-EDU/edu-droid-flutter/pull/208) | 主 PR，branch `stephen/VSFT-9785-classswift-embedded-apk`，7 commits | OPEN |
| [ragdoll-cat#1089](https://github.com/Viewsonic-EDU/ragdoll-cat/pull/1089) | D6：移除 MDM（MVB_QuizTool）派送 | 建議 #208 上線後再合 |

**衝突注意**：[#205](https://github.com/Viewsonic-EDU/edu-droid-flutter/pull/205)（`Jay/VSFT-9597-cs-token-redelivery`）同樣動到 ClassSwift 區域，合併順序需留意。

## 合併前必辦（摘要）

1. **GH_PAT 權限驗證**：`ClassSwift Version Bump` workflow 跑 `DRY_RUN: true`，確認讀得到 ragdoll-cat releases —— 權限不足會讓**所有 Android build 在 embed 步驟失敗**
2. Amplitude tracking plan 建立 `ClassSwift Install Failed` 事件定義
3. 與 #205 確認合併順序

## 文件索引

| 檔案 | 內容 |
|---|---|
| [overview.html](overview.html) | 總覽：原始文件、build / 執行期架構圖、release target 對應、決議 D1–D9、review 修正摘要、交接待辦 |
| [goal.html](goal.html) | 北極星目標與現況差距：目標 vs PR #208 對照、4 個 gap（新鮮度耦合、使用者抉擇殘留、region gate、競態窗口） |
| [findings.html](findings.html) | **融合 POC findings（2026-07-31）**：CS 以 wrapper module 編進 MVB 成功、零改 CS 檔案；坑 P1–P5、待驗證 R1–R9 |
| [investigation.html](investigation.html) | 接手調查清單：合併前後待辦與研究向問題（Q1–Q8） |
| [jira/VSFT-9785.md](jira/VSFT-9785.md) | Jira 票面 clone（v1, 2026-07-31，含 Stephen 的決議 comment） |
| [repo-docs/classswift-embedded-apk.md](repo-docs/classswift-embedded-apk.md) | PR 內設計文件 clone（執行期流程、APK 位置、CI/CD、本地開發） |
| [repo-docs/classswift-embedded-apk-review.md](repo-docs/classswift-embedded-apk-review.md) | PR 內決議與風險分析 clone（D1–D9、B1–B17、F1–F10、E1–E20、R1–R13） |

`repo-docs/` 為 PR branch（commit `1846950`）上 `docs/` 的鏡像，PR 有新 commit 或合併後需重新 clone；
之後的調查結果寫 `findings.md`（尚未建立）。
