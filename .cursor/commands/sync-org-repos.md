---
description: Clone all repos in an org, or pull if already cloned
argument-hint: [org]
---

Sync all repositories from a GitHub organization by running:
`scripts/sync-org-repos.sh`

Default org is `Viewsonic-EDU` when no argument is provided.

Example:
- `/sync-org-repos` -> sync `Viewsonic-EDU`
- `/sync-org-repos my-org` -> sync `my-org`

## Offloaded repos

Repos listed under `offloaded` in `local.workspace.json` are skipped during sync (they have been temporarily moved to an external drive). To manage:

- **Offload a repo**: add its name to the `offloaded` array in `local.workspace.json`, then physically move the folder to the external drive.
- **Restore a repo**: remove it from the `offloaded` array, then re-run sync (the script will clone it back), or move the folder back from the external drive manually.

```json
"Viewsonic-EDU": {
  "localPath": "...",
  "offloaded": ["edu-as-golang-server", "teamone-handwriting-recognition-api"]
}
```

Execute:

```bash
chmod +x scripts/sync-org-repos.sh
./scripts/sync-org-repos.sh "${1:-Viewsonic-EDU}"
```
