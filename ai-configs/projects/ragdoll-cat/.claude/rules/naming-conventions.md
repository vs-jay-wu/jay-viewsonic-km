---
description: Naming conventions for classes, XML IDs, layouts, colors, drawables, and API responses
alwaysApply: true
---

# Naming Conventions

## Class Names

- Use PascalCase. Treat acronyms as regular words (`Ui`, `Api`, `Id`).
- Example: `QuizSharedUiInfo` not `QuizSharedUIInfo`.

## Custom View Class Names

- Format: `CS{Function}{Component}` (e.g., `CSTextView`, `CSLoginButton`).

## XML `android:id`

- Single-word platform widgets: lowercase full name (e.g., `Button → @+id/button_xxx`).
- Multi-word platform widgets: lowercase shorthand prefix (e.g., `LinearLayout → @+id/ll_xxx`).
- Custom view classes: use the class acronym as prefix (e.g., `ClassSwiftTextView → @+id/cstv_{usage}`).
- Custom widgets: use `csw` prefix (e.g., `CSBatchQuizListWidget → @+id/csw_batch_quiz_list`).

## Layout Resources

- Activities: `activity_xxx`
- Fragments: `fragment_xxx`
- Windows: `window_xxx`
- Dialogs: `dialog_xxx`
- Widgets: `widget_xxx`
- Custom views: `{class acronym}_layout_xxx` (e.g., `cstv_layout_xxx`, `cslb_layout_xxx`).
- Other / undefined: `view_xxx`

## Layout Resource Density

- Layout resource images (non-drawable): place only in `xxhdpi` folder.

## Drawable Density

- SVG files: place in the default `drawable/` folder.
- PNG files: download 1x / 2x / 3x and place in `drawable-mdpi/`, `drawable-xhdpi/`, `drawable-xxhdpi/` respectively.

## Figma Dimension Conversion

Figma design dimensions must be divided by a factor based on the design resolution before applying to Android:

- **1920×1080 designs (current):** divide by **1.5**
- **4K designs (legacy):** divide by **3**

This applies to: UI width/height, image sizes, spacing, and text sizes.

## Color Resources

- Canonical values in `pure_colors.xml`; other resources reference these entries.
- Opaque: `color_{HEX}` (e.g., `color_85E1EA`).
- Black/white/gray use named entries; grays include luminance (e.g., `gray_l18` for 18%).
- With alpha: `color_a{pct}_{HEX}` or `white_a90` (e.g., `color_a50_85E1EA`).

## Drawable Resources

- Icons: `ic_` prefix.
- Backgrounds: `bg_` prefix. Use design token names (not hex values):
  - Format: `bg_{tokenColor}_radius{tokenLevel}` (e.g., `bg_neural0_radius800`)
  - With border: `bg_{tokenColor}_radius{tokenLevel}_line_{borderTokenColor}_border{borderToken}` (e.g., `bg_neural0_radius400_line_neutral450_border100`)

## API Response Data Classes

- Suffix with `Response`.
- Prefer non-null properties when the API guarantees the field.
- Use `@Json(name = "snake_case")` and lowerCamelCase for Kotlin properties.

## UI Domain Model Classes (Info)

- Classes used in the UI layer are suffixed with `Info` and defined as `data class`.
- Generator functions (converting from DB entity or API response) go in `companion object`:

  ```kotlin
  companion object {
      fun fromDbEntity(entity: StudentDbEntity): StudentInfo { ... }
      fun fromResponse(response: StudentResponse): StudentInfo { ... }
  }
  ```

- Converter functions (converting to other layers) are extension functions:

  ```kotlin
  fun StudentInfo.toDbEntity(): StudentDbEntity = StudentDbEntity(...)
  fun StudentInfo.toPostBody(): StudentPostBody = StudentPostBody(...)
  ```
