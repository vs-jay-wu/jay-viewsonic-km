---
name: jk-figma-extract
description: "Figma Spec Extract | 設計規格萃取 — Extract precise UI specifications from Figma designs via REST API, producing structured markdown specs with exact colors, spacing, typography, icon lists, and asset downloads. Use this skill BEFORE implementing any UI from Figma. Trigger whenever the user wants to: extract design specs, prepare Figma data for implementation, get exact Figma colors/spacing/fonts, audit a Figma frame, download Figma assets, or compare Figma specs with code. Triggers: extract figma, figma spec, read figma, design spec, 萃取設計, 讀 figma, 設計規格, figma 規格, 準備實作, extract design, get figma properties"
---

# Figma Spec Extractor

## Why This Skill Exists

Implementing UI from Figma screenshots leads to imprecise results — colors are eyeballed, spacing is guessed, icon styles (fill vs stroke) are misjudged. Past failures include:

- Using `#3C5AAA` when Figma actually specified `#4848F0` (looked the same in screenshots)
- Plan badge text was `#797979` when Figma specified `#999999`
- On-going badge used `#FF4444` instead of `#DB0025`
- Icons were stroke style when Figma specified filled style

The Figma REST API returns **exact** node properties — no guessing. This skill extracts that data into structured specs that implementation and jk-visual-verify can reference directly.

## Prerequisites

- `FIGMA_PAT` environment variable set in `~/.zshrc` (Figma Personal Access Token)
- Python 3 available

## When to Use

1. **Before `/prospec-implement`** on any UI task — extract specs for affected screens first
2. **Before `/jk-visual-verify`** — gives you exact values to compare against
3. **When auditing a Figma frame** — quick way to see all colors, fonts, spacing
4. **When Figma design updates** — re-extract to detect changes

## Inputs

| Input | Required | Example |
|-------|----------|---------|
| **Figma URL or node IDs** | Yes | `https://figma.com/design/ABC?node-id=123-456` or `2636:101308` |
| **File Key** | Yes (from URL) | `4C21d9puOZJcUyUR26oibd` |
| **Download assets** | No | `--download-assets` for icon SVGs |

## Workflow

### Step 1: Identify Target Nodes

If the user provides a parent section (a whole flow), first get the section's children:

```bash
source ~/.zshrc && curl -s -H "X-Figma-Token: $FIGMA_PAT" \
  "https://api.figma.com/v1/files/{fileKey}/nodes?ids={sectionNodeId}&depth=1" \
  | python3 -m json.tool
```

This reveals all frame node IDs within the section. Filter for the frames you need (skip "UI documentation" annotation nodes).

### Step 2: Run the Extraction Script

```bash
source ~/.zshrc && python3 .claude/skills/jk-figma-extract/scripts/extract_figma_spec.py \
  {fileKey} \
  "{nodeId1},{nodeId2},{nodeId3}" \
  --output-dir docs/dev/figma/spec \
  --depth 8 \
  --download-assets
```

The script:
1. Calls Figma REST API `/v1/files/:key/nodes` (batches of 5 to avoid timeout)
2. Parses the JSON tree, filtering out illustration internals (deep vector groups)
3. Extracts per-node: fills, strokes, radius, padding, gap, layout direction, typography, effects, visibility
4. Tracks VSDS icon instances and image nodes
5. Outputs structured markdown to `docs/dev/figma/spec/`
6. Optionally downloads icon SVGs to `docs/dev/figma/assets/icons/`

### Step 3: Review the Output

Each spec file contains:

#### Structure Tree
Hierarchical view of all UI elements with their properties:
```
- **INSTANCE** `my class menu` 1000×680
  > fill: #FFFFFF · stroke: #E5E5E5 w=1.0 · radius: 16.0 · HORIZONTAL · shadow: blur=16
  - **FRAME** `cover thumbnail` 500×680
    > fill: #0F2671
  - **INSTANCE** `side menu` 500×680
    > fill: #FFFFFF · pad: 40/24/40/24 · gap: 24 · VERTICAL
```

#### Color Table
All unique colors with their usage locations — directly mappable to Android color resources:
```
| Hex       | Used By                    |
|-----------|----------------------------|
| #333333   | title fill, class name fill |
| #4848F0   | selected stroke, button fill|
| #999999   | plan text fill             |
```

#### Typography Table
Every text element's exact font spec:
```
| Element | Font  | Weight | Size  | Line Height | Letter Spacing |
|---------|-------|--------|-------|-------------|----------------|
| title   | Inter | 700    | 28px  | 39.2px      | 0px            |
| plan    | Inter | 400    | 12px  | 14.4px      | 0.48px         |
```

#### Icon List
All VSDS component instances found:
```
| Icon Name                    | Node ID  | Size   | Style        |
|------------------------------|----------|--------|--------------|
| vsds-icon/pen-straight-line  | I2636... | 24×24  | filled       |
| vsds-icon/trash-can          | I2636... | 24×24  | filled       |
| vsds-icon/broadcast          | I2636... | 16×16  | filled       |
```

#### Icon SVG Export & Comparison (MANDATORY for new/replaced icons)

For each icon in the list, **export the SVG from Figma** and compare against the existing Android drawable:

