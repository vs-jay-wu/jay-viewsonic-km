/**
 * 檔案／資料夾要畫哪個圖示（純規則，有測試）。
 *
 * 圖示與對照表來自 Material Icon Theme，抓取與出處記在
 * `scripts/fetch-material-icons.py` 與產生出來的 `lib/fileIconsData.ts`
 * （含 upstream commit）。這裡只管**怎麼挑**。
 */

import {
  EXT_ICON, FALLBACK_FILE_ICON, FALLBACK_FOLDER_ICON, FOLDER_ICON, NAME_ICON,
} from "@/lib/fileIconsData";

/**
 * 優先序：完整檔名 → 複合副檔名 → 單一副檔名 → 預設。
 *
 * **複合副檔名要比單一的先看**：`vitest.config.ts` 若先對到 `.ts`，
 * 就永遠看不到更specific的那一條；而 `package-lock.json` 這種也只有
 * 完整檔名對得到。
 */
export function fileIconOf(path: string): string {
  const name = (path.split("/").pop() ?? "").toLowerCase();
  if (!name) return FALLBACK_FILE_ICON;
  if (NAME_ICON[name]) return NAME_ICON[name];

  // `a.b.c` → 先試 `b.c`，再試 `c`
  const parts = name.split(".");
  for (let i = 1; i < parts.length; i++) {
    const ext = parts.slice(i).join(".");
    if (EXT_ICON[ext]) return EXT_ICON[ext];
  }
  return FALLBACK_FILE_ICON;
}

/**
 * 資料夾依名字給圖示（`src`、`test`、`android`…）。
 *
 * **開頭的點要去掉再查** —— 上游的表裡寫的是 `github`、`claude`，而目錄叫
 * `.github`、`.claude`；不去點的話這些最好認的資料夾反而吃預設圖示。
 */
export function folderIconOf(name: string): string {
  const key = (name.split("/").filter(Boolean).pop() ?? "").toLowerCase();
  return FOLDER_ICON[key.replace(/^\./, "")] ?? FALLBACK_FOLDER_ICON;
}
