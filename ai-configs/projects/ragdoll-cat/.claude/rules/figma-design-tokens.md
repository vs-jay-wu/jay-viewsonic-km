# Figma Design Token Mapping Rules

When implementing UI from Figma designs in this project, follow these token mappings and conventions.

## Color Token Mapping (VSDS → Android)

| VSDS Token | Hex | Android Resource | Usage |
|-----------|-----|-----------------|-------|
| `foun/color/neutral/0` | #FFFFFF | `@color/neutral_0` | White backgrounds |
| `foun/color/neutral/100` | #F6F6F6 | `@color/neutral_100` | Surface bg (class items, plan badge) |
| `foun/color/neutral/300` | #E5E5E5 | `@color/neutral_300` | Surface-300, dividers, selected item bg |
| `foun/color/neutral/500` | #B2B2B2 | `@color/neutral_500` | Disabled text |
| `foun/color/neutral/650` | #797979 | `@color/neutral_650` | Secondary text, icon tints |
| `foun/color/neutral/800` | #4D4D4D | `@color/neutral_800` | Borders (dropdown default border) |
| `foun/color/neutral/900` | #333333 | `@color/neutral_900` | Primary text, icon fills |
| `sys/color/text-200` | #999999 | `@color/color_999999` | Plan badge text, plan badge icon fills |
| `sys/color/primary` | #4848F0 | `@color/color_4848F0` | Primary buttons, active/focus borders (updated from #3C5AAA) |
| `sys/color/error` | #DB0025 | `@color/color_DB0025` | On-going chip, error indicators |

## State Styling

### Selected State
- **Class list item selected**: 2dp border `color_4848F0`, bg `neutral_100`
- **Dropdown selected item (in popup)**: bg `neutral_300` (#E5E5E5), text `neutral_900`
- **Dropdown button active (popup open)**: 2dp border `color_4848F0`
- **Dropdown button default**: 1dp border `neutral_800`

### Disabled State
- **Expired org in dropdown**: text color `neutral_500`, append clock/expiry icon, not clickable
- **Disabled button**: bg `neutral_300`, text `neutral_500`

### Error State
- Error text: red (#FF4444 or design system error color)
- Error border on inputs: red stroke
- Error toast/snackbar: pink fill + pink/red stroke border + info icon

## Figma Dimension Conversion

Figma design values must be divided before applying to Android dimensions:

- **1920×1080 designs (current):** divide by **1.5**
- **4K designs (legacy):** divide by **3**

Applies to: UI width/height, image sizes, spacing, and text sizes.

## Drawable Resource Rules

- **No inline hex colors**: Drawable XML files must reference `@color/` resources. Never write hex values (e.g., `#FFFFFF`, `#333333`) directly in drawable XML. Define the color in a resource file first, then reference it.
- **No hardcoded dimensions**: Radius and dimension values in drawable XML must reference `@dimen/` entries from `dimens_design.xml`. Do not hardcode dp values directly (e.g., use `@dimen/radius_800` instead of `10.66dp`).

## Drawable Naming for Design Tokens

Follow this pattern mapping Figma tokens to drawable names (use token names, not hex):
- `bg_{tokenColor}_radius{tokenLevel}` — e.g., `bg_neural0_radius800`
- `bg_{tokenColor}_radius{tokenLevel}_line_{borderToken}_border{borderToken}` — e.g., `bg_neural0_radius400_line_neutral450_border100`

## Radius Token Mapping

| VSDS Token | Value | Android Dimen |
|-----------|-------|---------------|
| `radius/sm` or `radius_400` | 5.33dp | `@dimen/radius_400` |
| `radius/md` or `radius_600` | 8dp | `@dimen/radius_600` |
| `radius/lg` or `radius_800` | 10.66dp | `@dimen/radius_800` |

## Shadow / Elevation Mapping

Figma `effects[]` of type `DROP_SHADOW` must be mapped to Android elevation or a shadow drawable. Skipping this causes the container's border to disappear on light/white backgrounds when the Figma stroke is a near-white color (e.g., `neutral_300` #E5E5E5).

Common VSDS elevation tokens:

| Figma DROP_SHADOW | Android (after ÷1.5) | Shadow Color |
|-------------------|----------------------|--------------|
| offset (0, 8), blur 16, #000 @ 16% | elevation 5.33dp + outline Y≈5dp | `#29000000` |
| offset (0, 4), blur 8, #000 @ 12% | elevation 2.67dp | `#1F000000` |

Rules:
- **Always extract `effects[]` for every top-level container** (window, dialog, card, popup). If DROP_SHADOW is present, the Android container MUST have a matching `elevation` / `android:elevation` / custom shadow drawable.
- If Figma stroke is `neutral_300` (#E5E5E5) or lighter, a drop shadow is almost certainly required — otherwise the border vanishes on white backgrounds.
- Prefer `android:elevation` + `android:outlineProvider="background"` on a rounded-corner drawable over nine-patch shadow PNGs.

## Icon Rules

- Figma VSDS icons use **filled** style by default. Do NOT use stroke/outline icons unless Figma explicitly shows stroke.
- Compare each icon individually: fill vs stroke, attached decorations (underline, box, badge), exact color.
- Icon colors should use semantic tokens (`neutral_900` for primary, `neutral_650` for secondary), NOT hardcoded hex.

## Typography

| Element | Size | Weight | Color |
|---------|------|--------|-------|
| Window title | 28sp | bold | neutral_900 |
| Subtitle | 14sp | medium | neutral_900 |
| Class name | 16sp | medium | neutral_900 |
| Plan badge text | 12sp | regular | neutral_650 |
| Button text | 16sp | regular/medium | varies |
| Dialog title | 16sp+ | bold | neutral_900 |
| Error text | 12-14sp | regular | error red |

## Interaction States Checklist

When implementing any interactive component, verify ALL states from Figma:
1. **Default** — normal appearance
2. **Selected/Active** — border color change, bg highlight
3. **Disabled** — grayed text, not clickable, disabled icon
4. **Loading** — placeholder, disabled buttons
5. **Error** — error border, error text, error toast position
6. **Focus** — may have focus ring (e.g., dropdown active = blue 2dp border)

## Pre-Implementation Checklist

Before coding any Figma screen:
1. [ ] Screenshot ALL states from Figma (save to `docs/dev/figma/`)
2. [ ] Map every color to existing Android color resources
3. [ ] Identify any missing color/dimen tokens and add them first
4. [ ] Verify icon style (fill vs stroke) by individual Figma node screenshot
5. [ ] Check interaction states (selected, disabled, error, loading, focus)
6. [ ] Verify toast/snackbar position matches Figma (top vs bottom)
7. [ ] Inspect Figma `effects[]` on every top-level container — if DROP_SHADOW exists, apply matching elevation / shadow drawable in Android (see Shadow / Elevation Mapping)
