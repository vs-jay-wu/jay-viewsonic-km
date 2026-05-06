#!/usr/bin/env python3
"""
Figma Spec Extractor — Extract structured UI specs from Figma REST API.

Usage:
    python3 extract_figma_spec.py <file_key> <node_ids> [--output-dir <dir>] [--depth <n>] [--download-assets]

Arguments:
    file_key        Figma file key (from URL)
    node_ids        Comma-separated node IDs (e.g., "2636:101308,2636:101309")
    --output-dir    Output directory (default: docs/dev/figma/spec)
    --depth         API depth for node tree (default: 8)
    --download-assets  Also download icon SVGs and image PNGs

Requires FIGMA_PAT environment variable.
"""

import json
import os
import sys
import subprocess
import urllib.parse
import re
from pathlib import Path


def hex_color(c, opacity=1.0):
    """Convert Figma RGBA (0-1) to hex string."""
    r, g, b = int(c['r'] * 255), int(c['g'] * 255), int(c['b'] * 255)
    a = c.get('a', 1.0) * opacity
    hex_str = f"#{r:02X}{g:02X}{b:02X}"
    if a < 0.99:
        hex_str += f" ({a:.0%})"
    return hex_str


def fetch_nodes(file_key, node_ids, depth=8):
    """Fetch node data from Figma REST API."""
    token = os.environ.get('FIGMA_PAT')
    if not token:
        print("ERROR: FIGMA_PAT not set in environment", file=sys.stderr)
        sys.exit(1)

    encoded_ids = urllib.parse.quote(node_ids)
    url = f"https://api.figma.com/v1/files/{file_key}/nodes?ids={encoded_ids}&depth={depth}"
    result = subprocess.run(
        ['curl', '-s', '-H', f'X-Figma-Token: {token}', url],
        capture_output=True, text=True
    )
    return json.loads(result.stdout)


def fetch_image_urls(file_key, node_ids, fmt='svg', scale=1):
    """Get export URLs for nodes."""
    token = os.environ.get('FIGMA_PAT')
    encoded_ids = urllib.parse.quote(node_ids)
    url = f"https://api.figma.com/v1/images/{file_key}?ids={encoded_ids}&format={fmt}&scale={scale}"
    result = subprocess.run(
        ['curl', '-s', '-H', f'X-Figma-Token: {token}', url],
        capture_output=True, text=True
    )
    data = json.loads(result.stdout)
    return data.get('images', {})


def is_illustration(node, depth):
    """Detect illustration groups (many vectors, not UI)."""
    if depth <= 1:
        return False
    children = node.get('children', [])
    if not children:
        return False
    vec_count = sum(1 for c in children if c['type'] in ('VECTOR', 'GROUP', 'BOOLEAN_OPERATION'))
    return vec_count > 5


def extract_fills(node):
    """Extract visible solid fills."""
    fills = []
    for f in node.get('fills', []):
        if f.get('visible', True) and f.get('type') == 'SOLID' and f.get('color'):
            fills.append(hex_color(f['color'], f.get('opacity', 1)))
    return fills


def extract_strokes(node):
    """Extract visible strokes."""
    strokes = []
    for s in node.get('strokes', []):
        if s.get('visible', True) and s.get('type') == 'SOLID' and s.get('color'):
            strokes.append({
                'color': hex_color(s['color']),
                'weight': node.get('strokeWeight', '?')
            })
    return strokes


def extract_text_style(node):
    """Extract typography properties from TEXT node."""
    if node['type'] != 'TEXT':
        return None
    style = node.get('style', {})
    return {
        'family': style.get('fontFamily', ''),
        'weight': style.get('fontWeight', ''),
        'size': style.get('fontSize', ''),
        'lineHeight': round(style.get('lineHeightPx', 0), 1),
        'letterSpacing': round(style.get('letterSpacing', 0), 2),
        'align': style.get('textAlignHorizontal', ''),
        'text': node.get('characters', '')[:50],
    }


