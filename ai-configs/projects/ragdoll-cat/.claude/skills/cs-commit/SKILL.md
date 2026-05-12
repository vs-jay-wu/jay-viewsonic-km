---
name: cs-commit
description: >-
  Prepare and create git commits in this repository using the project commit standards,
  safe staging boundaries, and verification steps. Use when the user asks to "commit",
  "幫我 commit", "提交", "make a commit", or asks to commit current changes.
---

# Commit

## Workflow

1. 檢查 `git status --short` 與當前 branch。
2. 根據使用者當前需求，確認本次 commit 範圍。
3. 只 stage 本次範圍檔案，避免夾帶不相關變更。
4. 可行時執行對應驗證（優先 targeted test/build/lint）。
5. 依專案格式建立 commit message：`<type>[<optional scope>]: <description>`。
6. 若使用者要求開 PR，PR 內文必須使用「實際換行」，不可把 `\n` 當字串塞進 `--body`。
7. 回報 commit/PR 結果：
   - commit hash
   - commit message
   - staged file list
   - verification command/result

## Safety Rules

- 禁止使用破壞性指令（例如 `git reset --hard`、`git checkout --`），除非使用者明確要求。
- 禁止未經要求的 `--amend`。
- 如果 commit 範圍不明確，先向使用者確認再 stage。

## Rebase Sync Rule

需要同步 `develop` 時，僅可使用 rebase：

1. `git fetch origin`
2. `git rebase origin/develop`
3. `git push --force-with-lease`

## PR Body Formatting Rule

- 禁止用單行字串（含 `\n`）直接傳給 `gh pr create --body`，這會導致 GitHub 顯示成純文字。
- 請用 `--body-file` + heredoc，確保 Markdown 標題/清單有正確格式：

```bash
gh pr create --base <base> --head <head> --title "<title>" --body-file - <<'EOF'
## Summary
- item 1
- item 2
EOF
```

- 若已經建 PR 但格式壞掉，立即用 `gh pr edit <number> --body-file - <<'EOF' ... EOF` 修正。

## Commit Message Guide

- 使用專案格式：`<type>[<optional scope>]: <description>`
- 用現在式祈使句描述
- message 要和 staged 內容一致

範例：
- `feat[CLSWAN-1222]: add myviewboard open-window parser`
- `fix[NO-TICKET]: handle missing request_id in binder message`
- `test[myviewboard]: add parser malformed-json coverage`
