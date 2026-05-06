---
name: jk-visual-verify
description: "Visual Verify | 視覺比對驗證 - Capture Figma design screenshot and device screen screenshot, then perform precise per-element multimodal comparison across 6 layers (structure, color, spacing, typography, icon, image). Each icon is individually screenshot from Figma and compared for fill/stroke style, color code, and attached elements. Produces a table-based difference report. Automatically triggered after UI task completion in prospec-implement, also available standalone. Use this skill whenever the user wants to compare a UI implementation against Figma, check visual fidelity, verify a screen looks right, or asks anything like 'does this match the design'. Triggers: visual verify, compare design, compare figma, screenshot compare, UI compare, visual check, 視覺比對, 比對設計, 截圖比對, 跟設計稿比較, 畫面比對, 看起來對不對, 跟 Figma 一樣嗎"
---

# Visual Verify Skill

## Why This Skill Exists

Past visual comparisons were too coarse — "looks roughly right" passed screens with wrong icon styles, misaligned buttons, incorrect border radii, and wrong colors. Real examples of bugs that slipped through:

- Rename icon: implementation showed boxed pencil stroke #666, Figma specified pencil-with-underline fill #333 — judged "Pass" because "a pencil icon exists"
- Delete icon: implementation used red filled trash, Figma specified black outlined trash — not caught
- Cancel/Delete buttons not right-aligned as designed
- Window corner radius, cover image white border, cover image color all wrong — only caught by manual user report

This skill exists to prevent these failures by enforcing **per-element precision comparison**, not "overall vibe check".

## Activation

When triggered, briefly describe:
- That you'll build, deploy, and capture screenshots from both Figma and the device
- Every UI element will be compared individually across 6 layers
- Each icon will be individually screenshot from Figma at enlarged scale for precise style comparison
- A table-based difference report will be produced
- Any Fail items will be fixed and the entire comparison re-run from scratch

## Inputs

Ask the user for any missing inputs:

| Input | Required | Example |
|-------|----------|---------|
| **Figma URL** | Yes | `https://figma.com/design/ABC123/MyFile?node-id=42-1337` |
| **Device ID** | No (auto-detect) | `SM-X520` or `emulator-5554` |

### Figma URL Parsing

Extract `fileKey` and `nodeId` from the URL:
- `figma.com/design/:fileKey/:fileName?node-id=:nodeId` -> convert `-` to `:` in nodeId
- `figma.com/design/:fileKey/branch/:branchKey/:fileName` -> use branchKey as fileKey

## Recommended Execution: Subagent

This skill involves heavy screenshot capture and iterative comparison that can consume significant context. When possible, **execute as a subagent** to isolate the comparison work from the main implementation context. The subagent should:
1. Receive the Figma URL, device ID, and target screen description
2. Run the full comparison loop independently
3. Return the final report to the main agent

If subagent execution is not available, run inline but be aware of context usage.

## Design Token Reference

Before comparing, load `.claude/rules/figma-design-tokens.md` for VSDS → Android token mapping (colors, radius, typography, states).

## Core Workflow

### Phase 0: Download Figma Design Screenshots to Disk

Save Figma screenshots as **actual PNG files** for persistent reference and reproducible comparison.

**Method: Figma REST API with `FIGMA_PAT`** (available in `~/.zshrc`):

```bash
source ~/.zshrc
# Get download URL (batch max ~10 nodes per call to avoid timeout)
ENCODED_IDS=$(python3 -c "import urllib.parse; print(urllib.parse.quote('NODE_ID1,NODE_ID2'))")
RESPONSE=$(curl -s -H "X-Figma-Token: $FIGMA_PAT" \
  "https://api.figma.com/v1/images/{fileKey}?ids=${ENCODED_IDS}&format=png&scale=1")
# Parse JSON → download each URL with curl -o
```

**Save location:** `docs/dev/figma/{nn}-{title-slug}.png`

**Composite nodes:** Some Figma states use sibling nodes (e.g., popup overlay is separate from main window). Check the parent section's metadata with `get_metadata` to find sibling nodes. Calculate relative position offsets and composite with Python PIL:

```python
from PIL import Image
main = Image.open("main.png")
popup = Image.open("popup.png")
# offset = popup_position - main_position (from Figma metadata x,y)
main.paste(popup, (offset_x, offset_y))
main.save("composited.png")
```

**Fallback:** If `FIGMA_PAT` is not available, use `mcp__figma__get_screenshot` for inline viewing only (cannot save to disk).

### Phase 1: Examine Figma Design Screenshots