def extract_spacing(node):
    """Extract auto-layout spacing properties."""
    spacing = {}
    if 'paddingLeft' in node:
        spacing['padding'] = {
            'top': node.get('paddingTop', 0),
            'right': node.get('paddingRight', 0),
            'bottom': node.get('paddingBottom', 0),
            'left': node.get('paddingLeft', 0),
        }
    if node.get('itemSpacing', 0) > 0:
        spacing['gap'] = node['itemSpacing']
    if 'layoutMode' in node:
        spacing['direction'] = node['layoutMode']  # HORIZONTAL or VERTICAL
    if 'primaryAxisSizingMode' in node:
        spacing['mainAxis'] = node['primaryAxisSizingMode']
    if 'counterAxisSizingMode' in node:
        spacing['crossAxis'] = node['counterAxisSizingMode']
    return spacing


def extract_effects(node):
    """Extract visible effects (shadows, blur)."""
    effects = []
    for e in node.get('effects', []):
        if not e.get('visible', True):
            continue
        etype = e['type']
        if etype == 'DROP_SHADOW':
            color = e.get('color', {})
            effects.append({
                'type': 'shadow',
                'color': hex_color(color) if color else '?',
                'offset': e.get('offset', {}),
                'blur': e.get('radius', 0),
            })
        else:
            effects.append({'type': etype})
    return effects


def node_to_spec(node, depth=0, max_depth=8, icon_nodes=None, image_nodes=None):
    """Recursively extract spec from a node tree."""
    if depth > max_depth:
        return None
    if icon_nodes is None:
        icon_nodes = []
    if image_nodes is None:
        image_nodes = []

    name = node.get('name', '')
    ntype = node['type']
    nid = node.get('id', '')

    # Skip deep vectors (illustration internals)
    if ntype == 'VECTOR' and depth > 3:
        return None
    if is_illustration(node, depth):
        bb = node.get('absoluteBoundingBox', {})
        return {
            'type': 'ILLUSTRATION',
            'name': name,
            'id': nid,
            'size': f"{bb.get('width', 0):.0f}×{bb.get('height', 0):.0f}",
            'note': 'Export as image asset',
        }

    bb = node.get('absoluteBoundingBox', {})
    spec = {
        'type': ntype,
        'name': name,
        'id': nid,
        'size': f"{bb.get('width', 0):.0f}×{bb.get('height', 0):.0f}",
    }

    # Fills
    fills = extract_fills(node)
    if fills:
        spec['fill'] = fills

    # Strokes
    strokes = extract_strokes(node)
    if strokes:
        spec['stroke'] = strokes

    # Corner radius
    cr = node.get('cornerRadius', 0)
    if cr:
        spec['radius'] = round(cr, 1)

    # Spacing
    spacing = extract_spacing(node)
    if spacing:
        spec['spacing'] = spacing

    # Typography
    text_style = extract_text_style(node)
    if text_style:
        spec['text'] = text_style

    # Effects
    effects = extract_effects(node)
    if effects:
        spec['effects'] = effects

    # Visibility
    if node.get('visible') == False:
        spec['hidden'] = True
    if node.get('opacity', 1) < 1:
        spec['opacity'] = round(node['opacity'], 2)

    # Track icons and images for asset download
    if ntype == 'INSTANCE' and name.startswith('vsds-icon/'):
        icon_nodes.append({'id': nid, 'name': name})
    if ntype in ('RECTANGLE', 'FRAME') and any(
        f.get('type') == 'IMAGE' for f in node.get('fills', [])
    ):
        image_nodes.append({'id': nid, 'name': name})

    # Children
    children_specs = []
    for child in node.get('children', []):
        child_spec = node_to_spec(child, depth + 1, max_depth, icon_nodes, image_nodes)
        if child_spec:
            children_specs.append(child_spec)
    if children_specs:
        spec['children'] = children_specs

    return spec


