# Manager 讀取 myViewBoard Instance ID（ContentProvider）

Manager（Software Instance 管理頁）需要知道「instance ID ↔ 裝置」的對應關係，
由 Android myViewBoard 透過 ContentProvider 提供給同裝置的 Manager agent 讀取，並限制呼叫端簽章。

> **最後更新：2026-08-17**（與 Manager team 開會後回填決議）

## Jira

| Ticket | 團隊 | 摘要 | 狀態 |
|---|---|---|---|
| [VSFT-9654](https://viewsonic-vsi.atlassian.net/browse/VSFT-9654) | 星期六浩克（MVB） | [Manager integration] 提供 Manager 讀取得到 myViewBoard instance ID | ANALYSIS |
| [VB-1399](https://viewsonic-vsi.atlassian.net/browse/VB-1399) | Manager（SW Mgmt） | Story 7: myViewBoard Settings - 與 mvb 串接以取得 software instance id | 進行中（**dm 端尚無任何對接程式碼**） |

## Scope

- **只做 Android myViewBoard**（Windows 不需要）
- MVB 開 read-only ContentProvider，dm 讀取後帶著 serial number 回報雲端，完成 join

---

## 📌 已定案的決議（2026-08-17 會議）

| # | 決議 |
|---|---|
| 1 | **provider 只給 `entity_id`，不給 entity name** —— 票面原寫 entity name 係當初討論的誤會。dm 走**雲端**用 id 換 name，本地不比對 |
| 2 | **錯誤要回報**：新增 `error_code`（字串）/ `error_message`（僅供 log）資料列。⚠️ **「還沒有值」不是錯誤**，不可回 error_code |
| 3 | **存取控制採 runtime SHA-256 allowlist**，provider 全 flavor 提供 —— A31 上 dm 與 mvbf 跨 key，`signature` permission 不足 |
| 4 | **「更新後未開啟」的 edge case：PM（Peja）判定可接受** —— mvbf 更新週期早於 dm（dm 下次更新 12 月），真的發生時走客服回報 + 提示使用者 |
| 5 | **dm 主動開啟 MVB（有 UI）：排除** —— 行為太怪，雙方一致 |

## ✅ 待辦（下次繼續）

- [ ] **研究 headless 初始化的可行性**（MVB 側，Jay）—— 讓「更新後從未開啟」的機器也能有值。方向見 [contract §8.1](contract-proposal.html#init-trigger) 的 (3‴)：用 `ACTION_MY_PACKAGE_REPLACED`（目前未註冊）+ 既有 `BOOT_COMPLETED` 觸發，只做「產生 instance_id + 鏡射」不碰網路。**effort 不高就實作**。
  - 未知數：MVB 沒有 headless 執行 Dart 的先例；Android 8+ receiver 只有數秒，engine 啟動可能更久 → 需 WorkManager／前景服務承接
- [ ] **（條件性）提供完整 edge case 敘述給 Manager team** —— **僅當上一項不可行時才需要**。草稿六點已備妥於 [contract §8.1](contract-proposal.html#pm-risk-accept)
- [ ] **正式 PR 的必補項**（見 [findings §8 待收尾](findings.html#poc)）
  - 存取控制（POC 目前是**裸 export、完全未做**）
  - `error_code` / `error_message`（POC 目前錯誤路徑是回 `null`）
  - 鏡射的 dirty check（值有變才寫才通知）與移出啟動關鍵路徑
- [ ] 與 Manager team 對齊 [Q4](open-questions.html#q4)：authority 命名慣例、版本演進策略定案、Story 8+ 還需要哪些欄位

## POC 成果落點

| | |
|---|---|
| repo | `Orgs/Viewsonic-EDU/edu-droid-flutter` |
| branch | `feature/VSFT-9654-instance-info-provider`（**未合進 master**） |
| commit | `02a4c99e6`（單一 commit，11 files / +935 −7） |
| 用途 | commit message 明載「供未來正式開票時 cherry-pick」 |

⚠️ cherry-pick 時可**整段拿掉** v2 的「entity name 持久化」改動（決議 1 已使其不需要）。
⚠️ dmagent repo 另有 4 處本地 hack（ModelFactory、DMService receiver、POC hook、EnrollmentActivity overlay），**勿 commit**。

## 文件索引

| 檔案 | 內容 |
|---|---|
| [overview.html](overview.html) | 總覽：兩票分工、資料流圖、為什麼不是 enroll 帶 serial |
| [findings.html](findings.html) | 程式碼調查結果（Hive 機制與實機驗證、儲存保護、簽章配置、POC 實作與結果） |
| [open-questions.html](open-questions.html) | **會議用文件** —— 每題的狀態、結論、要對方確認的事項（含浮動筆記功能） |
| [contract-proposal.html](contract-proposal.html) | Provider contract：合約形狀、存取控制、v1 keys、錯誤回報、鏡射機制、版本策略、未初始化處理 |
| [investigation.md](investigation.md) | 早期調查問題清單（已多數收斂，保留供追溯） |