1. Parse the Figma URL to extract `fileKey` and `nodeId`
2. Read the downloaded PNG from `docs/dev/figma/` using the Read tool
3. If not yet downloaded, run Phase 0 first
4. Use `get_design_context` to read the **node tree** — identify every child element (icons, buttons, text, images) and their node IDs for individual comparison later
5. Use `mcp__figma__get_screenshot` for individual icon nodes (enlarged view for fill vs stroke comparison)

If the screenshot shows the wrong frame, ask the user to confirm.

### Phase 2: Build, Deploy, and Capture Device Screenshot

1. Build the project: `./gradlew assembleDebug` (or the appropriate build command)
2. Install on device: `adb install -r app/build/outputs/apk/debug/app-debug.apk`
3. Navigate to the target screen using mobile MCP tools:
   - `mobile_launch_app` to open the app
   - `mobile_click_on_screen_at_coordinates`, `mobile_swipe_on_screen` to navigate
   - `mobile_list_elements_on_screen` to locate interactive elements
4. Wait for animations to settle and content to load
5. Call `mobile_take_screenshot` — this is the **implementation result**

If the build fails, fix the build error before proceeding.

### Phase 3: Per-Element Comparison

This is the core of the skill. Do NOT do a single "overall glance" comparison. Go through each layer systematically, element by element.

---

#### Layer 1: Structure — REST API Mandatory

Compare the overall layout framework. **MUST use Figma REST API** (`/v1/files/:key/nodes`) to read exact numeric properties — NEVER rely on screenshot visual estimation for dp values.

```bash
source ~/.zshrc && curl -s -H "X-Figma-Token: $FIGMA_PAT" \
  "https://api.figma.com/v1/files/{fileKey}/nodes?ids={nodeId}&depth=3" \
  | python3 -m json.tool
```

Read these properties from the API response and compare directly against XML/drawable values:

| Check | Figma API field | Android XML field | How to verify |
|-------|----------------|-------------------|--------------|
| Corner radius | `cornerRadius` | `<corners android:radius="">` or `app:cardCornerRadius` | Exact dp match — past bug: 24dp used when Figma was 16dp |
| Border color | `strokes[0].color` (r,g,b 0-1 → hex) | `<stroke android:color="">` | Convert Figma float to hex, compare |
| Border thickness | `strokeWeight` | `<stroke android:width="">` | Exact dp match |
| Shadow | `effects[].type == "DROP_SHADOW"` | `android:elevation` | If Figma has shadow, verify Android elevation exists. **Check for known artifact**: `elevation` + rounded `outlineProvider` on `LinearLayout` can produce rectangular shadow remnants at corners — flag as WARN |
| Size | `absoluteBoundingBox.width/height` | `android:layout_width/height` | Exact dp match |
| Component hierarchy | Child nodes order | XML child elements order | Same sections in same order |
| Layout proportions | Child widths relative to parent | `layout_weight` or fixed dp | Split ratios match |
| Missing/extra elements | API child count vs XML child count | — | Any component in one but not the other |

**Known Android shadow artifacts to check:**
- `elevation` + `clipToOutline="true"` + rounded background → may show rectangular shadow at corners
- Fix: remove `elevation` or use `MaterialCardView` which handles this correctly

---

#### Layer 2: Colors

Compare every visible color, per element. Do NOT summarize as "colors look similar".

| Check | How to verify |
|-------|--------------|
| Background color (each section) | Read Figma fill hex -> compare to XML/code background |
| Text color (each text element) | Read Figma text fill -> compare to `android:textColor` |
| Button colors (background + text) | Check both normal and disabled states |
| Icon colors | Each icon's tint — see Layer 5 for detailed icon comparison |
| Divider/border colors | Read Figma stroke color |

When comparing colors: read the exact hex value from Figma using `get_design_context`. Do NOT eyeball "#333 vs #666" from screenshots — read the actual property values.

---

#### Layer 3: Spacing — Include Image Intrinsic Size Check

| Check | How to verify |
|-------|--------------|
| Padding (top/bottom/left/right) | Read Figma auto-layout padding -> compare to XML padding/margin |
| Element gap | Read Figma itemSpacing -> compare to XML margin between elements |
| Element alignment | Left/right/center — check `gravity` / `layout_gravity` in XML |
| Button/action alignment | Specifically check button groups (e.g., Cancel/Delete) for right-alignment if design shows right-aligned |
| **Image actual rendered size** | See "Image + Container Spacing Verification" below |

**Image + Container Spacing Verification (CRITICAL):**

