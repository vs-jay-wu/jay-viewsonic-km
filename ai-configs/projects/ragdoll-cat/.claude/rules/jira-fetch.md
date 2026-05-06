# Jira Ticket Fetching

When a user provides a Jira URL or Jira key (e.g., `CLSWAN-1242` or a URL containing `selectedIssue=CLSWAN-1242`):

## Steps

1. **Extract the Jira key** from the URL query parameter `selectedIssue=` or use the key directly.
2. **Fetch the ticket** using the Jira REST API via Bash:

```bash
source ~/.zshrc && curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  "https://viewsonic-vsi.atlassian.net/rest/api/3/issue/{JIRA_KEY}?fields=summary,status,issuetype,priority,description,assignee,labels,parent" \
  | python3 -m json.tool
```

3. **Parse the response** and present the ticket information (summary, type, status, description, etc.) in a readable format.

## Important

- **Never log or print** the raw `JIRA_API_TOKEN` value.
- **Never write** the token to any file — always read it from the environment at runtime.
- The `description` field uses Atlassian Document Format (ADF). Extract readable text from `content[].content[].text` nodes recursively.
- If the API call fails (401/403), inform the user to check their `JIRA_EMAIL` and `JIRA_API_TOKEN` in `~/.zshrc`.
