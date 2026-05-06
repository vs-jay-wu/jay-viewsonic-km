# Extension Functions Placement Rule

## Rule

All Kotlin extension functions **must** be placed in the `com.viewsonic.classswift.utils.extension` package
(`app/src/main/java/com/viewsonic/classswift/utils/extension/`).

**Do NOT** define extension functions directly in the same file as the target class (e.g., inside a data class file or model file).

## Exception: API Response Mappers

Response-to-model mapping extensions (e.g., `fun LoginData.toFillUserInfo()`) stay **inside** their
corresponding `api/response/*Response.kt` file. These mappers are tightly coupled to the response
structure, so co-locating them improves maintainability.

Only **general-purpose / reusable** extension functions go to `utils/extension/`.

## File Naming Convention

Each file is named after the **extended type** followed by `Extension.kt`:

- `FillUserInfo` extensions → `FillUserInfoExtension.kt`
- `Context` extensions → `ContextExtension.kt`
- `String` extensions → `StringExtension.kt`

If an extension file for the target type already exists, add the new function to that file.
If not, create a new file following the naming pattern above.

## Package

All extension files use:

```kotlin
package com.viewsonic.classswift.utils.extension
```

## Prefer Existing Extensions

Before writing new utility logic, always check `utils/extension/` for existing extension functions first.
Reuse over re-implement. Common examples:

- `CSToastExtension` — toast display and auto-dismiss
- `ContextExtension` — context-related utilities
- `ViewExtension` — view visibility, click debounce, etc.

If the needed functionality already exists as an extension, use it directly instead of writing inline logic.

## Rationale

Centralizing extension functions in one package:
- Makes them discoverable and reusable across the codebase.
- Prevents extension functions from being buried inside model/data class files where they are hard to find.
- Follows the existing project convention established in `utils/extension/`.