When an image is inside a padded container with `scaleType="fitCenter"`, the actual rendered size may differ from the available space, causing **extra padding** invisible in code review.

**Verification steps:**
1. Get the PNG's pixel dimensions: `python3 -c "from PIL import Image; img=Image.open('path.png'); print(img.size)"`
2. Convert to dp: `pixel_size / density_scale` (xxhdpi=3, xhdpi=2, mdpi=1)
3. Calculate available space: `container_size - padding`
4. Calculate fitCenter rendered size: `scale = min(avail_w/img_w, avail_h/img_h); rendered = img * scale`
5. Compare rendered size against Figma child frame size
6. If `extra_padding > 2dp` → **FAIL** — image aspect ratio or container padding is wrong

**Common failure mode (past bug):**
- PNG was 500×680dp (full panel), XML added 34/40dp padding → available space 432×600
- fitCenter rendered image at 432×587.5dp → 6.2dp extra vertical padding
- Root cause: PNG already contained built-in margins, XML padding was redundant (double padding)

---

#### Layer 4: Typography

| Check | How to verify |
|-------|--------------|
| Font size (sp) | Read Figma fontSize -> compare to `android:textSize` |
| Font weight | Read Figma fontWeight -> compare to `android:textStyle` or `fontFamily` weight |
| Letter case | ALL CAPS vs sentence case — check `android:textAllCaps` |
| Text alignment | Left/center/right — check `android:textAlignment` |

---

#### Layer 5: Icons — CRITICAL LAYER (SVG Export Mandatory)

This is the most commonly failed layer. Every icon must be individually verified.
**Screenshot comparison alone is NOT sufficient** — icons that look vaguely similar at small sizes can be completely different icons (e.g., vertical WiFi arcs vs horizontal broadcast waves).

**For EACH icon visible in the design:**

1. **Get the icon's Figma node ID** from the node tree (Phase 1 step 4). Look for `data-name="vsds-icon/*"` entries.
2. **Export the icon as SVG** via Figma REST API — this is the ground truth, NOT a screenshot:
   ```bash
   source ~/.zshrc
   ENCODED_ID=$(python3 -c "import urllib.parse; print(urllib.parse.quote('NODE_ID'))")
   curl -s -H "X-Figma-Token: $FIGMA_PAT" \
     "https://api.figma.com/v1/images/{fileKey}?ids=${ENCODED_ID}&format=svg&svg_simplify_stroke=true" \
     | python3 -c "import json,sys; print(json.load(sys.stdin)['images'])"
   ```
   Then download the SVG URL and inspect the path data.
3. **Read the Android vector drawable** XML and compare path structure:
   - Count the number of `<path>` elements
   - Check `fillColor` vs `strokeColor` — filled paths vs stroke paths
   - Compare path shapes (arcs vs circles, horizontal vs vertical)
4. **Call `get_screenshot`** with the icon node ID for visual cross-check

**Compare these specific properties:**

| Property | What to check | How to verify | Common failure mode |
|----------|--------------|--------------|-------------------|
| **Fill vs Stroke** | Filled paths or stroke outlines? | SVG: `fill="white"` vs `stroke="white"` | Stroke icon used when Figma shows filled |
| **Path direction** | Horizontal, vertical, or radial? | Compare SVG path data orientation | Vertical WiFi arcs used when Figma shows horizontal broadcast waves |
| **Path count** | Same number of shapes? | Count `<path>` in SVG vs `<path>` in drawable | Missing arcs, extra decorations |
| **Color** | Exact hex color | SVG fill/stroke color vs drawable fillColor | #666 used when design specifies #333 |
| **Attached elements** | Underlines, boxes, circles, badges? | Check SVG for additional paths | Missing underline, missing ring around center dot |
| **Size (dp)** | Width and height match design | SVG viewBox vs drawable viewport | Icon scaled differently |
| **Visual identity** | Same icon concept? | Compare VSDS component name (`vsds-icon/broadcast`) with drawable filename (`ic_broadcast.xml`) | Entirely different icon |

**The standard is: the icon's SVG path structure matches the Figma export. If the drawable has stroke paths but the Figma SVG has filled paths, it is WRONG — even if the screenshot looks "close enough" at small sizes.**

Example of a FAIL that past reviews missed:
- Figma: `vsds-icon/broadcast` — horizontal radio waves `))•((`, 5 filled paths
- Device: `ic_broadcast.xml` — vertical WiFi arcs pointing up, 3 stroke paths + 1 filled dot
- Wrong judgment: "Pass — a signal icon exists on the red badge"
- Correct judgment: "FAIL — entirely different icon shape (horizontal vs vertical), wrong style (filled vs stroke), wrong path count (5 vs 4)"

