#!/usr/bin/env python3
"""從 `web/components/Icon.tsx` 產出文件用的 favicon SVG。

**為什麼要用產的、不是手抄**：手抄一份就是兩個真相來源，Icon.tsx 改了圖示之後
favicon 不會跟著變，而且**沒有任何徵兆**（清單上是新的、分頁上是舊的）。
`web/test/docFavicons.test.ts` 會重跑同一段擷取並比對磁碟上的檔，漂移就會變紅。

跑法：./scripts/gen-doc-favicons.py
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ICON_TSX = ROOT / "web/components/Icon.tsx"
OUT_DIR = ROOT / "docs/assets/icons"

# 產哪些：`docsRules.ts` 的 KIND_ICON ∪ SUBJECT_ICON。
# 多產幾個沒關係（檔案很小），少產才會出事 —— 文件標了某個主題卻沒有對應的 svg。
NAMES = [
    # kind
    "layers", "target", "search", "clipboard", "check", "flask",
    "bug", "chart", "handoff", "book", "help", "archive",
    # subject
    "slides", "font", "package", "window", "pen", "quiz", "license", "code", "repos",
]


def extract(src: str, name: str) -> str:
    """把 `name: <>…</>,` 裡的 JSX 片段挖出來。

    子元素用的屬性（d / cx / cy / r / x / y / width / height / rx）在 JSX 與 SVG
    是同一套拼法，所以原樣搬即可；只有外層 svg 的 strokeWidth 那類要另外寫。
    """
    m = re.search(rf"^\s+{re.escape(name)}: <>(.*?)</>,\s*$", src, re.M | re.S)
    if not m:
        raise SystemExit(f"Icon.tsx 裡找不到 `{name}`")
    return m.group(1).strip()


def svg(body: str) -> str:
    """包成獨立的 SVG。

    **顏色不能用 currentColor** —— favicon 沒有繼承來源。用 SVG 內嵌的
    `prefers-color-scheme`，這樣淺色與深色的瀏覽器分頁列都看得見
    （Chrome / Firefox 支援；Safari 走 fallback 的深色，在淺底上仍然可讀）。
    """
    # `currentColor` 在獨立的 SVG 裡沒有繼承來源，會退成黑色 —— 換成同一個變數。
    body = body.replace("currentColor", "var(--c)")
    # 顏色放在**根節點的 presentation attribute** 上讓子元素繼承，不要用
    # `* { stroke: … }` —— CSS 規則的優先序高於 presentation attribute，
    # 會蓋掉子元素自己寫的 `stroke="none"`（實心點被畫上外框）。
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"\n'
        '     fill="none" stroke="var(--c)" stroke-width="1.8"\n'
        '     stroke-linecap="round" stroke-linejoin="round">\n'
        "  <style>\n"
        "    svg { --c: #333333 }\n"
        "    @media (prefers-color-scheme: dark) { svg { --c: #e8e8e8 } }\n"
        "  </style>\n"
        f"  {body}\n"
        "</svg>\n"
    )


def build() -> dict[str, str]:
    src = ICON_TSX.read_text()
    return {n: svg(extract(src, n)) for n in NAMES}


if __name__ == "__main__":
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    files = build()
    changed = 0
    for name, content in files.items():
        p = OUT_DIR / f"{name}.svg"
        if not p.exists() or p.read_text() != content:
            p.write_text(content)
            changed += 1
    # 清掉不該存在的（名字從 NAMES 拿掉時）
    extra = [p for p in OUT_DIR.glob("*.svg") if p.stem not in files]
    for p in extra:
        p.unlink()
    print(f"產出 {len(files)} 個，更新 {changed} 個，清掉 {len(extra)} 個 → {OUT_DIR}")
    sys.exit(0)
