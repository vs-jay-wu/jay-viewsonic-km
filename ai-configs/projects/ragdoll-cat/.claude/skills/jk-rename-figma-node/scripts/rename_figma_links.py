#!/usr/bin/env python3
"""
Rename Figma links on a Confluence page so display text becomes `node-id=XXXXX-XXXXX`.

Two modes:

1. Transform mode (default):
     python3 rename_figma_links.py --input <page.json> --output <payload.json>

   Reads a Confluence v2 API GET response (with body-format=atlas_doc_format),
   transforms every Figma link, and writes a ready-to-PUT payload to `--output`.

2. Verify mode:
     python3 rename_figma_links.py --verify <page.json>

   Reads a Confluence v2 API GET response and prints how many Figma inlineCards
   and text+link nodes remain, plus the first 10 display labels.
"""

import argparse
import json
import re
import sys
from urllib.parse import parse_qs, urlparse


def extract_node_id(url: str) -> str | None:
    """Return 'node-id=XXXXX-XXXXX' if the URL has a node-id query param, else None."""
    try:
        qs = parse_qs(urlparse(url).query)
        nid = qs.get("node-id", [None])[0]
        if nid:
            return f"node-id={nid}"
    except Exception:
        pass
    m = re.search(r"node-id=([^&]+)", url)
    return f"node-id={m.group(1)}" if m else None


def transform(node, preview: list) -> None:
    """Recursively mutate the ADF tree, swapping Figma links for short display labels."""
    if isinstance(node, list):
        for i, child in enumerate(node):
            replacement = _maybe_replace_inline_card(child, preview)
            if replacement is not None:
                node[i] = replacement
            else:
                transform(child, preview)
        return
    if not isinstance(node, dict):
        return

    if node.get("type") == "text":
        for mark in node.get("marks") or []:
            if isinstance(mark, dict) and mark.get("type") == "link":
                href = mark.get("attrs", {}).get("href", "")
                if "figma.com" in href:
                    label = extract_node_id(href)
                    if label:
                        preview.append(("text+link rename", href, label))
                        node["text"] = label
                    break

    for val in node.values():
        if isinstance(val, (list, dict)):
            transform(val, preview)


def _maybe_replace_inline_card(node, preview: list):
    """If `node` is a Figma inlineCard, return a text+link replacement, else None."""
    if not isinstance(node, dict) or node.get("type") != "inlineCard":
        return None
    url = node.get("attrs", {}).get("url", "")
    if "figma.com" not in url:
        return None
    label = extract_node_id(url)
    if not label:
        return None
    preview.append(("inlineCard→text+link", url, label))
    return {
        "type": "text",
        "text": label,
        "marks": [{"type": "link", "attrs": {"href": url}}],
    }


def cmd_transform(args) -> int:
    with open(args.input) as f:
        page = json.load(f)

    page_id = str(page["id"])
    title = page["title"]
    version = page["version"]["number"]
    body_value = page["body"]["atlas_doc_format"]["value"]
    adf = json.loads(body_value)

    preview: list = []
    transform(adf, preview)

    if not preview:
        print("No Figma links found on the page. Nothing to update.")
        return 2  # sentinel: caller should skip the PUT

    inline_count = sum(1 for kind, *_ in preview if kind.startswith("inlineCard"))
    text_count = sum(1 for kind, *_ in preview if kind.startswith("text+link"))

    print(f"Found {len(preview)} Figma link(s):")
    print(f"  - inlineCard → text+link : {inline_count}")
    print(f"  - text+link display rename: {text_count}")
    print()
    print("Preview (first 15):")
    for kind, url, label in preview[:15]:
        print(f"  [{kind}] {label}  ← {url[:100]}")
    if len(preview) > 15:
        print(f"  ... and {len(preview) - 15} more")

    payload = {
        "id": page_id,
        "status": "current",
        "title": title,
        "body": {
            "representation": "atlas_doc_format",
            "value": json.dumps(adf, ensure_ascii=False),
        },
        "version": {
            "number": version + 1,
            "message": "Shorten Figma link display text to node-id=XXXXX-XXXXX",
        },
    }
    with open(args.output, "w") as f:
        json.dump(payload, f, ensure_ascii=False)
    print()
    print(f"Payload written to {args.output} (next version: {version + 1})")
    return 0


def cmd_verify(args) -> int:
    with open(args.verify) as f:
        page = json.load(f)
    adf = json.loads(page["body"]["atlas_doc_format"]["value"])

    inline_count = 0
    text_count = 0
    labels: list = []

    def walk(n):
        nonlocal inline_count, text_count
        if isinstance(n, dict):
            if n.get("type") == "inlineCard":
                if "figma.com" in n.get("attrs", {}).get("url", ""):
                    inline_count += 1
            if n.get("type") == "text":
                for m in n.get("marks") or []:
                    if m.get("type") == "link" and "figma.com" in m.get("attrs", {}).get("href", ""):
                        text_count += 1
                        labels.append(n.get("text"))
            for v in n.values():
                walk(v)
        elif isinstance(n, list):
            for x in n:
                walk(x)

    walk(adf)
    print(f"Remaining Figma inlineCards: {inline_count}")
    print(f"Figma text+link nodes     : {text_count}")
    print(f"Page version               : {page['version']['number']}")
    if labels:
        print("Sample display texts:")
        for s in labels[:10]:
            print(f"  - {s}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", help="Path to Confluence v2 GET response JSON")
    parser.add_argument("--output", help="Path to write the v2 PUT payload JSON")
    parser.add_argument("--verify", help="Path to Confluence v2 GET response JSON to verify")
    args = parser.parse_args()

    if args.verify:
        return cmd_verify(args)
    if args.input and args.output:
        return cmd_transform(args)
    parser.error("Provide either --verify <file>, or both --input and --output")


if __name__ == "__main__":
    sys.exit(main())
