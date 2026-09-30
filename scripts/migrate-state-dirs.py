#!/usr/bin/env python3
"""把 data/local-state/ 依歸屬搬到 data/hub/ 與 data/machine/。

一次性的：多機器設計（docs/ideas/km-multi-machine.md §5）要求「誰擁有哪筆狀態」
在檔案系統上就看得出來，否則換 hub 時不知道該搬什麼。

歸屬的唯一真相是 web/lib/statePaths.ts 的 STATE_OWNER，這支腳本**讀那個檔**，
不自己維護第二份清單 —— 兩份一定會漂移，而且漂移時沒有徵兆。

用法：
    ./scripts/migrate-state-dirs.py            # 只看會搬什麼
    ./scripts/migrate-state-dirs.py --apply    # 真的搬
"""

import re
import shutil
import sys
from pathlib import Path

KM_ROOT = Path(__file__).resolve().parent.parent
LEGACY = KM_ROOT / "data" / "local-state"
OWNER_TS = KM_ROOT / "web" / "lib" / "statePaths.ts"
# 對照組：解析出來少於這個數就是 regex 壞了，不是真的只有這麼少
MIN_ENTRIES = 20


def load_owners() -> dict[str, str]:
    src = OWNER_TS.read_text()
    block = re.search(r"export const STATE_OWNER[^{]*\{(.*?)\n\};", src, re.S)
    if not block:
        sys.exit(f"讀不到 STATE_OWNER：{OWNER_TS}")
    owners = dict(re.findall(r'"([^"]+)":\s*"(hub|machine|cache)"', block.group(1)))
    if len(owners) < MIN_ENTRIES:
        sys.exit(f"只解析到 {len(owners)} 筆歸屬，遠少於預期 —— 先確認 regex 還對得上")
    return owners


def main() -> None:
    apply = "--apply" in sys.argv
    owners = load_owners()

    if not LEGACY.is_dir():
        print(f"沒有 {LEGACY}，不用搬。")
        return

    moves, unknown, conflicts = [], [], []
    for item in sorted(LEGACY.iterdir()):
        owner = owners.get(item.name)
        if not owner:
            unknown.append(item.name)
            continue
        dest = KM_ROOT / "data" / owner / item.name
        (conflicts if dest.exists() else moves).append((item, dest))

    for src, dest in moves:
        print(f"  {src.name}  →  data/{dest.parent.name}/")
        if apply:
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src), str(dest))

    if conflicts:
        print("\n⚠️ 目的地已經有檔案（server 跑著的時候已經寫過新的），保留新的、舊的留在原地：")
        for src, dest in conflicts:
            print(f"  {src} （新的在 data/{dest.parent.name}/）")

    if unknown:
        print("\n⚠️ 沒登記歸屬，沒有搬：")
        for name in unknown:
            print(f"  {name}  ← 去 web/lib/statePaths.ts 的 STATE_OWNER 加一行再跑一次")

    if apply:
        if not any(LEGACY.iterdir()):
            LEGACY.rmdir()
            print(f"\n搬完 {len(moves)} 個，data/local-state/ 已清空並移除。")
        else:
            print(f"\n搬完 {len(moves)} 個，data/local-state/ 還有東西沒處理（見上）。")
    else:
        print(f"\n（預演）共 {len(moves)} 個會搬。加 --apply 才會真的動。")


if __name__ == "__main__":
    main()
