#!/bin/zsh
# orca.sh — 呼叫 Orca（ADE）的 CLI。
#
# **為什麼不直接用 `orca`**：`/usr/local/bin/orca` 是 root:wheel、權限 lrwx------
# 的 symlink，一般使用者讀不到 link target，於是它自己的路徑解析失敗：
#
#   $ orca --help
#   Unable to determine Orca.app path from symlink: /usr/local/bin/orca
#
# 修法是 `sudo chmod 755 /usr/local/bin/orca`，但不修也能用 —— 那支 launcher
# 本來就只是在算出 app 路徑後 exec 底下的 CLI，這裡直接做同一件事。
#
# 用法：./scripts/orca.sh <orca 的原本參數…>
#   ./scripts/orca.sh status --json
#   ./scripts/orca.sh repo list --json
#   ./scripts/orca.sh terminal create --worktree path:/x --command "claude" --json

set -euo pipefail

APP="${ORCA_APP:-/Applications/Orca.app}"
ELECTRON="$APP/Contents/MacOS/Orca"
CLI="$APP/Contents/Resources/app.asar.unpacked/out/cli/index.js"

[[ -x "$ELECTRON" ]] || { echo "找不到 Orca：$ELECTRON" >&2; exit 1; }
[[ -f "$CLI" ]] || { echo "找不到 Orca 的 CLI 入口：$CLI" >&2; exit 1; }

ELECTRON_RUN_AS_NODE=1 exec "$ELECTRON" "$CLI" "$@"