```bash
source ~/.zshrc
ENCODED_ID=$(python3 -c "import urllib.parse; print(urllib.parse.quote('ICON_NODE_ID'))")
RESPONSE=$(curl -s -H "X-Figma-Token: $FIGMA_PAT" \
  "https://api.figma.com/v1/images/{fileKey}?ids=${ENCODED_ID}&format=svg&svg_simplify_stroke=true")
SVG_URL=$(python3 -c "import json,sys; print(list(json.load(sys.stdin)['images'].values())[0])")
curl -s "$SVG_URL" > /tmp/figma_icon.svg
```

Then compare against `app/src/main/res/drawable/ic_{name}.xml`:

| Check | SVG (Figma) | Drawable (Android) | Action if mismatch |
|-------|-------------|--------------------|--------------------|
| Path style | `fill="white"` → filled | `fillColor` vs `strokeColor` | Replace drawable |
| Path count | Count `<path>` elements | Count `<path>` elements | Different icon shape |
| Orientation | Inspect path data (horizontal arcs vs vertical) | Same | Replace drawable |
| ViewBox | `viewBox="0 0 16 16"` | `viewportWidth/Height` | Match viewport |

**Past bug:** `ic_broadcast.xml` had vertical WiFi stroke arcs (3 strokes + 1 fill), but Figma `vsds-icon/broadcast` was horizontal radio waves (5 filled paths). Screenshot comparison judged "Pass" because both looked like "a signal icon" at 14dp. SVG comparison would have caught this immediately.

**Rule:** When an icon drawable already exists, ALWAYS export the Figma SVG and compare path structure. Do NOT assume the existing drawable matches just because the filename seems right.

### Step 4: Map to Android Resources

After extraction, compare the Color Table against `.claude/rules/figma-design-tokens.md` and existing `res/values/colors.xml`:

1. **Known mappings** — confirm Figma hex matches the Android resource value
2. **New colors** — add missing colors to `pure_colors.xml` and semantic aliases to `colors.xml`
3. **Discrepancies** — flag if Figma uses a different hex than what's currently in Android (e.g., design system update)

### Step 5: Download Screenshots (Optional)

For visual reference, also download frame screenshots:

```bash
source ~/.zshrc
ENCODED_IDS=$(python3 -c "import urllib.parse; print(urllib.parse.quote('{nodeId1},{nodeId2}'))")
RESPONSE=$(curl -s -H "X-Figma-Token: $FIGMA_PAT" \
  "https://api.figma.com/v1/images/{fileKey}?ids=${ENCODED_IDS}&format=png&scale=1")
# Parse and download each URL
```

For frames with popup overlays (dropdown menus), check the parent section for sibling "menu list" nodes. Download both and composite using PIL:

```python
from PIL import Image
main = Image.open("frame.png")
popup = Image.open("popup.png")
# Calculate offset from Figma metadata positions
main.paste(popup, (popup_x - main_x, popup_y - main_y))
main.save("composited.png")
```

## What the REST API Returns (That Screenshots Don't)

| Property | From API | From Screenshot |
|----------|----------|-----------------|
| Exact hex color | `#4848F0` | "looks blue" |
| Stroke weight | `1.0` or `2.0` | hard to tell |
| Corner radius | `8.0` exactly | approximate |
| Padding values | `40/24/40/24` | estimate |
| Item spacing | `16` exactly | estimate |
| Font weight | `700` (bold) | "looks bold" |
| Letter spacing | `0.48px` | invisible |
| Line height | `14.4px` | approximate |
| Visibility | `HIDDEN` flag | can't see it |
| Component name | `vsds-icon/trash-can` | "a trash icon" |
| Shadow blur | `16.0` | approximate |

## Integration with Other Skills

- **`/prospec-implement`**: Run this skill in Phase 0 before starting UI tasks. The spec files in `docs/dev/figma/spec/` become the implementation reference.
- **`/jk-visual-verify`**: The exact color/spacing values from the spec replace eyeball comparisons. Cross-reference the spec when grading PASS/FAIL.
- **`.claude/rules/figma-design-tokens.md`**: Update the token mapping table when new colors or tokens are discovered.

## Mandatory Root Node Checks

When extracting the spec for a **top-level container** (window, dialog, card), the output MUST include these properties from the REST API. These are the most commonly missed values that cause implementation bugs.

| Property | API field | Why mandatory |
|----------|----------|---------------|
| **Corner radius** | `cornerRadius` | Past bug: spec said "~24dp" from screenshot, actual was 16dp |
| **Shadow** | `effects[]` where `type=="DROP_SHADOW"` | Include offset, blur, color, spread — needed for Android elevation mapping |
| **Border** | `strokes[0]`, `strokeWeight` | Stroke color + weight, for background drawable `<stroke>` |
| **Child image vs container size** | Compare child `absoluteBoundingBox` with parent size | Past bug: PNG was panel-sized (500×680), but spec didn't note this, so XML added redundant padding |

**Image size rule:** When a child image node's size approaches the parent container size (e.g., > 80% of parent area), explicitly note in the spec:
```
⚠️ Image size (432×599) is close to container (500×680).
   Check if the exported asset includes built-in margins.
   If PNG is exported at container size, do NOT add XML padding.
```

## Limitations

- REST API returns node IDs like `I2636:101308;661:49551` for instance children, but these can't be queried directly. Use `depth=8` on the parent to get the full tree.
- Batch max ~5-10 nodes per API call to avoid render timeout.
- Variable bindings (design tokens) are returned as IDs, not resolved values. The actual hex values come from the fills/strokes arrays which contain the resolved colors.
