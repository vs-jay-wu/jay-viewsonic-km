---
name: jk-code-review
description: >-
  Code Review | 程式碼審查 — Review all changes on the current branch compared to
  the develop (or specified base) branch. Checks naming conventions, file placement,
  architecture patterns, SonarCloud Kotlin rules, and ClassSwift project conventions.
  Use this skill whenever the user asks to "review", "code review", "審查", "check my
  changes", "PR review", "幫我 review", "看一下我的 code", or wants a quality check
  before opening a PR. Also trigger when the user asks "what did I change?" and wants
  feedback on those changes.
---

# Code Review Skill

## Purpose

Perform a thorough code review of changes on the current branch relative to a base branch
(default: `develop`). The review applies ClassSwift project standards — architecture rules,
naming conventions, SonarCloud Kotlin rules, and security guidelines — and produces an
actionable, prioritized report.

---

## Review Mindset

Be polite but skeptical. Prioritize bugs, performance regressions, safety issues,
and pattern violations over style nitpicks. **3 important comments > 15 nitpicks.**

Every review should produce at least one actionable finding — even clean branches
have opportunities for improvement (edge cases, consolidation, docs gaps, test
coverage). A report with zero comments looks superficial. Only skip findings if
the change is truly trivial (1-line typo fix, dependency bump).

---

## Step 1: Collect the Diff

```bash
# Identify base branch (default: develop)
git fetch origin develop --quiet
git diff origin/develop...HEAD --name-only
git diff origin/develop...HEAD --stat
```

If the user specifies a different base (e.g., "compare to main" or "compare to rc"), use that
instead. If the current branch has no commits ahead of the base, tell the user and stop.

Also collect:
```bash
git log origin/develop..HEAD --oneline   # commit history for this branch
git diff origin/develop...HEAD           # full diff for code analysis
```

**Read full context, not just the diff.** For each changed file, read the entire
source file to understand surrounding invariants, call patterns, and data flow.
If a change modifies a public class / interface / Manager / utility, grep for
callers and check whether sibling types (e.g., other ViewModels, other Managers
in the same feature) need the same fix. Many bugs in this codebase are a single
pattern repeated across features — catching it once in the diff misses the siblings.

---

## Step 2: Form an Independent Assessment

**Before reading commit messages**, work only from the diff:

- Files changed (count by type: `.kt`, `.xml`, layout, etc.)
- New files vs. modified vs. deleted
- Which architectural layers are touched (UI / ViewModel / Manager / API / data / DI)
- What you think this branch is doing, and what problems you already see

Forming a view from the diff first prevents anchoring on the author's narrative and
surfaces issues the author didn't describe.

### Reconcile with commit messages

Now read `git log origin/develop..HEAD` and treat commit messages as **claims to
verify, not facts to accept**:

- If a commit says "fix X", verify X is real and the change addresses the root
  cause — not just a symptom.
- If a commit claims a perf improvement, look for evidence (benchmark, before/after).
- If your independent reading disagrees with a commit message, investigate further
  rather than deferring to the author.

---

## Step 3: Review — Apply All Rule Sets

For every changed file, check all applicable rules below. Not every rule applies to every
file — use judgment. A layout file doesn't need architecture checks; a ViewModel doesn't
need color-naming checks.

### Priority Order

Walk the diff in this order — higher-priority issues should surface first in the report.
Rule sections 3.1–3.7 below are organized by *category*, not priority; this list tells you
what to look at **first**:

1. **Bugs & correctness** — race conditions, null dereferences, off-by-one, logic errors, broken state machines, wrong coroutine scope
2. **Safety** — thread safety, resource leaks (unclosed flows/streams/jobs), security vulnerabilities, credential exposure, exposed mutable state
3. **Performance** — O(n²) in hot paths, unnecessary allocations, missing caches, main-thread blocking work
4. **Missing tests** — untested error paths, edge cases, regression tests for bug fixes
5. **Architecture & file placement** — wrong layer, wrong DI scope, misplaced extension functions, business logic leaking into Views/Windows
6. **Naming & conventions** — class/resource/XML id naming, color/drawable resource naming
7. **Style & docs** — Sonar style rules (S3353, S6511, etc.), misleading comments, unused imports

### 3.1 Architecture & MVVM

| Check | Rule |
|-------|------|
| ViewModel purity | `ui/viewmodel/` must contain only ViewModel classes. No helpers, data classes, or standalone functions as separate files. |
| Manager scope | `Manager` classes must be Singletons (Koin `single`). |
| UiManager scope | `UiManager` must be Singletons used in Windows with Context/UI/SDK operations. |
| WindowModel | Should be created via Koin `factory`, paired 1:1 with its Window. |
| Coordinator | Factory pattern; has flow start control. |
| Handler | Factory pattern; no flow start control. |
| Business logic placement | Business logic must live in Model/Manager/WindowModel layer — not in Window or Activity. Only UI SDK operations belong in the View layer. |
| DI registration | All Koin modules go in `di/KoinModules.kt`. Managers and UiManagers use Koin Lazy Injection. |