def spec_to_markdown(spec, depth=0):
    """Convert spec dict to readable markdown."""
    lines = []
    indent = '  ' * depth
    ntype = spec['type']
    name = spec['name']
    size = spec['size']

    # Main line
    line = f"{indent}- **{ntype}** `{name}` {size}"
    if spec.get('hidden'):
        line += " `HIDDEN`"
    lines.append(line)

    # Properties
    props = []
    if 'fill' in spec:
        props.append(f"fill: {', '.join(spec['fill'])}")
    if 'stroke' in spec:
        for s in spec['stroke']:
            props.append(f"stroke: {s['color']} w={s['weight']}")
    if 'radius' in spec:
        props.append(f"radius: {spec['radius']}")
    if 'spacing' in spec:
        sp = spec['spacing']
        parts = []
        if 'padding' in sp:
            p = sp['padding']
            parts.append(f"pad: {p['top']:.0f}/{p['right']:.0f}/{p['bottom']:.0f}/{p['left']:.0f}")
        if 'gap' in sp:
            parts.append(f"gap: {sp['gap']:.0f}")
        if 'direction' in sp:
            parts.append(sp['direction'])
        props.extend(parts)
    if 'text' in spec:
        t = spec['text']
        props.append(f"font: {t['family']} w{t['weight']} {t['size']}px lh={t['lineHeight']}px")
        if t['letterSpacing']:
            props.append(f"ls: {t['letterSpacing']}px")
        props.append(f"text: \"{t['text']}\"")
    if 'effects' in spec:
        for e in spec['effects']:
            if e['type'] == 'shadow':
                props.append(f"shadow: blur={e['blur']}")
            else:
                props.append(e['type'])
    if 'opacity' in spec:
        props.append(f"opacity: {spec['opacity']}")

    if props:
        lines.append(f"{indent}  > {' · '.join(props)}")

    # Children
    for child in spec.get('children', []):
        lines.extend(spec_to_markdown(child, depth + 1))

    return lines


def extract_color_table(spec, colors=None):
    """Collect all unique colors used in the spec tree."""
    if colors is None:
        colors = {}

    for fill in spec.get('fill', []):
        hex_val = fill.split(' ')[0]  # Strip opacity annotation
        colors[hex_val] = colors.get(hex_val, set())
        colors[hex_val].add(f"{spec['name']} fill")

    for stroke in spec.get('stroke', []):
        hex_val = stroke['color'].split(' ')[0]
        colors[hex_val] = colors.get(hex_val, set())
        colors[hex_val].add(f"{spec['name']} stroke")

    if 'text' in spec:
        for fill in spec.get('fill', []):
            hex_val = fill.split(' ')[0]
            colors[hex_val] = colors.get(hex_val, set())
            colors[hex_val].add(f"{spec['name']} text")

    for child in spec.get('children', []):
        extract_color_table(child, colors)

    return colors


def extract_typography_table(spec, fonts=None, seen=None):
    """Collect unique visible text styles (skip hidden tooltips/labels)."""
    if fonts is None:
        fonts = []
    if seen is None:
        seen = set()

    # Skip hidden elements and their children
    if spec.get('hidden'):
        return fonts

    if 'text' in spec:
        t = spec['text']
        # Skip generic VSDS internal text (tooltips, hidden labels)
        if t['text'] in ('Tooltip', 'Button', 'Center', '') or spec['name'] in ('text', 'label-text'):
            pass
        else:
            key = f"{t['family']}_{t['weight']}_{t['size']}_{t['text'][:15]}"
            if key not in seen:
                seen.add(key)
                fonts.append({
                    'element': spec['name'],
                    'family': t['family'],
                    'weight': t['weight'],
                    'size': t['size'],
                    'lineHeight': t['lineHeight'],
                    'letterSpacing': t['letterSpacing'],
                    'text': t['text'][:25],
                })

    for child in spec.get('children', []):
        extract_typography_table(child, fonts, seen)

    return fonts


def extract_icon_list(spec, icons=None, seen_names=None):
    """Collect unique VSDS icon instances (deduplicate by name)."""
    if icons is None:
        icons = []
    if seen_names is None:
        seen_names = set()

    if spec['type'] == 'INSTANCE' and spec['name'].startswith('vsds-icon/'):
        if spec['name'] not in seen_names:
            seen_names.add(spec['name'])
            icons.append({'name': spec['name'], 'id': spec['id'], 'size': spec['size']})

    for child in spec.get('children', []):
        extract_icon_list(child, icons, seen_names)

    return icons


