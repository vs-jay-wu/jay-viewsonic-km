#!/usr/bin/env python3
"""把 Material Icon Theme 的檔案圖示抓進 km web。

來源：https://github.com/material-extensions/vscode-material-icon-theme （MIT）

**釘在一個 commit 上**（下面的 `UPSTREAM_COMMIT`）。不追 main 的理由：
圖示與對照表會變，跟著動的話畫面會在沒人改過的情況下改變，而且對不出是哪一版。
要更新就改那個常數再跑一次，diff 會直接顯示這一版換了什麼。

**從本地 clone 讀，不要一個一個打 API。** 第一版是對每個猜到的名字打
`gh api contents/icons/<name>.svg`，結果一路撞 404（`folder.svg`、
`folder-ngrx-actions.svg` 都不存在），而且每次都要重猜。clone 下來之後
`icons/` 就是權威的檔案清單，對照表引用到不存在的名字也一眼看得出來。

產出 `web/lib/fileIconsData.ts`：SVG 內嵌成字串 ＋ 副檔名／檔名／資料夾的對照表。
內嵌而不是放 public/：一棵樹上百個檔案，走 HTTP 會是上百個請求與閃爍。

**只抓用得到的那些。** 上游有 904 個圖示，Jay 的工作區實際出現的副檔名
不到 40 種，全抓進 bundle 只是浪費。要加新的就往 `WANTED` 裡加。
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

REPO = "material-extensions/vscode-material-icon-theme"
UPSTREAM_COMMIT = "cb1dfb6d9cb73b15681a93939983d75dbba7bf5b"  # 2026-09-19
UPSTREAM_LICENSE = "MIT"

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "lib" / "fileIconsData.ts"

# 這個工作區實際會看到的東西（用 `git ls-files` 數出來的，不是憑印象列的）。
# 左邊是副檔名或完整檔名，對照到哪個圖示由上游的表決定。
WANTED_EXT = [
    "dart", "kt", "kts", "java", "swift", "ts", "tsx", "js", "jsx", "mjs", "cjs",
    "py", "rb", "go", "rs", "c", "h", "cpp", "hpp", "m", "mm", "sh", "zsh", "bash",
    "json", "yaml", "yml", "toml", "xml", "plist", "properties", "gradle", "podspec",
    "md", "mdx", "txt", "csv", "sql", "html", "css", "scss",
    "png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "pdf",
    "ttf", "otf", "woff", "woff2", "zip", "lock", "env", "log",
]
# ⚠️ **資料夾名單用上游的全部，不要拿工作區當樣本。**
#
# 第一版是用 `git ls-files` 的目錄層去交集，結果 `build`、`ide`、`azure_dev`
# 這些通通沒對到 —— 它們是 **gitignore 的目錄**，`ls-files` 當然看不到，
# 而檔案樹列的是**檔案系統**。樣本跟畫面看的不是同一個東西。
#
# 全收是 949 個名字 → 270 個圖示，比挑過的多約 110 KB；換掉的是一整類
# 「為什麼這個沒有圖示」的問題，划算。
#
WANTED_NAME = [
    "readme.md", "license", "package.json", "tsconfig.json", "dockerfile",
    "makefile", ".gitignore", ".gitattributes", "next.config.ts", "vitest.config.ts",
    "eslint.config.mjs", "postcss.config.mjs", ".eslintrc.json", "yarn.lock",
    "package-lock.json", "pnpm-lock.yaml", "settings.gradle", "build.gradle",
]
FALLBACK_FILE = "document"

# ⚠️ **預設資料夾圖示不在 `icons/` 裡，是打包時產生的。**
#
# `folderIcons.ts` 寫 `defaultIcon: { name: 'folder' }`，但那支 SVG 不存在；
# `folderGenerator.ts` 的 `generateFolderIcons(color)` 會用下面這兩條路徑、
# 填上設定的顏色即時產生。預設色是 `#90a4ae`（`defaultConfig.ts` 的
# `defaultColor`，blue-gray-300）。
#
# 照 `icons/folder-base.svg` 抓會拿到**咖啡色** `#8d6e63` —— 那是別的東西，
# 畫面上跟 VS Code 差很多（Jay 2026-09-23 兩張截圖比對出來的）。
FOLDER_COLOR = "#90a4ae"
FOLDER_PATH = (
    "m6.922 3.768-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 "
    "1-1V5a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232"
)
FOLDER_OPEN_PATH = (
    "M14.483 6H4.721a1 1 0 0 0-.949.684L2 12V5h12a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232l-.644-.536"
    "A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h11l2.403-5.606A1 1 0 0 0 14.483 6"
)
FALLBACK_FOLDER = "folder"
FOLDER_OPEN = "folder-open"


def clone_dir() -> Path:
    """把上游 clone 到快取目錄並切到釘住的 commit，回傳路徑。

    用 `--filter=blob:none`：整個 repo 的歷史含上千張圖，只要一個 commit 的內容。
    """
    d = Path.home() / ".cache" / "km" / "material-icon-theme"
    if not (d / ".git").is_dir():
        d.parent.mkdir(parents=True, exist_ok=True)
        print(f"clone 到 {d} …")
        subprocess.run(
            ["git", "clone", "--quiet", "--filter=blob:none",
             f"https://github.com/{REPO}.git", str(d)],
            check=True,
        )
    # 已經有了就確保拿得到那個 commit（釘的版本比本地新時要先 fetch）
    if subprocess.run(["git", "-C", str(d), "cat-file", "-e", f"{UPSTREAM_COMMIT}^{{commit}}"],
                      capture_output=True).returncode != 0:
        subprocess.run(["git", "-C", str(d), "fetch", "--quiet", "origin"], check=True)
    subprocess.run(["git", "-C", str(d), "checkout", "--quiet", UPSTREAM_COMMIT], check=True)
    return d


def parse_clone_bases(src: str) -> dict[str, str]:
    """圖示名 → 它 clone 自哪個圖示。

    上游有一整批圖示**沒有自己的 SVG**：它們在打包時從 `clone.base` 複製再換色
    （`folder-ngrx-actions` 就是 `folder-ngrx-store` 的紫色版）。實測 54 個名字
    在 `icons/` 找不到檔案，其中 49 個是這種。我們不做換色，直接用 base 的圖。
    """
    marks = [(m.start(), m.group(1)) for m in re.finditer(r"name:\s*'([^']+)'", src)]
    marks.append((len(src), ""))
    out: dict[str, str] = {}
    for i in range(len(marks) - 1):
        start, icon = marks[i]
        body = src[start:marks[i + 1][0]]
        m = re.search(r"clone:\s*\{[^}]*?base:\s*'([^']+)'", body, re.S)
        if m:
            out[icon] = m.group(1)
    return out


def parse_map(src: str) -> tuple[dict[str, str], dict[str, str]]:
    """從上游的 `fileIcons.ts` 解出「副檔名／檔名 → 圖示名」。

    ⚠️ **一筆一筆抓，不要用一個跨區塊的正則。** 第一版寫成
    `\\{ name: '(...)'(.*?)\\},`，非貪婪也還是會吃到隔壁的條目 ——
    解出來 `kt → rust`、`png → toml`、`js → palette`，而 `dart → dart`、
    `svg → svg` 這幾個剛好是對的，所以乍看之下很像成功了。
    """
    marks = [(m.start(), m.group(1)) for m in re.finditer(r"name:\s*'([^']+)'", src)]
    marks.append((len(src), ""))
    ext: dict[str, str] = {}
    name: dict[str, str] = {}
    for i in range(len(marks) - 1):
        start, icon = marks[i]
        body = src[start:marks[i + 1][0]]
        for key, target in (("fileExtensions", ext), ("fileNames", name)):
            m = re.search(key + r":\s*\[(.*?)\]", body, re.S)
            if not m:
                continue
            for v in re.findall(r"'([^']+)'", m.group(1)):
                target.setdefault(v, icon)
    return ext, name


def svg_body(raw: bytes) -> str:
    """只留 `<svg>` 裡面的內容，尺寸交給呼叫端決定。

    上游的圖示是**彩色**的（fill 寫死在 path 上），這正是它好認的原因，
    所以不要把顏色換成 `currentColor`。
    """
    s = raw.decode("utf8").strip()
    s = re.sub(r"<\?xml[^>]*\?>", "", s)
    m = re.search(r"<svg[^>]*viewBox=\"([^\"]+)\"[^>]*>(.*)</svg>", s, re.S)
    if not m:
        raise SystemExit(f"看不懂的 SVG：{s[:120]}")
    view_box, inner = m.group(1), m.group(2)
    return view_box, re.sub(r"\s+", " ", inner).strip()


def parse_folder_map(src: str) -> dict[str, str]:
    """`folderIcons.ts` → 「資料夾名 → 圖示名」。解法跟檔案那支一樣。"""
    marks = [(m.start(), m.group(1)) for m in re.finditer(r"name:\s*'([^']+)'", src)]
    marks.append((len(src), ""))
    out: dict[str, str] = {}
    for i in range(len(marks) - 1):
        start, icon = marks[i]
        body = src[start:marks[i + 1][0]]
        m = re.search(r"folderNames:\s*\[(.*?)\]", body, re.S)
        if not m:
            continue
        for v in re.findall(r"'([^']+)'", m.group(1)):
            out.setdefault(v, icon)
    return out


def main() -> None:
    d = clone_dir()
    icons_dir = d / "icons"
    have = {f.stem for f in icons_dir.glob("*.svg")}
    print(f"上游 {REPO} @ {UPSTREAM_COMMIT[:12]}（{len(have)} 個圖示檔）")

    file_src = (d / "src/core/icons/fileIcons.ts").read_text()
    folder_src = (d / "src/core/icons/folderIcons.ts").read_text()
    ext_map, name_map = parse_map(file_src)
    folder_map = parse_folder_map(folder_src)
    clone_base = {**parse_clone_bases(file_src), **parse_clone_bases(folder_src)}

    def resolve(icon: str) -> str | None:
        """圖示名 → 真的有檔案的圖示名。clone 就退回它的 base。"""
        seen = set()
        while icon and icon not in have and icon in clone_base and icon not in seen:
            seen.add(icon)
            icon = clone_base[icon]
        return icon if icon in have else None

    ext_out: dict[str, str] = {}
    name_out: dict[str, str] = {}
    folder_out: dict[str, str] = {}
    unmapped: list[str] = []
    unresolved: list[str] = []

    for keys, src_map, out, label in (
        (WANTED_EXT, ext_map, ext_out, "副檔名"),
        (WANTED_NAME, name_map, name_out, "檔名"),
        (sorted(folder_map), folder_map, folder_out, "資料夾"),
    ):
        for k in keys:
            icon = src_map.get(k)
            if not icon:
                unmapped.append(f"{label} {k}")
                continue
            real = resolve(icon)
            if not real:
                unresolved.append(f"{label} {k} → {icon}")
                continue
            out[k] = real

    needed = sorted({*ext_out.values(), *name_out.values(), *folder_out.values(),
                     FALLBACK_FILE})
    missing_files = [n for n in needed if n not in have]
    if missing_files:
        raise SystemExit(f"這些圖示在 icons/ 找不到檔案：{missing_files}")

    icons: dict[str, str] = {}
    view_boxes: dict[str, str] = {}
    for icon in needed:
        vb, inner = svg_body((icons_dir / f"{icon}.svg").read_bytes())
        view_boxes[icon] = vb
        icons[icon] = inner

    # 預設資料夾：照上游 `generateFolderIcons` 的做法即時產生（見上面的註解）
    for name, path_d in ((FALLBACK_FOLDER, FOLDER_PATH), (FOLDER_OPEN, FOLDER_OPEN_PATH)):
        icons[name] = f'<path d="{path_d}" fill="{FOLDER_COLOR}"/>'
        view_boxes[name] = "0 0 16 16"

    lines = [
        "// 這個檔案是產生出來的，不要手改 —— 跑 `scripts/fetch-material-icons.py`。",
        "//",
        f"// 圖示來自 {REPO}（{UPSTREAM_LICENSE}），",
        f"// 釘在 commit {UPSTREAM_COMMIT}。",
        "// 對照表也是從那一版的 `src/core/icons/` 解出來的，所以圖示與對照永遠是同一版。",
        "// 要更新就改腳本裡的 UPSTREAM_COMMIT 再跑一次。",
        "",
        "/** 圖示名 → `<svg>` 裡面的內容（**彩色**，不要換成 currentColor） */",
        "export const ICON_SVG: Record<string, string> = "
        + json.dumps(icons, ensure_ascii=False, indent=2) + ";",
        "",
        "/** 圖示名 → viewBox */",
        "export const ICON_VIEWBOX: Record<string, string> = "
        + json.dumps(view_boxes, ensure_ascii=False, indent=2) + ";",
        "",
        "/** 副檔名（小寫，不含點）→ 圖示名 */",
        "export const EXT_ICON: Record<string, string> = "
        + json.dumps(ext_out, ensure_ascii=False, indent=2) + ";",
        "",
        "/** 完整檔名（小寫）→ 圖示名。比副檔名優先 */",
        "export const NAME_ICON: Record<string, string> = "
        + json.dumps(name_out, ensure_ascii=False, indent=2) + ";",
        "",
        "/**",
        " * 資料夾名（小寫，**開頭的點已去掉**）→ 圖示名。",
        " *",
        " * 上游就是這樣對的：表裡寫 `github`，`.github` 也吃同一個圖示。",
        " */",
        "export const FOLDER_ICON: Record<string, string> = "
        + json.dumps(folder_out, ensure_ascii=False, indent=2) + ";",
        "",
        f'export const FALLBACK_FILE_ICON = "{FALLBACK_FILE}";',
        f'export const FALLBACK_FOLDER_ICON = "{FALLBACK_FOLDER}";',
        f'export const FOLDER_OPEN_ICON = "{FOLDER_OPEN}";',
        f'export const UPSTREAM_COMMIT = "{UPSTREAM_COMMIT}";',
        "",
    ]
    OUT.write_text("\n".join(lines), encoding="utf8")
    print(f"寫入 {OUT.relative_to(ROOT)}：{len(icons)} 個圖示、{len(ext_out)} 個副檔名、"
          f"{len(name_out)} 個檔名、{len(folder_out)} 個資料夾")
    if unmapped:
        print("上游沒有對照（會用預設圖示）：" + "、".join(unmapped))
    if unresolved:
        print("對照到的圖示找不到檔案（連 clone 的 base 都沒有）：" + "、".join(unresolved))


if __name__ == "__main__":
    sys.exit(main())
