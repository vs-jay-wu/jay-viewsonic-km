# 調查問題清單

> 狀態標記：✅ 已查證 / ⏳ 待查 / ❓ 需他人回答（詳見 [open-questions.html](open-questions.html)）

## Jira 票面

- ✅ VSFT-9654 票面內容、附圖（Manager Template settings 畫面、MVB Settings 畫面）— 見 [findings.html](findings.html#current)
- ✅ 技術方向：Stephen Yang 2026-07-29 comment 定調 ContentProvider + signed key 限制
- ✅ 關聯票 VB-1399（Manager 端對接票）存在且進行中

## edu-droid-flutter 程式碼現況

- ✅ instance ID 在哪產生、怎麼存、送到哪些後端 API
- ✅ entity ID / entity name 的儲存現況（結論：entity name 完全沒有持久化）
- ✅ 既有 ContentProvider（只有兩個 FileProvider，皆 exported=false，無自訂 provider）
- ✅ 既有 signature 檢查 / 自訂 permission 先例（結論：零先例）
- ✅ Manager agent 跨 app 整合現況（MVB 已會讀 `com.viewsonic.dmagent` 的 provider，可當對稱範本）
- ✅ Native ↔ Flutter 溝通模式、Java 讀 Flutter 資料的既有先例（BootReceiver 讀 FlutterSharedPreferences）
- ✅ flavor 簽章配置（ifp/edla 用平台 key、open/store 用 Google Play key）

## 待查 / 需他人回答

- ✅ entity name：用途已釐清（Aaron Chang 07-31，授權護欄）；來源已查證（07-31）——後端 `/{uid}/entity` **已回** `organization`/`name`，MVB 擴充解析即可，比對欄位是 `organization`（等值）
- 🔶 簽章方案：已確認 dm 只需 ifp/edla（Jay 07-31）→ signature permission 定向；剩正式包板 key 一句話確認
- ❓ 未 enroll（instance ID 尚未產生）時 provider 行為
- ❓ Provider contract（authority / URI path / column）需與 VB-1399 共同定義
- ✅ 後端 `GET /{uid}/entity` response 已含 `entity_id`/`organization`/`name`/`beta_program`（edu-mvb-api-core `res-body.dto.ts:35-46`），MVB 目前只解析 `entity_id`
