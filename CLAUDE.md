# Gitmoji 與語言規則

- 回覆內容以繁體中文為主，除非使用者明確要求其他語言。
- 產生 commit 訊息時，標題前面加上對應的 gitmoji。

## Commit 訊息格式

`<gitmoji> <type>: <繁體中文簡述>`

範例：
- `✨ feat: 新增同步組織專案腳本`
- `🐛 fix: 修正 macOS 無法使用 mapfile 的問題`
- `📝 docs: 更新 command 使用說明`

## 常用 gitmoji 對照

- `✨` 新功能
- `🐛` 修 bug
- `♻️` 重構
- `⚡️` 效能優化
- `✅` 測試
- `📝` 文件
- `🔧` 設定或工具調整

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **jay-viewsonic-km** (706 symbols, 890 relationships, 20 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/jay-viewsonic-km/context` | Codebase overview, check index freshness |
| `gitnexus://repo/jay-viewsonic-km/clusters` | All functional areas |
| `gitnexus://repo/jay-viewsonic-km/processes` | All execution flows |
| `gitnexus://repo/jay-viewsonic-km/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