### 3.2 Naming Conventions

| Check | Rule |
|-------|------|
| Class names | PascalCase. Acronyms treated as words: `Ui` not `UI`, `Api` not `API`, `Id` not `ID`. |
| Custom view names | Format `CS{Function}{Component}` (e.g., `CSTextView`, `CSLoginButton`). |
| XML `android:id` — single-word widget | Full name lowercase: `Button → @+id/button_xxx`. |
| XML `android:id` — multi-word widget | Abbreviation lowercase: `LinearLayout → @+id/ll_xxx`. |
| XML `android:id` — custom class | Class acronym prefix: `CSTextView → @+id/cstv_xxx`. |
| XML `android:id` — custom widget | `csw_` prefix: `CSBatchQuizListWidget → @+id/csw_batch_quiz_list`. |
| Layout resources | `activity_xxx`, `fragment_xxx`, `window_xxx`, `dialog_xxx`, `widget_xxx`. Custom views use class acronym prefix. |
| Color resources | Opaque: `color_{HEX}`. With alpha: `color_a{pct}_{HEX}` or `white_a90`. Black/white/gray use named entries; grays include luminance (e.g., `gray_l18`). All canonical values in `pure_colors.xml`. |
| Drawable — icons | `ic_` prefix. |
| Drawable — backgrounds | `bg_{fillColor}_radius{r}` or `bg_{fillColor}_radius{r}_line_{borderColor}_border{thickness}`. |
| API response classes | Suffix `Response`; fields use `@Json(name = "snake_case")` with lowerCamelCase Kotlin property; prefer non-nullable. |
| UI domain model classes | Suffix `Info`; must be `data class`; generator functions in `companion object`; converter functions as extension functions. |

### 3.3 File Placement

| Check | Rule |
|-------|------|
| Constants | App-wide → `constant/AppConstants.kt`. API → `constant/ApiConstant.kt`. Domain config keys → `data/constant/`. |
| API bodies | `api/body/{Action}Body.kt` |
| API responses | `api/response/{Resource}Response.kt` |
| Response mappers | Inside the response file — `fun ResponseType.toDomainModel()`. |
| Service interfaces | `api/{Feature}ApiService.kt` |
| DI modules | `di/KoinModules.kt` only. |
| Activities | `ui/activity/` |
| Fragments | `ui/fragment/` |
| ViewModels | `ui/viewmodel/` — ViewModel classes ONLY. |
| Windows | `ui/window/` |
| Window models | `ui/windowmodel/` |
| Widgets | `ui/widget/{feature}/` |
| Widget models | `ui/widgetmodel/{feature}/` |
| Custom views | `ui/customview/` |
| Domain models | Generic/shared → `data/info/`. Feature-specific → `data/{feature}/`. Enums → `data/enum/`. |
| Extension functions | ALL general-purpose extension functions → `com.viewsonic.classswift.utils.extension/`. Named `{ExtendedType}Extension.kt`. Exception: response-to-model mappers stay in their response file. |

### 3.4 SonarCloud Kotlin Rules (Key Actionable Subset)

Focus on CRITICAL and BLOCKER severity items:

| Rule | Check |
|------|-------|
| `S3776` Cognitive Complexity | No function should exceed complexity 15. Flag any function that looks like it might. |
| `S134` Nesting depth | Control flow nesting must not exceed 3 levels. Look for deep `if`/`when`/`for` pyramids. |
| `S1067` Expression complexity | Boolean expressions with more than 3 operators should be extracted to named predicates. |
| `S107` Too many parameters | Functions must have ≤ 7 parameters. |
| `S138` Function length | Main-source functions should stay under 100 lines. |
| `S1192` Duplicate string literals | Same literal 3+ times → extract to constant. |
| `S3353` `var` vs `val` | Use `val` if the local variable is never reassigned. |
| `S6511` `when` over chained `if` | Replace chained `if/else if` with `when`. |
| `S6524` Immutable collections | Use immutable collection types if contents aren't mutated. |
| `S6305` Exposed mutable flows | `MutableStateFlow`/`MutableSharedFlow` should not be `public`. Expose as read-only `StateFlow`/`SharedFlow`. |
| `S1144` Unused private methods | Remove unused private functions. |
| `S1481` Unused local variables | Remove unused local variables. |
| `S1128` Unnecessary imports | Remove unused imports. |
| `S125` Commented-out code | Remove (or restore) commented-out code blocks. |
| `S2068` Hard-coded credentials | Flag any password/token/secret literals. |
| `kotlinsecurity:S7610` Sensitive logging | Do not log tokens, credentials, PII, or security-sensitive payloads. |

### 3.5 Android View Conventions

