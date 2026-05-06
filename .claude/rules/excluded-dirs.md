# Excluded 目錄保護規則

`local.workspace.json` 各 org 的 `excluded` 陣列，列出存放在 org 目錄下但**不屬於 GitHub repo** 的敏感資料夾。

## 目前 excluded 清單（Viewsonic-EDU）

- `mvbf_keystore` — 含 `.jks` keystore 與 `key.properties`
- `playstore_keystore` — 含 `viewsonic.keystore` 與 `key.properties`

## 規則

這些目錄雖然存放於 org repos 目錄下（歷史慣例），但：

- **禁止**讀取或顯示其中的檔案內容
- **禁止**移動、複製、刪除這些目錄或其中的檔案
- **禁止**將這些目錄名稱加入 `offloaded` 清單
- **禁止**對這些目錄執行任何 git 操作
- 若使用者要求操作這些目錄，應說明其為受保護的敏感資料，並請使用者自行處理

## 如何新增 excluded 項目

直接編輯 `local.workspace.json`，在對應 org 的 `excluded` 陣列中新增資料夾名稱。
