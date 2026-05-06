---
name: jk-update-coding-convention
description: >-
  Sync project coding rules (.claude/rules/) with the Confluence "Tech Stack and Convention" page.
  Fetches the latest Confluence content, diffs it against local rule files, presents a summary of
  what changed, and applies updates after user confirmation. Use this skill whenever the user says
  "update coding convention", "sync coding rules", "更新 coding convention", "同步 coding rules",
  "coding rules 有更新", or mentions that the Confluence convention page has been updated.
---

# Update Coding Convention

Sync the project's `.claude/rules/` files with the authoritative Confluence page.

## Source of Truth

- **Confluence page**: "Tech Stack and Convention"
  - Cloud ID: `viewsonic-vsi.atlassian.net`
  - Page ID: `435912857`
  - Space: `clsft`

## Section-to-File Mapping

The Confluence page covers many topics. Each topic maps to a specific rule file:

| Confluence Section | Rule File | What It Covers |
|---|---|---|
| Class 命名, Custom View Class 命名, XML android:id, Layout Resource (命名規則 + Density 規範 + 特殊規則), String Resource 命名, Color Resource 命名, Drawable Resource (命名規則 + Density 規範 + 特殊規則), API Response Data Class, UI 統一使用的資料類別 (Info) | `naming-conventions.md` | Naming patterns for classes, XML IDs, layouts, colors, drawables, API responses, UI domain models, density rules, Figma dimension conversion |
| Extension Function | `extension-functions.md` | Extension function placement and naming |
| File placement: Constants, API Layer, Domain Models, DI Modules, UI Layer, UiHelper, Architecture Components (WindowModel, Coordinator, Handler, Manager, UiManager) | `file-placement.md` | Where to put each category of file, architecture component lifecycle rules |
| Figma design token mapping, dimension conversion, drawable token naming, radius tokens, icon rules, typography, interaction states | `figma-design-tokens.md` | Figma-to-Android token mapping and implementation checklist |
| SonarCloud rules | `sonar-kotlin-rules.md`, `sonar-kotlin-actionable.md` | Not sourced from this Confluence page (separate source) |
| Worktree setup | `worktree-setup.md` | Not sourced from this Confluence page |
| Jira fetching | `jira-fetch.md` | Not sourced from this Confluence page |

## Workflow

### Step 1 — Fetch the Confluence page

Use the Atlassian MCP tool to get the latest content:

```
mcp__claude_ai_Atlassian__getConfluencePage
  cloudId: "viewsonic-vsi.atlassian.net"
  pageId: "435912857"
  contentFormat: "markdown"
```

Note the `version.number` and `version.createdAt` from the response — report these to the user so they know which version they're syncing from.

### Step 2 — Read all rule files

Read every `.md` file under `.claude/rules/` using Glob + Read. Focus on the files listed in the mapping table above (skip `sonar-kotlin-rules.md`, `sonar-kotlin-actionable.md`, `worktree-setup.md`, `jira-fetch.md` — those are not sourced from this Confluence page).

### Step 3 — Compare and identify changes

For each Confluence section, compare the content against the corresponding rule file. Look for:

- **New sections** in Confluence that have no corresponding content in any rule file
- **Updated content** where the Confluence wording, values, or structure differs from the rule file
- **Removed content** that exists in the rule file but is no longer in Confluence (rare — flag but don't auto-delete)

Pay special attention to:
- Numeric values (density folders, division factors, thresholds)
- Naming patterns and examples
- Architecture component definitions and lifecycle rules
- DI conventions (singleton vs factory, lazy injection)
- File path conventions

### Step 4 — Present a diff summary

Present findings to the user in this format:

```
## Confluence Version
- Version: {number}, updated: {createdAt}

## Changes Found

### {rule-file-name.md}

**Updated:**
- {section name}: {what changed — old → new}

**Added:**
- {section name}: {brief description of new content}

**Potentially Removed:**
- {section name}: {content in rule file but not in Confluence}

### {next-rule-file-name.md}
...

## No Changes
- {rule files that are already in sync}
```

If no changes are found, report that all rules are up to date.

### Step 5 — Apply updates after confirmation

Wait for the user to confirm which changes to apply. The user may:
- Approve all changes
- Approve selectively (e.g., "只更新 density 跟 UiManager")
- Ask questions about specific changes
- Reject some changes

Apply only the approved changes using the Edit tool. Preserve:
- Existing YAML frontmatter in rule files (if present)
- File structure and heading hierarchy
- Content that is not sourced from the Confluence page (e.g., Figma design token color mappings that were added from other sources)

### Step 6 — Report

After applying changes, briefly summarize what was updated and which files were modified.

## Important Notes

- Rule files may contain content from **multiple sources** (not just this Confluence page). The `figma-design-tokens.md` file, for example, includes color mappings derived from Figma designs. Do not overwrite content that doesn't originate from the Confluence page.
- If a Confluence section is ambiguous or seems incomplete, ask the user before making assumptions.
- The Confluence page is written in a mix of Chinese and English. Rule files should distill the conventions into concise English with examples, consistent with the existing rule file style.