| Check | Rule | Severity |
|-------|------|----------|
| Window Tag uniqueness | Every Window class must define its own unique Window Tag constant. Window Tags must NOT be shared or reused across different Window classes. | CRITICAL |
| WindowModel uniqueness | Every Window class must have its own dedicated WindowModel. WindowModels must NOT be shared across different Window classes (1:1 relationship). | CRITICAL |
| ViewBinding over findViewById | Always use ViewBinding to access views. Do NOT use `findViewById`. | MAJOR |
| No programmatic UI construction | Build UI with XML layouts, not dynamically via code (`addView`, `LinearLayout(context)`, etc.). XML layouts allow preview and are easier to maintain. Exception: truly dynamic content like RecyclerView items or programmatic animations. | MAJOR |
| Drawable XML — no inline hex colors | Drawable XML files must reference `@color/` resources. Never use inline hex values (e.g., `#FFFFFF`, `#333333`). All colors must be defined in color resource files first. | MAJOR |
| Drawable XML — no hardcoded dimensions | Drawable XML radius/dimension values must reference `@dimen/` from `dimens_design.xml`. Do not hardcode dp values directly. | MAJOR |
| Prefer existing Extension functions | Before writing new utility logic, check `utils/extension/` for existing extensions (e.g., `CSToastExtension` for toast show/dismiss, `ContextExtension` for context utilities). Reuse over re-implement. | MINOR |

### 3.6 Kotlin Style & Idioms

| Check | Rule |
|-------|------|
| Hard wrap | Lines must not exceed 150 characters (project-wide setting). |
| Extension function idioms | Prefer Kotlin-idiomatic extension functions over utility static methods. |
| Coroutine scope | Follow structured concurrency (`S6306`). ViewModel creates coroutines in `viewModelScope`. |
| Dispatcher injection | Dispatchers should be injectable for testability (`S6310`). |
| `MutableStateFlow` exposure | Always back with a private `_stateFlow` and expose read-only `stateFlow`. |

### 3.7 Git Commit Message Convention

Review the commits on this branch:
- Format: `<type>(<optional scope>): <description>` (all English) — round brackets, matches `.claude/skills/jk-commit/SKILL.md`
- `scope` is usually the Jira/ClickUp ticket number (e.g., `fix(CLSWAN-333): ...`)
- Valid types: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`, `style`, `perf`
- Flag commits that are vague, too large in scope, or include sensitive content in the message.

---

## Step 4: Produce the Review Report

Structure the report as follows. Keep it scannable — use tables and bullet points, not paragraphs.

```
## Code Review: {branch} → {base}

### Summary
- Files changed: N (X Kotlin, Y XML, Z other)
- Commits: N
- Layers touched: [UI / ViewModel / Manager / API / data / DI]

### Issues

#### 🔴 BLOCKER / CRITICAL
| File | Line/Location | Issue | Rule |
|------|--------------|-------|------|
| ... | ... | ... | ... |

#### 🟠 MAJOR
| File | Line/Location | Issue | Rule |
|------|--------------|-------|------|

#### 🟡 MINOR / INFO
| File | Line/Location | Issue | Rule |
|------|--------------|-------|------|

### Commit Message Review
| Commit | Status | Note |
|--------|--------|------|

### ✅ What Looks Good
- [List things done well — naming, patterns, architecture choices]

### Recommended Actions Before PR
1. [Most important fix]
2. [Next fix]
...
```

**Severity calibration:**
- BLOCKER: Security issues, hard-coded credentials, exposed mutable state, broken architecture layer boundaries
- CRITICAL: SonarCloud CRITICAL rules, wrong file placement for a class, missing `@Json` on API response
- MAJOR: Naming violations, wrong DI scope, function too long/complex, duplicate string literals
- MINOR: Style, unused imports, `var` where `val` suffices, `Nit:` suggestions

Omit a severity tier only if it has zero issues. **The MINOR / INFO tier should almost
always contain at least one 💡 suggestion** — consolidation opportunities, edge-case test
gaps, doc gaps, or small refactors. A report with zero findings looks shallow; only
acceptable for truly trivial changes (1-line typo, dependency bump).

---

## Step 5: Closing Statement

End with one of:
- **Ready for PR** — no BLOCKERs or CRITICALs, only MINOR/INFO
- **Fix before PR** — has MAJORs; list them
- **Not ready** — has BLOCKERs or CRITICALs; list them

Offer to help fix any of the flagged issues inline.

---

## Notes on Tone

- Be direct and specific. Point to the exact file and location.
- For subjective suggestions (style, refactoring ideas), prefix with `Nit:` — matching the
  team's PR convention so the author can decide whether to act on it.
- Don't flag things that aren't actually violations. If something looks unusual but is correct,
  say so and explain why it's fine.
- Focus on what matters: correctness, maintainability, and consistency with team conventions.

### Guards against noise

- **Don't pile on.** If the same issue appears in many files, flag it once with a note
  listing all affected files — don't repeat the same row in the severity table.
- **Don't flag what the linter / SonarCloud / ktlint will catch itself.** Unused imports,
  trivial formatting, obvious style — skip them unless they mask a real problem. The CI
  tooling is authoritative; duplicating its findings is noise.
- **If unsure, phrase it as a question, not a claim.** "Is this intentional? Elsewhere in
  `XxxManager` the pattern is Y." beats "This is wrong." — false positives erode trust in
  the review.
