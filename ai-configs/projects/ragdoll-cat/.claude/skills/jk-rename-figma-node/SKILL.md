---
name: jk-rename-figma-node
description: >-
  Rewrite every Figma link on a Confluence page so its display text becomes just
  `node-id=XXXXX-XXXXX` while the link itself still opens the original Figma URL.
  Handles both Smart-Link (inlineCard) previews and regular text+link nodes.
  Use this skill whenever the user wants to tidy Figma links on a Confluence page —
  triggers: '/jk-rename-figma-node <atlassian-url>', 'rename figma links',
  'shorten figma link display', '縮短 figma 連結顯示', '改 figma 連結顯示',
  '把 figma 連結改成 node-id'. If the user does not provide an Atlassian URL,
  prompt them to paste one.
user_invocable: true
arguments:
  - name: atlassian_url
    description: "Atlassian Confluence page URL (e.g. https://viewsonic-vsi.atlassian.net/wiki/spaces/.../pages/459899774/...) or a numeric pageId."
    required: false
---

# Rename Figma Links → node-id Display

This skill rewrites Figma links on a Confluence page so each one shows just
`node-id=XXXXX-XXXXX` as the display text, while remaining clickable to the
original Figma URL. It matches the manual "Edit link → Display text" flow in
Confluence, but in one shot for every Figma link on the page.

## Inputs

- Atlassian Confluence page URL, or a numeric page ID.
- If the user omits the argument, **prompt** them:
  > 請貼上要改的 Atlassian Confluence 頁面 URL (例如 `https://viewsonic-vsi.atlassian.net/wiki/spaces/.../pages/459899774/...`)

Do not proceed until a valid URL / page ID is provided.

## Extract pageId

From the URL, grab the first numeric segment after `/pages/`:

- `.../wiki/spaces/myViewboar/pages/459899774/Android+Integration+Phase2` → `459899774`
- A bare numeric string is already a page ID — use it directly.
- Tiny links (`/wiki/x/XXXX`) are **not** supported by this skill; ask the user for the full URL.

## Steps

### 1. Fetch the current page (v2 API, ADF format)

```bash
source ~/.zshrc && curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  "https://viewsonic-vsi.atlassian.net/wiki/api/v2/pages/{PAGE_ID}?body-format=atlas_doc_format" \
  > /tmp/jk_rename_figma_page.json
```

Extract from the response:
- `title`
- `version.number` (needed to compute `new_version = current + 1`)
- `body.atlas_doc_format.value` (a JSON string holding the ADF document)

If the API returns 401/403, tell the user to check `JIRA_EMAIL` / `JIRA_API_TOKEN` in `~/.zshrc`.
If 404, the page ID is wrong — stop and ask for a correct URL.
**Never** print or log the token value.

### 2. Transform Figma links

Run the helper script with the fetched page JSON. It:
- Walks the ADF tree
- Converts every `{"type":"inlineCard","attrs":{"url":"...figma.com..."}}` into
  `{"type":"text","text":"node-id=XXXXX-XXXXX","marks":[{"type":"link","attrs":{"href":"...original URL..."}}]}`
- Renames every existing `text` node whose link mark points to `figma.com` so its
  `text` becomes `node-id=XXXXX-XXXXX`; the `href` is left untouched.
- Leaves every other node (paragraphs, tables, images, non-Figma links) unchanged.

```bash
python3 .claude/skills/jk-rename-figma-node/scripts/rename_figma_links.py \
  --input /tmp/jk_rename_figma_page.json \
  --output /tmp/jk_rename_figma_payload.json
```

The script prints a preview of every transformation (old URL → new display label)
plus a summary of how many inlineCards and text+link nodes were touched. Show this
preview to the user and ask for confirmation before step 3.

If zero Figma links are found, tell the user and stop — no update needed.

### 3. Push the update (v2 API PUT)

Only after user confirmation. The payload file from step 2 already contains the
correct shape (`id`, `status`, `title`, `body.representation=atlas_doc_format`,
`body.value`, `version.number`, `version.message`).

```bash
source ~/.zshrc && curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  -X PUT "https://viewsonic-vsi.atlassian.net/wiki/api/v2/pages/{PAGE_ID}" \
  -H "Content-Type: application/json" \
  --data @/tmp/jk_rename_figma_payload.json \
  -o /tmp/jk_rename_figma_response.json -w "HTTP %{http_code}\n"
```

Expected: `HTTP 200`. If not, print the response body so the user can diagnose.

### 4. Verify

Re-fetch the page and confirm zero Figma inlineCards remain, and every Figma
text+link node now displays `node-id=...`:

```bash
source ~/.zshrc && curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  "https://viewsonic-vsi.atlassian.net/wiki/api/v2/pages/{PAGE_ID}?body-format=atlas_doc_format" \
  > /tmp/jk_rename_figma_verify.json

python3 .claude/skills/jk-rename-figma-node/scripts/rename_figma_links.py \
  --verify /tmp/jk_rename_figma_verify.json
```

### 5. Report

Tell the user:
- Page title + new version number
- How many links were renamed (inlineCard vs text+link breakdown)
- Link to the page

## Safety

- This edits a shared Confluence page that others can see — always show the preview
  from step 2 and wait for explicit confirmation before calling step 3.
- Only nodes whose href/url contains `figma.com` are modified. Non-Figma content
  (other links, text, images, tables, macros) is preserved byte-for-byte by the
  script.
- Never print or write `JIRA_API_TOKEN`. Read it fresh from `~/.zshrc` each time.
