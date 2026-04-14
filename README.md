# 知識中心專案說明

此專案作為公司 GitHub 組織專案的知識中心入口。

## 專案同步規則

- 本機根目錄：`/Users/jay.wj.wu/ProjectsWork_GitHub/Orgs`
- 依組織建立子目錄：`/Users/jay.wj.wu/ProjectsWork_GitHub/Orgs/<org>`
- 每次同步時：
  - 尚未存在的 repo 會 `clone`
  - 已存在的 repo 會 `pull --ff-only`

## Cursor Command

已建立 command 檔案：

- `.cursor/commands/sync-org-repos.md`

預設組織為 `Viewsonic-EDU`，也可在執行時傳入其他組織名稱參數。
