#!/usr/bin/env python3
import json, uuid, zipfile, os, shutil

# (display text, font-family as stored by the Flutter picker / FONT_FAMILIES)
FONTS = [
    ("Arimo", "Arimo"), ("Tinos", "Tinos"), ("Cousine", "Cousine"),
    ("Carlito", "Carlito"), ("Caladea", "Caladea"), ("Gelasio", "Gelasio"),
    ("Comic Relief", "Comic Relief"),
    ("Roboto", "Roboto"), ("Open Sans", "open_sans"), ("Lato", "Lato"),
    ("Montserrat", "Montserrat"), ("Poppins", "Poppins"), ("Oswald", "Oswald"),
    ("Raleway", "Raleway"), ("Nunito", "Nunito"), ("Merriweather", "Merriweather"),
    ("Playfair Display", "Playfair Display"), ("Inter", "Inter"),
    ("Noto Sans", "Noto Sans"), ("PT Sans", "PT Sans"),
]

def uid():
    return str(uuid.uuid4())

page_id = uid()
elements = []
additional = []

COL_X = [360.0, 1440.0]
ROW_Y0 = 160.0
ROW_STEP = 130.0

def add_additional(ref):
    additional.append({"element": {
        "id": uid(), "ref": ref, "is-locked": False,
        "is-replicate": False, "is-moveable-locked": False,
    }})

for i, (disp, fam) in enumerate(FONTS):
    col = 0 if i < 10 else 1
    row = i % 10
    tx = COL_X[col]
    ty = ROW_Y0 + row * ROW_STEP

    # --- textarea ---
    ta_id = uid()
    txt_id = uid()
    para_id = uid()
    elements.append({"textarea": {
        "id": ta_id, "x": 0.0, "y": 0.0,
        "custom-data": "", "custom-data-tag": "",
        "width": 360.0, "height": 52.0,
        "matrix": f"1.0,0.0,{tx},0.0,1.0,{ty},0.0,0.0,1.0",
        "text-blocks-container": [{"paragraph": {
            "id": para_id, "font-size": 20.0, "text-align": "left",
            "text-list-container": [{"text": {
                "text": disp,
                "background-opacity": 1.0, "background": "#00FFFFFF",
                "baseline-align": "baseline",
                "fill-opacity": 1.0, "fill": "#FF000000",
                "font-family": fam, "font-size": 40.0,
                "font-style": "normal", "font-weight": "normal",
                "text-decoration": "normal", "id": txt_id,
            }}],
        }}],
    }})
    add_additional(ta_id)

    # --- underline stroke (horizontal line at text bottom edge) ---
    st_id = uid()
    line_y = ty + 60.0
    x0 = tx - 12.0
    x1 = tx + 233.0
    n = 12
    pts = " ".join(f"{x0 + (x1 - x0) * k / (n - 1):.1f},{line_y:.1f}" for k in range(n))
    elements.append({"stroke": {
        "id": st_id, "x": x0 - 4.0, "y": line_y - 4.0,
        "width": (x1 - x0) + 8.0, "height": 8.0,
        "stroke": "#000000", "opacity": 1.0,
        "pen-type": "pen", "pen-width": 8.0, "pen-height": 8.0,
        "is-highlighter": False, "is-auto-smoothing": True,
        "points": pts,
        "matrix": "1.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0,1.0",
    }})
    add_additional(st_id)

olf = {"olf": {
    "width": 2560, "height": 1600, "viewbox": "0 0 1280 800",
    "meta": {
        "id": uid(), "create-by-library": "", "create-library-version": "",
        "create-time": "2026/07/16/ 13:40:00", "create-version": "3.9.7-S",
        "create-platform": "Whiteboard for Android",
        "modify-time": "2026/07/16/ 13:40:00", "modify-version": "3.9.7-S",
        "modify-platform": "Whiteboard for Android",
        "description": "Viewsonic", "last-modify-users": "",
    },
    "pageset": [{"page": {
        "id": page_id,
        "matrix": "1.0,0.0,0.0,0.0,1.0,-94.5,0.0,0.0,1.0",
        "viewbox": "0 0 2560 1600", "is-hidden": False,
        "backgrounds": [{"background": {
            "id": uid(), "opacity": 1.0, "type": "color", "fill": "#FFFFFF"}}],
        "elements": elements, "tools": [],
    }}],
    "additional": additional,
}}

out_dir = os.path.dirname(os.path.abspath(__file__))
content_path = os.path.join(out_dir, "content.json")
with open(content_path, "w") as f:
    json.dump(olf, f, ensure_ascii=False)

# thumbnail: reuse the before OLF thumbnail bytes (cosmetic), named after page id
before = "/Users/jay.wj.wu/ProjectsWork_GitHub/jay-viewsonic-km/docs/repositories/Viewsonic-EDU/edu-droid-flutter/features/text-flutter-font-fallback-preinstall/fixtures/before/VSFT9208_before_4fonts.olf"
thumb_bytes = None
with zipfile.ZipFile(before) as z:
    for n in z.namelist():
        if n.startswith("thumbnails/"):
            thumb_bytes = z.read(n)

olf_path = os.path.join(out_dir, "VSFT9208_after_20fonts.olf")
with zipfile.ZipFile(olf_path, "w", zipfile.ZIP_STORED) as z:
    if thumb_bytes:
        z.writestr(f"thumbnails/{page_id}.png", thumb_bytes)
    z.writestr("content.json", open(content_path, "rb").read())

print("wrote", olf_path)
print("elements:", len(elements), "additional:", len(additional))
print("fonts:", [f[1] for f in FONTS])
