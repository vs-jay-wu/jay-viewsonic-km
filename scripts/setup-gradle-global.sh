#!/bin/zsh
# 套用 Gradle 全域（user home）建置優化設定。
#
# 這支腳本只動 ~/.gradle/ 底下的檔案，不碰任何 repo：
#   ~/.gradle/gradle.properties          → build cache / 平行建置 / daemon 記憶體
#   ~/.gradle/init.d/cache-cleanup.gradle → 自動清理沒在用的 Gradle 版本與 wrapper
#
# 冪等：重跑不會重複寫入。已存在但值不同的 key 會被更新（並顯示 diff）。
#
# 用法：
#   ./scripts/setup-gradle-global.sh              套用
#   ./scripts/setup-gradle-global.sh --dry-run    只看會改什麼
#   ./scripts/setup-gradle-global.sh --status     只看目前 ~/.gradle 佔用狀況

set -euo pipefail

GRADLE_HOME="${GRADLE_USER_HOME:-$HOME/.gradle}"
PROPS="$GRADLE_HOME/gradle.properties"
INIT_DIR="$GRADLE_HOME/init.d"
INIT_SCRIPT="$INIT_DIR/cache-cleanup.gradle"

DRY_RUN=0
STATUS_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --dry-run|-n) DRY_RUN=1 ;;
    --status|-s)  STATUS_ONLY=1 ;;
    --help|-h)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

# ── 想要的 gradle.properties 設定 ────────────────────────────────────────────
# key=value，逐行套用（存在則更新，不存在則附加）
typeset -a DESIRED
DESIRED=(
  "org.gradle.caching=true"       # 開啟 build cache：跨 worktree / 跨 repo 重用 task 產物
  "org.gradle.parallel=true"      # 多模組平行建置
  "org.gradle.daemon=true"        # 保留 daemon（預設就是 true，明寫避免被別處關掉）
)

status() {
  echo "── ~/.gradle 佔用狀況 ──────────────────────────────"
  du -sh "$GRADLE_HOME" 2>/dev/null || true
  echo
  echo "  version-specific caches（每個是一個用過的 Gradle 版本）:"
  du -sh "$GRADLE_HOME"/caches/[0-9]* 2>/dev/null | sort -rh | head -20 || true
  echo
  echo "  wrapper distributions:"
  du -sh "$GRADLE_HOME"/wrapper/dists 2>/dev/null || true
  echo
  echo "  build cache（開啟 org.gradle.caching 後才會長大）:"
  du -sh "$GRADLE_HOME"/caches/build-cache-1 2>/dev/null || echo "    (尚未建立)"
  echo "────────────────────────────────────────────────────"
}

if [ "$STATUS_ONLY" -eq 1 ]; then
  status
  exit 0
fi

echo "Gradle user home: $GRADLE_HOME"
[ "$DRY_RUN" -eq 1 ] && echo "(dry-run：不會寫入任何檔案)"
echo

# ── 1. gradle.properties ────────────────────────────────────────────────────
mkdir -p "$GRADLE_HOME"
[ -f "$PROPS" ] || { [ "$DRY_RUN" -eq 1 ] || : > "$PROPS"; }

changed=0
for entry in "${DESIRED[@]}"; do
  key="${entry%%=*}"
  val="${entry#*=}"
  current=""
  if [ -f "$PROPS" ]; then
    # 取最後一筆同名 key（Gradle 以後者為準），去掉前後空白
    current=$(grep -E "^[[:space:]]*${key//./\\.}[[:space:]]*=" "$PROPS" 2>/dev/null | tail -1 | sed 's/^[^=]*=//' | tr -d '[:space:]' || true)
  fi

  if [ "$current" = "$val" ]; then
    echo "  ✓ $key=$val（已設定）"
    continue
  fi

  changed=1
  if [ -n "$current" ]; then
    echo "  ~ $key: $current → $val"
    [ "$DRY_RUN" -eq 1 ] || sed -i '' -E "s|^[[:space:]]*${key//./\\.}[[:space:]]*=.*|${key}=${val}|" "$PROPS"
  else
    echo "  + $key=$val"
    [ "$DRY_RUN" -eq 1 ] || echo "${key}=${val}" >> "$PROPS"
  fi
done
[ "$changed" -eq 0 ] && echo "  gradle.properties 無需變更"

# ── 2. init.d/cache-cleanup.gradle ──────────────────────────────────────────
# 讓 Gradle 自動刪掉「一段時間沒用到」的快取與 wrapper 發行檔。
# 判斷依據是 ~/.gradle/caches/journal-1 記錄的最後存取時間 —— 不需要知道你的 repo 在哪。
read -r -d '' INIT_CONTENT <<'GRADLE' || true
// 由 jay-viewsonic-km/scripts/setup-gradle-global.sh 產生 —— 手改會在下次執行時被覆寫。
//
// 設定 Gradle 快取的保留天數。Gradle 依 ~/.gradle/caches/journal-1 記錄的
// 最後存取時間判斷是否閒置，所以不需要掃描任何 repo。
// 清理每 24 小時最多觸發一次，且只在有 build 實際執行時才會跑。
//
// caches.* API 需要 Gradle 8.0 以上；舊版（本機仍有 4.x / 6.x / 7.x 的 wrapper）
// 直接跳過，否則 init script 會讓那些 build 失敗。
import org.gradle.util.GradleVersion

if (GradleVersion.current() >= GradleVersion.version("8.0")) {
    beforeSettings { settings ->
        settings.caches {
            // 已釋出版本的 Gradle 發行檔（~/.gradle/wrapper/dists）
            releasedWrappers.removeUnusedEntriesAfterDays = 30
            // nightly / snapshot 發行檔
            snapshotWrappers.removeUnusedEntriesAfterDays = 7
            // 下載來的相依（modules-2 等）
            downloadedResources.removeUnusedEntriesAfterDays = 30
            // 本機產生的中間檔（transforms、jars 等）
            createdResources.removeUnusedEntriesAfterDays = 7
            // build cache 本體
            buildCache.removeUnusedEntriesAfterDays = 14
        }
    }
}
GRADLE

if [ -f "$INIT_SCRIPT" ] && [ "$(cat "$INIT_SCRIPT")" = "$INIT_CONTENT" ]; then
  echo "  ✓ init.d/cache-cleanup.gradle（已是最新）"
else
  echo "  + init.d/cache-cleanup.gradle"
  if [ "$DRY_RUN" -eq 0 ]; then
    mkdir -p "$INIT_DIR"
    print -r -- "$INIT_CONTENT" > "$INIT_SCRIPT"
  fi
fi

echo
status
echo
if [ "$DRY_RUN" -eq 1 ]; then
  echo "dry-run 結束，未寫入。拿掉 --dry-run 即可套用。"
else
  echo "完成。下次跑 Android build 時生效。"
  echo "驗證：build 幾次之後 ~/.gradle/caches/build-cache-1 應該開始長大（原本停在數十 MB = 沒在用）。"
fi