def generate_report(node_id, spec, file_key):
    """Generate a complete markdown report."""
    lines = []
    name = spec['name']

    lines.append(f"# Figma Spec: {name}")
    lines.append(f"")
    lines.append(f"**Node ID:** `{node_id}`")
    lines.append(f"**File Key:** `{file_key}`")
    lines.append(f"**Figma URL:** https://www.figma.com/design/{file_key}?node-id={node_id.replace(':', '-')}")
    lines.append(f"")

    # Structure tree
    lines.append("## Structure Tree")
    lines.append("")
    lines.extend(spec_to_markdown(spec))
    lines.append("")

    # Color table
    colors = extract_color_table(spec)
    if colors:
        lines.append("## Color Table")
        lines.append("")
        lines.append("| Hex | Used By |")
        lines.append("|-----|---------|")
        for hex_val, usages in sorted(colors.items()):
            usage_str = ', '.join(sorted(usages)[:3])
            if len(usages) > 3:
                usage_str += f" (+{len(usages)-3})"
            lines.append(f"| `{hex_val}` | {usage_str} |")
        lines.append("")

    # Typography table
    fonts = extract_typography_table(spec)
    if fonts:
        lines.append("## Typography")
        lines.append("")
        lines.append("| Element | Font | Weight | Size | Line Height | Letter Spacing | Sample |")
        lines.append("|---------|------|--------|------|-------------|----------------|--------|")
        for f in fonts:
            if f.get('element', '').endswith(('tooltip', 'label-text')) and spec.get('hidden'):
                continue  # Skip hidden tooltip text
            lines.append(
                f"| {f['element']} | {f['family']} | {f['weight']} | {f['size']}px | "
                f"{f['lineHeight']}px | {f['letterSpacing']}px | \"{f['text']}\" |"
            )
        lines.append("")

    # Icon list
    icons = extract_icon_list(spec)
    if icons:
        lines.append("## Icons (VSDS)")
        lines.append("")
        lines.append("| Icon Name | Node ID | Size |")
        lines.append("|-----------|---------|------|")
        for icon in icons:
            lines.append(f"| `{icon['name']}` | `{icon['id']}` | {icon['size']} |")
        lines.append("")

    return '\n'.join(lines)


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Extract Figma UI specs via REST API')
    parser.add_argument('file_key', help='Figma file key')
    parser.add_argument('node_ids', help='Comma-separated node IDs')
    parser.add_argument('--output-dir', default='docs/dev/figma/spec', help='Output directory')
    parser.add_argument('--depth', type=int, default=8, help='API depth')
    parser.add_argument('--download-assets', action='store_true', help='Download icon SVGs and image PNGs')
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    node_ids_list = [nid.strip() for nid in args.node_ids.split(',')]

    # Batch max 5 nodes per API call to avoid timeout
    batch_size = 5
    all_data = {}
    for i in range(0, len(node_ids_list), batch_size):
        batch = node_ids_list[i:i + batch_size]
        batch_str = ','.join(batch)
        print(f"Fetching nodes {i+1}-{min(i+batch_size, len(node_ids_list))} of {len(node_ids_list)}...",
              file=sys.stderr)
        data = fetch_nodes(args.file_key, batch_str, args.depth)
        if 'nodes' in data:
            all_data.update(data['nodes'])
        elif 'err' in data:
            print(f"ERROR: {data['err']}", file=sys.stderr)
            sys.exit(1)

    all_icons = []

    for node_id in node_ids_list:
        node_data = all_data.get(node_id, {}).get('document')
        if not node_data:
            print(f"WARNING: Node {node_id} not found in response", file=sys.stderr)
            continue

        icon_nodes = []
        image_nodes = []
        spec = node_to_spec(node_data, icon_nodes=icon_nodes, image_nodes=image_nodes)
        if not spec:
            continue

        all_icons.extend(icon_nodes)

        report = generate_report(node_id, spec, args.file_key)
        safe_name = re.sub(r'[^\w\-]', '_', spec['name'])
        out_path = output_dir / f"{node_id.replace(':', '-')}_{safe_name}.md"
        out_path.write_text(report)
        print(f"  → {out_path}", file=sys.stderr)

    # Download assets
    if args.download_assets and all_icons:
        asset_dir = output_dir.parent / 'assets' / 'icons'
        asset_dir.mkdir(parents=True, exist_ok=True)
        icon_ids = ','.join(i['id'] for i in all_icons)
        print(f"\nDownloading {len(all_icons)} icon SVGs...", file=sys.stderr)
        urls = fetch_image_urls(args.file_key, icon_ids, fmt='svg')
        for icon in all_icons:
            url = urls.get(icon['id'])
            if url:
                safe = icon['name'].replace('/', '_').replace(' ', '_')
                path = asset_dir / f"{safe}.svg"
                subprocess.run(['curl', '-s', '-o', str(path), url])
                print(f"  → {path}", file=sys.stderr)

    print(f"\nDone. {len(node_ids_list)} spec(s) saved to {output_dir}", file=sys.stderr)


if __name__ == '__main__':
    main()
