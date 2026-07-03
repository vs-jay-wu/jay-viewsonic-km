Sync all repositories from a GitHub organization by running `scripts/sync-org-repos.sh`.

Arguments (all optional, any order):
- Organization name — defaults to `Viewsonic-EDU`.
- `--include-offloaded` (`-o`) — 若外接硬碟已掛載，同時同步 offloaded 清單裡的 repo（走 `externalPath`）。

Examples:
- `/sync-org-repos` → 同步 `Viewsonic-EDU`（跳過 offloaded）
- `/sync-org-repos my-org` → 同步 `my-org`
- `/sync-org-repos --include-offloaded` → 一併同步外接硬碟上的 offloaded repos
- `/sync-org-repos my-org -o` → 同上，指定 org

## Offloaded repos

Repos listed under `offloaded` in `local.workspace.json` 預設會被跳過（它們被移到外接硬碟）。管理方式：

- **Offload a repo**：加入 `offloaded` 陣列，並把資料夾實體移到外接硬碟（`externalPath`）。
- **Restore a repo**：把它從 `offloaded` 移除後重跑 sync（腳本會 clone 回本機）。
- **Sync 外接硬碟上的 offloaded**：加 `--include-offloaded`；腳本會檢查 `externalPath` 是否掛載，然後對每個 offloaded repo 在該路徑下做 fetch / clone。

```json
"Viewsonic-EDU": {
  "localPath": "...",
  "externalPath": "/Volumes/Crucial X9/ProjectsWork_GitHub/Orgs/Viewsonic-EDU",
  "offloaded": ["edu-as-golang-server", "teamone-handwriting-recognition-api"]
}
```

Run the following:

```bash
chmod +x scripts/sync-org-repos.sh
./scripts/sync-org-repos.sh ${ARGUMENTS:-Viewsonic-EDU}
```
