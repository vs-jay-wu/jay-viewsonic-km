# 接手調查清單（VSFT-9785）

> 接手 Stephen Yang 的進度。以下為合併前後要釐清 / 執行的事項與查證狀態。
> 調查結果之後寫進 `findings.md`（尚未建立）。

## 合併前必辦

| # | 事項 | 狀態 | 備註 |
|---|---|---|---|
| 1 | **GH_PAT 權限驗證**：用 `ClassSwift Version Bump` workflow 手動跑 `DRY_RUN: true`，確認 `GH_PAT` 讀得到 ragdoll-cat releases | ☐ 未做 | 權限不足會讓**所有 Android build 在 embed 步驟失敗**（E17），擋整條 release pipeline |
| 2 | **Amplitude tracking plan**：建立 `ClassSwift Install Failed` 事件定義 | ☐ 未做 | PR 新增的 telemetry 事件（commit 4） |
| 3 | **與 #205 的合併順序**：`Jay/VSFT-9597-cs-token-redelivery` 同樣動到 ClassSwift 區域 | ☐ 未確認 | 確認哪個先合、rebase 誰 |
| 4 | PR #208 本身的 code review | ☐ 未做 | 7 個 commit 依相依順序，各自可獨立編譯 |

## 合併後 / 上線後

| # | 事項 | 狀態 | 備註 |
|---|---|---|---|
| 5 | **D6 實作**：合併 [ragdoll-cat#1089](https://github.com/Viewsonic-EDU/ragdoll-cat/pull/1089)（移除 `_deploy-mvb.yml` MDM 派送） | ☐ 等 #208 上線 | Stephen 建議 #208 上線後再合 |
| 6 | 確認 `classswift-bump.yml` 排程實際運作（每天 01:00 UTC） | ☐ | 首次排程跑完看 draft PR / commit 是否正常 |

## 要弄懂的問題（研究向）

> 北極星目標與差距分析見 [goal.html](goal.html)。
> **2026-07-31 決策更新**：「一定要最新版」前提移除，上層拍板**版本相容由後端負責** → Q3 / Q5 / Q6 關閉，新增 Q9 / Q10。
> 注意兩件事性質不同：**不要求最新版**是永久決策；**無最小版本限制**只是暫時現狀（前端也不處理版本相容錯誤），
> 未來可能需要設計，否則後端要相容的舊版範圍會無限增長。

| # | 問題 | 狀態 |
|---|---|---|
| Q1 | `ReleaseTarget` 執行期由版號推導的規則（build number 奇偶 → stage/beta/prod）與 CI 埋入 flavor 的一致性守衛（B9 修正）實際怎麼運作 | ☐ |
| Q2 | E9：完全離線教室 region gate 永遠不開 → 「離線可用」賣點被 gate 擋住。有沒有後續票要處理？（goal Gap 3） | ☐ |
| Q3 | ~~E4：rollback 不降級 CS，舊 MVB 可能搭到不相容的新 CS。相容性由誰保證？~~ | ✅ 已拍板（2026-07-31）：**後端負責處理相容** |
| Q4 | IFP52_2 跳過 silent install（避免卡系統 90 秒）的機型清單會不會擴大？ | ☐ |
| Q5 | ~~「一定要最新版」的定義與新鮮度要求（goal Gap 1）~~ | ✅ 關閉（2026-07-31）：前提移除，不要求最新版 |
| Q6 | ~~CS 出新版但 MVB 沒有 release 排程時，有什麼管道推上裝置？（goal Gap 1）~~ | ✅ 關閉（2026-07-31）：不要求最新版後，跟著 MVB release 即可 |
| Q7 | silent install 權限面：非 owner 帳號、IFP52_2 能否從裝置 / firmware 端解，讓 F4 / F5 / F6 三條「要使用者按安裝」的路徑消失？（goal Gap 2） | ☐ |
| Q8 | 背景安裝觸發點掛在 `onITAdminSettingsUpdated`，能否更早觸發以壓縮開機後的競態窗口？（goal Gap 4） | ☐ |
| Q9 | **「後端必須處理相容」的具體範圍**：是哪個後端（CS 後端？MVB 後端？）？「相容」涵蓋到多舊的 CS / MVB 組合？有沒有對應的票？ | ☐ |
| Q10 | **最小版本機制的未來設計**：目前「無最小版本限制」只是暫時現狀，若一直沒有，後端要相容的舊版範圍會無限增長。何時、由誰設計？屆時前端（MVB / CS）要不要配合做版本檢查與提示？ | ☐ |
| Q11 | **ClassSwift_Service.apk 是否只有 MVB 一個消費者？**（有沒有 standalone 或其他產品使用它？）→ 決定「融合進 MVBF」長期選項（goal.html §4）是否可行 | ☐ |
| Q12 | silent install 實際依賴 **firmware 的 VS API**（`VSSystemManager.installApp`，Android 13+ 失敗即不 fallback）：非 owner user 被拒、IFP52_2 卡 90 秒都是 firmware 行為 —— firmware 團隊能否放寬非 owner / 修 IFP52_2？（Q7 的具體化） | ☐ |
