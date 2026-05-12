---
description: SonarCloud Kotlin actionable rules for local coding
alwaysApply: true
---

# Sonar Kotlin Actionable Rules

This file turns key Sonar Kotlin rules into concrete implementation constraints for local development.
For full rule coverage, see `.claude/rules/sonar-kotlin-rules.md`.

## Enforcement

- These rules apply to all Kotlin code changes unless an explicit and approved exception is documented.
- When a rule is violated, refactor before PR creation.
- Prefer structural refactoring (extract function/object, simplify branches, reduce nesting) over suppressing warnings.

## Pre-PR Checklist (Kotlin)

1. No function cognitive complexity over threshold.
2. No overly deep nesting or complex boolean expressions.
3. No hard-coded credentials or sensitive data in logs.
4. No duplicated implementations/literals that should be constants/helpers.

## Rule Cards

### `kotlin:S3776` [CRITICAL/CODE_SMELL]

- Name: Cognitive Complexity of functions should not be too high
- Scope: `ALL` (Main + Test)
- Parameter: `threshold=15` (default)
- Required action:
  - Keep every function cognitive complexity `<= 15`.
  - If `> 15`, refactor by extracting helper functions and flattening nested control flow.
  - Avoid large `when/if` pyramids in a single method.

### `kotlin:S134` [CRITICAL/CODE_SMELL]

- Name: Control flow statements should not be nested too deeply
- Scope: `ALL`
- Parameter: `max=3` nesting depth
- Required action:
  - Keep nesting depth `<= 3`.
  - Replace deep nesting with guard clauses / early return.
  - Split nested blocks into named helper functions.

### `kotlin:S1067` [CRITICAL/CODE_SMELL]

- Name: Expressions should not be too complex
- Scope: `ALL`
- Parameter: `max=3` conditional operators in one expression
- Required action:
  - Break complex boolean expressions into named booleans.
  - Extract intent-revealing predicate methods.

### `kotlin:S107` [MAJOR/CODE_SMELL]

- Name: Functions should not have too many parameters
- Scope: `ALL`
- Parameter: `Max=7`
- Required action:
  - Keep function parameters `<= 7`.
  - Use parameter objects / data classes for related arguments.

### `kotlin:S138` [MAJOR/CODE_SMELL]

- Name: Functions should not have too many lines of code
- Scope: `MAIN`
- Parameter: `max=100` lines
- Required action:
  - Keep main-source functions concise (target < 100 LOC).
  - Extract cohesive logic into private helpers or dedicated classes.

### `kotlin:S4144` [MAJOR/CODE_SMELL]

- Name: Functions should not have identical implementations
- Scope: `ALL`
- Required action:
  - Remove duplicate implementations.
  - Consolidate with shared helper, template method, or strategy.

### `kotlin:S1192` [CRITICAL/CODE_SMELL]

- Name: String literals should not be duplicated
- Scope: `MAIN`
- Parameter: `threshold=3`
- Required action:
  - If the same literal appears 3+ times, centralize it as a constant/resource.
  - For protocol keys, keep constants in dedicated constant files.

### `kotlin:S2068` [BLOCKER/SECURITY_HOTSPOT]

- Name: Hard-coded credentials are security-sensitive
- Scope: `MAIN`
- Parameter: `credentialWords=password,passwd,pwd,passphrase`
- Required action:
  - Never hard-code credentials or secret-like tokens.
  - Use secure config sources and secret management.

### `kotlin:S2053` [CRITICAL/VULNERABILITY]

- Name: Password hashing functions should use an unpredictable salt
- Scope: `MAIN`
- Required action:
  - Always use unpredictable, per-password salt for hashing.
  - Do not use deterministic/shared salts.

### `kotlinsecurity:S7610` [MAJOR/VULNERABILITY]

- Name: Sensitive information should not be logged in production builds
- Scope: `ALL`
- Required action:
  - Do not log secrets, tokens, credentials, PII, or security-sensitive payloads.
  - Sanitize or redact sensitive fields before logging.
