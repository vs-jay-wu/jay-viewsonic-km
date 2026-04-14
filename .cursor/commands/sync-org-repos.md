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

Execute:

```bash
chmod +x scripts/sync-org-repos.sh
./scripts/sync-org-repos.sh "${1:-Viewsonic-EDU}"
```