---

#### Layer 6: Interaction States — CRITICAL LAYER

Past comparisons only checked the static "default" state. Figma often contains multiple frames showing different interaction states. **ALL states must be verified.**

**For EACH interactive component, check:**

| State | What to verify | Common failure mode |
|-------|---------------|-------------------|
| **Default** | Normal appearance matches Figma | — |
| **Selected/Active** | Border color/width, background highlight | Missing active border on dropdown; selected item using wrong bg color |
| **Disabled** | Grayed text, disabled icon, not clickable | Disabled items filtered out entirely instead of shown as disabled |
| **Loading** | Placeholder row, disabled buttons | No loading state shown during async operations |
| **Error** | Error border, error text color, toast position | Toast at top when Figma shows bottom; missing border stroke on error toast |
| **Focus** | Focus ring (e.g., 2dp blue border on active dropdown) | No focus/active state on dropdown button when popup is open |

**How to find all states in Figma:**
1. Use `get_metadata` on the parent section to list all sibling frames
2. Read the "UI documentation" nodes above each frame for state titles
3. Each frame typically represents one state — ensure all are covered

**Dropdown-specific states:**
- Default: 1dp neutral border
- Active (popup open): 2dp primary border (`color_3C5AAA`)
- Selected item in popup: bg `neutral_300` (#E5E5E5)
- Disabled/expired item: gray text (`neutral_500`) + expiry icon, not clickable
- Popup dismissed: revert to default border

---

#### Layer 7: Images & Illustrations

| Check | How to verify |
|-------|--------------|
| Image displayed correctly | Correct image/placeholder shown |
| Image colors | If cover/illustration, color matches design |
| Image corner radius | Rounded corners match design spec |
| Image border | White border / shadow present or absent as designed |
| Scale type | fitCenter vs centerCrop vs fitXY — matches intended display |
| Surrounding spacing | Margin/padding around image matches design |

---

### Phase 4: Generate Difference Report

Produce the report as a **table** — one row per checked element. Every element must appear.

```
# Visual Verify Report

**Figma:** [Figma URL]
**Device:** [Device ID]
**Screen:** [Screen name]
**Iteration:** [N]

## Verdict: [PASS / FAIL]

## Comparison Table

| # | Layer | Element | Design | Device | Result | Notes |
|---|-------|---------|--------|--------|--------|-------|
| 1 | Structure | Window corner radius | 12dp | 0dp (sharp) | FAIL | XML missing cornerRadius |
| 2 | Color | Header background | #FFFFFF | #F5F5F5 | FAIL | Wrong color in bg drawable |
| 3 | Color | Title text | #333333 | #333333 | Pass | |
| 4 | Spacing | Button group alignment | right-aligned | left-aligned | FAIL | Missing gravity="end" |
| 5 | Icon | Rename icon style | fill | stroke | FAIL | Wrong drawable asset |
| 6 | Icon | Rename icon color | #333333 | #666666 | FAIL | Wrong tint color |
| 7 | Icon | Rename icon decoration | underline | box | FAIL | Wrong icon variant |
| 8 | Icon | Delete icon style | stroke (outlined) | fill (solid red) | FAIL | Wrong drawable |
| 9 | Image | Cover image border | white 2dp border | no border | FAIL | Missing stroke in shape |
| ... | ... | ... | ... | ... | ... | ... |

## Summary
- **Total checks:** [N]
- **Pass:** [N]
- **Fail:** [N]

## Fix Plan (if any Fail)
1. [File path] — [What to change]
2. ...
```

### Verdict Rules

- **PASS**: Every row in the comparison table shows Pass
- **FAIL**: Any row shows FAIL

There is no severity grading — every discrepancy is a FAIL that must be fixed. The design is the specification; any deviation is wrong.

### Phase 5: Fix → Re-build → Re-verify — MANDATORY LOOP

**This loop is NOT optional. The agent MUST NOT stop or report completion until verdict is PASS.**

A single pass is rarely enough — fixes can introduce regressions, and first-pass comparisons may miss subtle issues. The loop continues until the FULL comparison table shows zero FAIL rows.

```
┌─────────────────────────────────────────────────┐
│                   VERIFY LOOP                    │
│                                                  │
│  ┌──────────┐    ┌──────────┐    ┌───────────┐  │
│  │ Compare  │───▶│ Verdict  │───▶│  PASS?    │  │
│  │ (Full)   │    │ Report   │    │           │  │
│  └──────────┘    └──────────┘    └─────┬─────┘  │
│       ▲                            NO  │  YES   │
│       │          ┌──────────┐          │   │    │
│       │          │ Fix ALL  │◀─────────┘   │    │
│       │          │ FAIL     │              │    │
│       │          └────┬─────┘              │    │
│       │               │                   │    │
│       │          ┌────▼─────┐              │    │
│       │          │ Re-build │              │    │
│       └──────────│ Install  │              │    │
│                  └──────────┘              │    │
│                                           ▼    │
│                                     ┌────────┐ │
│                                     │ DONE   │ │
│                                     └────────┘ │
└─────────────────────────────────────────────────┘
```

**Loop steps:**

1. **Fix ALL FAIL items** — not just the first one. Apply every fix before re-running.
2. **Re-build and re-deploy** to the device (`./gradlew app:installEdlaStagDebug` or appropriate variant)
3. **Navigate back** to the target screen on device
4. **Re-run the ENTIRE comparison from Phase 3** — ALL layers, ALL elements, ALL interaction states. Not just the items you fixed.
5. **Generate a new report** with incremented iteration number
6. **If still FAIL** → go to step 1
7. **If PASS** → report: "Visual verify PASSED after N iteration(s). All [X] elements match the Figma design."

**Stopping conditions:**
- ✅ **PASS**: All rows pass → done, report success
- ⏸ **PAUSE** (ask user): Fix is ambiguous, design unclear, or requires asset export from Figma that agent cannot do (e.g., replacing filled icon SVG)
- ❌ **NEVER stop on FAIL** — always attempt to fix and re-verify

**Max iterations safeguard:** If after 5 iterations the same items keep failing, pause and report to the user — there may be a fundamental misunderstanding of the design spec.

### Phase 4a: Interaction State Verification

After the static comparison, verify interaction states by **navigating** on the device:

1. **Identify all interactive elements** from the Figma flow (dropdown, buttons, dialogs)
2. **For each element**, trigger its interaction on the device (click dropdown, select item, etc.)
3. **Capture device screenshot** after each interaction
4. **Compare** against the corresponding Figma state frame (from Phase 0 screenshots)
5. **Include in the comparison table** with the state name (e.g., "Dropdown — active state")

Use `mobile_click_on_screen_at_coordinates` and `mobile_take_screenshot` from mobile MCP.

## Handling Dynamic Content

Device screens may show real or test data that differs from Figma's placeholder content. Focus comparison on **UI chrome** — layout, styling, colors, typography, spacing. Text content and data values are expected to differ and should not be flagged unless they cause layout issues (e.g., text overflow).

## NEVER

- **NEVER** judge an icon as Pass just because "an icon of the right type exists" — this is the #1 failure mode; compare exact style, color, variant, and decorations for every icon individually
- **NEVER** skip the per-icon Figma screenshot step — whole-frame screenshots are too small to distinguish fill vs stroke or detect attached decorations; always get enlarged individual icon screenshots
- **NEVER** eyeball color values — read exact hex from Figma node properties using `get_design_context`; "#333 vs #666" is invisible in a whole-frame screenshot but clearly wrong in code
- **NEVER** re-verify only the fixed items — fixes can cause regressions elsewhere; always re-run the full comparison table after each fix iteration
- **NEVER** give PASS when any FAIL exists — every discrepancy matters; "minor" visual bugs accumulate into an unprofessional UI that users notice
- **NEVER** compare without both actual screenshots loaded — comparing from memory or description produces inaccurate results
- **NEVER** skip the build+deploy step — comparing against stale APK defeats the purpose; always verify the latest code
- **NEVER** skip interaction state comparison — only checking the default/static state misses active borders, selected backgrounds, disabled styling, loading states, error toast position
- **NEVER** use `mcp__figma__get_screenshot` to save files — it returns inline images only; use `FIGMA_PAT` + REST API (`/v1/images`) to download PNGs to disk
- **NEVER** export Figma popup/overlay nodes separately — check parent section metadata for sibling overlay nodes and composite them onto the main frame using PIL

## Error Handling

| Scenario | Action |
|----------|--------|
| Figma URL invalid | Ask user to verify URL and Figma MCP connection |
| Device not connected | Run `mobile_list_available_devices`; ask user to connect |
| Build fails | Fix build error first, then resume |
| Cannot navigate to target screen | Ask user to navigate manually, then say "ready" |
| Figma node tree too complex to enumerate all icons | Ask user to provide specific icon node IDs, or use `get_design_context` to list children layer by layer |
| Icon node ID not found in Figma | Search by component name in the Figma node tree; ask user if ambiguous |
