Sync all repositories from a GitHub organization by running `scripts/sync-org-repos.sh`.

Argument (optional): organization name. Defaults to `Viewsonic-EDU` if not provided.

Examples:
- `/sync-org-repos` → sync `Viewsonic-EDU`
- `/sync-org-repos my-org` → sync `my-org`

Run the following:

```bash
chmod +x scripts/sync-org-repos.sh
./scripts/sync-org-repos.sh "${ARGUMENTS:-Viewsonic-EDU}"
```
