掃描各專案的 build 資料夾大小，並選擇性執行清除。

## 說明

- 對各專案掃描是否存在 build 資料夾
  - Flutter 專案：檢查 `build/`
  - Node.js 專案：檢查 `node_modules/`
- `--dry-run`：只顯示大小，不執行清除
- 清除方式：`cd <project> && make clean`

## 範例

- `/clean-build` → 執行清除
- `/clean-build --dry-run` → 只顯示 build 資料夾大小（不清除）

## 執行

```bash
chmod +x scripts/clean-build.sh
./scripts/clean-build.sh ${ARGUMENTS:-}
```
