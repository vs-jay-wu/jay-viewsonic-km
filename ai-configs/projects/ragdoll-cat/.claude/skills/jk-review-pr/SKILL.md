---
name: jk-review-pr
description: >-
  PR Review | 審查 PR — Review a specific GitHub Pull Request by number or URL.
  Fetches PR diff and metadata via `gh` CLI, applies ClassSwift project standards
  (naming, file placement, architecture, SonarCloud Kotlin rules), and produces a
  prioritized review report. Supports `--silent` flag to output review locally
  without posting to GitHub. Use this skill whenever the user provides a PR number
  or GitHub PR URL and wants a review, or asks to "review PR #123", "幫我看這個 PR",
  "jk-review-pr 456", "幫我 review PR", "check this pull request", or wants to review
  someone else's code changes on GitHub. Also trigger when the user pastes a
  github.com/*/pull/* URL. For reviewing your own uncommitted local changes, use
  /jk-code-review instead.
---

# PR Review Skill

Review a GitHub Pull Request by fetching its diff and metadata via `gh`, then applying
the same ClassSwift project standards used in `/jk-code-review`. The difference: this skill
works on PRs that already exist on GitHub (yours or anyone's), while `/jk-code-review`
reviews local branch changes before a PR is opened.

---

## Review Mindset

Be polite but skeptical. Prioritize bugs, performance regressions, safety issues,
and pattern violations over style nitpicks. **3 important comments > 15 nitpicks.**

Every review should produce at least one actionable finding — even clean PRs have
opportunities for improvement (edge cases, consolidation, docs gaps, test coverage).
A review with zero comments looks superficial. Only skip findings if the PR is truly
trivial (1-line typo fix, dependency bump).

---

## Step 1: Parse Input and Fetch PR Data

### 1a. Extract the PR number and flags

The user might provide:
- A PR number: `123`, `#123`
- A full URL: `https://github.com/VSX-ViewSonic/ragdoll-cat/pull/123`
- A shorthand: `ragdoll-cat#123`
- Optional flag: `--silent` — output review in the current session only, do NOT post to GitHub

Examples:
- `/jk-review-pr 854` — review and post to GitHub
- `/jk-review-pr 854 --silent` — review locally, no GitHub post
- `/jk-review-pr --silent 854` — same as above (flag order doesn't matter)

If no number is given, ask the user.

### 1b. Resolve repo context

```bash
# Get owner/repo for API calls
REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner')
```

### 1c. Fetch everything in parallel

Run these commands together — they're independent:

```bash
# PR metadata
gh pr view {NUMBER} --json title,body,state,baseRefName,headRefName,author,labels,reviewRequestedReviewers,commits,files,additions,deletions

# Full diff
gh pr diff {NUMBER}

# Existing reviews (avoid duplicating what others already flagged)
gh api repos/{REPO}/pulls/{NUMBER}/reviews --jq '.[] | {user: .user.login, state: .state, body: .body}'

# Inline comments from reviewers
gh api repos/{REPO}/pulls/{NUMBER}/comments --jq '.[] | {user: .user.login, path: .path, line: .line, body: .body}'
```

If the PR is not found (404) or access is denied (403), report the error and stop.

### 1d. Read full context, not just the diff

For each changed file, read the entire source file — not only the hunks in the diff —
to understand surrounding invariants, call patterns, and data flow. If a change modifies
a public class / interface / Manager / utility, grep for callers and check whether
sibling types (e.g., other ViewModels, other Managers in the same feature) need the
same fix. Many bugs in this codebase are a single pattern repeated across features —
catching it once in the diff misses the siblings.

For PRs where the diff touches unfamiliar classes or cross-feature code, check out the
PR branch locally:

```bash
gh pr checkout {NUMBER}       # switch to PR branch locally
# ... read files / grep callers as needed ...
git checkout -                # switch back when done
```

For small diffs that stay within a single file with obvious context, reading via
`gh pr diff` alone is fine — don't check out every PR.

---

## Step 2: Form an Independent Assessment

**Before reading the PR title / body / commit messages**, work only from the diff:

- **Direction**: `{base}` <- `{head}` | **State**: open / merged / closed
- Files changed (count by type: `.kt`, `.xml`, layout, drawable, etc.)
- New vs. modified vs. deleted
- Architectural layers touched (UI / ViewModel / WindowModel / Manager / API / data / DI)
- What you think this PR is doing, and what problems you already see from the code

Forming a view from the diff first prevents anchoring on the author's narrative and
surfaces issues the author didn't describe.

For large PRs (30+ files), group files by layer/module and note which areas have the
most changes — this helps the reader understand where to focus.

### Reconcile with PR narrative

Now read the PR title, body, commit messages, and any linked Jira ticket. Treat them
as **claims to verify, not facts to accept**:

- If the PR says "fix X", verify X is real and the change addresses the root cause —
  not just a symptom.
- If the PR claims a perf improvement, look for evidence (benchmark, before/after).
- If your independent reading disagrees with the PR narrative, investigate further
  rather than deferring to the author.

### Existing reviews

Note what other reviewers have already flagged. This feeds into "Cross-reference with
existing reviews" in Step 3 — skip duplicates, call out what they missed.

---

## Step 3: Apply Project Review Rules

Review every changed file against the project's established rules.

### Priority Order

Walk the diff in this order — higher-priority issues should surface first in the
report. The rule sets below are organized by *category*, not priority; this list
tells you what to look at **first**:

1. **Bugs & correctness** — race conditions, null dereferences, off-by-one, logic errors, broken state machines, wrong coroutine scope
2. **Safety** — thread safety, resource leaks (unclosed flows/streams/jobs), security vulnerabilities, credential exposure, exposed mutable state
3. **Performance** — O(n²) in hot paths, unnecessary allocations, missing caches, main-thread blocking work
4. **Missing tests** — untested error paths, edge cases, regression tests for bug fixes
5. **Architecture & file placement** — wrong layer, wrong DI scope, misplaced extension functions, business logic leaking into Views/Windows
6. **Naming & conventions** — class/resource/XML id naming, color/drawable resource naming
7. **Style & docs** — Sonar style rules (S3353, S6511, etc.), misleading comments, unused imports

### Rule sets

The project's rules are defined in the `.claude/rules/` files which are always loaded
into context:

- **Architecture & MVVM** — ViewModel purity, Manager/UiManager singleton scope,
  WindowModel factory pattern, business logic placement, DI registration in KoinModules.kt
- **Naming conventions** — class names (PascalCase, acronyms as words), XML IDs,
  layout resources, color resources, drawable naming, API response/Info class suffixes
  (see `naming-conventions.md`)
- **File placement** — constants, API layer, UI layer, domain models, extension functions
  (see `file-placement.md`, `extension-functions.md`)
- **SonarCloud Kotlin rules** — cognitive complexity <= 15, nesting <= 3, expression
  complexity <= 3, parameters <= 7, function length < 100 LOC, duplicate literals,
  val vs var, exposed mutable flows, hard-coded credentials, sensitive logging
  (see `sonar-kotlin-actionable.md`)
- **Kotlin style** — 150-char line limit, extension function idioms, structured concurrency,
  dispatcher injection, private MutableStateFlow backing
- **Commit messages** — `<type>[<scope>]: <description>` format, valid types:
  feat/fix/chore/refactor/test/docs/style/perf

Not every rule applies to every file — layout XML doesn't need Sonar checks, a ViewModel
doesn't need color-naming checks. Use judgment.

### Cross-reference with existing reviews

When other reviewers have already commented:
- Skip issues they've already flagged (don't duplicate)
- Call out new issues they missed
- If you agree with an existing comment, note it briefly ("Agree with @reviewer on X")

---

## Step 4: Review Report

Keep it scannable — tables and bullets, not paragraphs.

```
## PR Review: #{number} — {title}

**Author**: {author} | **Base**: {base} <- {head} | **State**: {state}

### Summary
- Files changed: N (X Kotlin, Y XML, Z other)
- Commits: N
- Layers touched: [UI / ViewModel / WindowModel / Manager / API / data / DI]
- Existing reviews: N comments from [{reviewers}]

### Issues

#### BLOCKER / CRITICAL
| File | Line | Issue | Rule |
|------|------|-------|------|

#### MAJOR
| File | Line | Issue | Rule |
|------|------|-------|------|

#### MINOR / INFO
| File | Line | Issue | Rule |
|------|------|-------|------|

### Commit Message Review
| Commit | Status | Note |
|--------|--------|------|

### What Looks Good
- [Positive callouts — good naming, solid architecture, clean patterns]

### Recommended Actions
1. [Most critical fix]
2. ...
```

**Severity guide:**
- **BLOCKER**: Security (hard-coded credentials, sensitive logging), exposed mutable state, broken architecture boundaries
- **CRITICAL**: SonarCloud CRITICAL violations, wrong file placement, missing `@Json` on response
- **MAJOR**: Naming violations, wrong DI scope, function too long/complex, duplicate literals
- **MINOR**: Style nits, unused imports, `var` → `val`, subjective suggestions (prefix with `Nit:`)

Omit a severity tier only if it has zero issues. **The MINOR / INFO tier should
almost always contain at least one 💡 suggestion** — consolidation opportunities,
edge-case test gaps, doc gaps, or small refactors. A review with zero findings looks
shallow; only acceptable for truly trivial PRs (1-line typo, dependency bump).

---

## Step 5: Verdict and Post to GitHub

End with one of:
- **Approve** — no BLOCKERs or CRITICALs, only MINOR/INFO
- **Request Changes** — has MAJORs or above; list the specific blockers
- **Needs Discussion** — architectural concerns or ambiguous requirements needing team input

### If `--silent` flag is set

**Do NOT post anything to GitHub.** Display the full review report (Steps 2–4 + verdict)
directly in the current session. End with:

> (Silent mode — review not posted to GitHub)

Then offer: "要我把這份 review 貼到 PR 上嗎？" so the user can choose to post later.

### If `--silent` flag is NOT set (default)

**Always post the review to GitHub automatically** — do not ask for confirmation.

Choose the appropriate `gh pr review` flag based on the verdict:

```bash
# Approve
gh pr review {NUMBER} --approve --body "$(cat <<'EOF'
{review content}
EOF
)"

# Request Changes
gh pr review {NUMBER} --request-changes --body "$(cat <<'EOF'
{review content}
EOF
)"

# Needs Discussion (comment only, no verdict)
gh pr review {NUMBER} --comment --body "$(cat <<'EOF'
{review content}
EOF
)"
```

After posting, show the user the PR URL so they can verify.

Note: GitHub has a ~65,000 character limit on review bodies. For very large reviews,
summarize the report and link to details, or split across multiple comments.

---

## Tone

- Direct and specific — point to the exact file and line.
- Prefix subjective suggestions with `Nit:` so the author can decide.
- Don't flag non-violations. If something looks odd but is correct, explain why it's fine.
- Be constructive — suggest solutions, not just problems.
- When reviewing someone else's PR, assume good intent and explain reasoning behind flags.

### Guards against noise

- **Don't pile on.** If the same issue appears in many files, flag it once with a note
  listing all affected files — don't repeat the same row in the severity table.
- **Don't flag what the linter / SonarCloud / ktlint / CI will catch itself.** Unused
  imports, trivial formatting, obvious style — skip them unless they mask a real problem.
  Check the PR's CI status (`gh pr checks {NUMBER}`) if you're unsure what the pipeline
  already reports. Duplicating CI findings is noise.
- **If unsure, phrase it as a question, not a claim.** "Is this intentional? Elsewhere
  in `XxxManager` the pattern is Y." beats "This is wrong." — false positives erode
  trust in the review, especially when reviewing others' PRs.
