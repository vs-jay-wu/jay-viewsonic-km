# VSFT-6964 手動測試清單 — 文字字級絕對值顯示

> | Jira | 對象 repo | 狀態 |
> |---|---|---|
> | [VSFT-6964](https://viewsonic-vsi.atlassian.net/browse/VSFT-6964) | edu-droid-flutter（mvbf） | 開發中（WIP 未 commit，源自 cherry-pick `f41b437c`） |

> Toolbar 顯示的字級在 canvas zoom 變動時應該保持「display value」一致。
> 設計文件見 flutter repo 的 `docs/text_annotation_font_size_clean_architecture.md`。

每個 case 完成後在 `[ ]` 打勾，碰到 fail 直接記在後面。

---

## A. 基本 toolbar 顯示（核心 VSFT-6964）

- [x] zoom=100%，建立文字 fontSize=20，預期 toolbar 顯示 **20**
- [x] zoom=175%，建立文字 fontSize=20，預期 toolbar 顯示 **20**
- [x] zoom=75%，建立文字 fontSize=20，預期 toolbar 顯示 **20**
- [x] zoom=90%（非整數比例），建立文字 fontSize=20，預期 toolbar 顯示 **20**
- [x] zoom=400%（最大），建立文字 fontSize=20，預期 toolbar 顯示 **20**
- [x] zoom=10%（最小），建立文字 fontSize=20，預期 toolbar 顯示 **20**

## B. 預設字級切換（settings → fontSize）

- [x] settings 預設字級調為 **72**
- [x] zoom=100% 開編輯器，預期 toolbar 一開啟就顯示 **72**（不會閃一下其他值）
- [x] zoom=75% 開編輯器，預期 toolbar 一開啟就顯示 **72**（不會閃 54 變 72）
- [x] zoom=175% 開編輯器，預期 toolbar 一開啟就顯示 **72**
- [x] 把預設字級調回 **20**，重複上面 3 個 zoom，預期都顯示 **20**

## C. 編輯字級（toolbar 操作）

- [x] zoom=100%，編輯中從 dropdown 選 22，預期 toolbar 顯示 22、視覺變大
- [x] zoom=175%，編輯中從 dropdown 選 22，預期 toolbar 顯示 22、視覺對齊畫布
- [x] zoom=90%，編輯中按 ↑ 箭頭，預期值依 [10,12,...,130] 步進、toolbar 顯示對得上
- [x] zoom=90%，編輯中按 ↓ 箭頭，預期同上反向
- [x] zoom=90%，挑 MIN(10)，預期 toolbar 顯示 10、視覺最小
- [x] zoom=90%，挑 MAX(130)，預期 toolbar 顯示 130、視覺最大

## D. Round-trip：建立 → 關閉 → 再開（同 session）

- [ ] zoom=100% 建 fontSize=72 → 關 → 點文字再開，toolbar 顯示 **72**
- [ ] zoom=90% 建 fontSize=72 → 關 → 點文字再開，toolbar 顯示 **72**
- [ ] zoom=175% 建 fontSize=72 → 關 → 點文字再開，toolbar 顯示 **72**
- [ ] zoom=100% 建 → 切到 zoom=90% → 點文字開，toolbar 顯示 **72**
- [ ] zoom=100% 建 → 切到 zoom=175% → 點文字開，toolbar 顯示 **72**

## E. Round-trip：OLF 存檔 → 重開

- [ ] zoom=90% 建 fontSize=72 → **存 OLF** → 重開 OLF → 點文字，toolbar 顯示 **72**
- [ ] zoom=75% 建 fontSize=20 → 存 OLF → 重開 OLF → 點文字，toolbar 顯示 **20**
- [ ] zoom=400% 建 fontSize=130 → 存 OLF → 重開 OLF → 點文字，toolbar 顯示 **130**

## F. Lasso resize（必須保留的 invariant）

> Lasso 放大文字後再點進編輯，toolbar 顯示應反映 resize 後的視覺字級。
> 例：fontSize=20 → lasso 2x → toolbar 顯示 40。

- [ ] zoom=100% 建 fontSize=20，lasso 把手拉大到 2x，點進編輯，toolbar 顯示 **40**
- [ ] zoom=100% 建 fontSize=20，lasso 縮小到 0.5x，點進編輯，toolbar 顯示 **10**
- [ ] zoom=175% 建 fontSize=20，lasso 2x，點進編輯，toolbar 顯示 **40**（不是 70 或別的怪數字）
- [ ] lasso 後存 OLF → 重開 → 點進編輯，toolbar 顯示一致

## G. 多段文字混合字級

- [ ] zoom=100% 在同一個 textbox 內：第一行 20、第二行 40、第三行 60
- [ ] zoom=175% 重新點進編輯，每一行 toolbar 顯示應對應到原本挑的值
- [ ] 存 OLF → 重開 → 各行字級對得上

## H. 樣式 + 字級同時改

- [ ] zoom=90%，建立文字後，挑粗體 + fontSize=22，預期 toolbar 顯示 22、文字粗體
- [ ] zoom=90%，建立文字後，挑斜體 + 顏色，再挑 fontSize=22，預期 toolbar 顯示 22
- [ ] 連續 undo / redo 後 toolbar 顯示與內容一致

## I. 視覺對齊（不只看 toolbar）

> Toolbar 數字對 ≠ 視覺對。要一併確認畫面上文字大小看起來合理。

- [ ] zoom=175% 建 fontSize=20，視覺上的文字應該比 zoom=100% 的相同字級大 1.75 倍
- [ ] Lasso 放大 2 倍後，視覺確實變兩倍大
- [ ] 切換 zoom 不會讓既有文字「跳」一下變形

## J. 不該回歸的舊功能

- [ ] Sticky note 文字（黃色便利貼）打字、改字級、存檔、重開都正常
- [ ] Pop quiz 文字輸入正常
- [ ] Title bar 上的 zoom 按鈕（如有）跟 pinch zoom 都讓所有 text 一起縮放
- [ ] Undo / Redo text edit 都正確
- [ ] Connector 連到 text 不會因 text 改字級而斷掉
- [ ] 純空白文字（按進去沒打就關掉）不會留下空 annotation
- [ ] 連續 edit 同一段文字多次，內容與字級不會錯位
- [ ] RTL 語言（阿拉伯文 / 希伯來文）輸入正常顯示

## K. Edge cases

- [ ] zoom=100% 點空白 → 進編輯器 → 不打字 → 關閉，畫面上不會有 ghost annotation
- [ ] zoom=90% 點空白 → 不打字 → 關閉，同上
- [ ] 文字框拖到畫布外（負座標）後關閉再開，toolbar 顯示一致
- [ ] 連續按 zoom 進出（100% → 175% → 100% → 175% ...）多次後點文字，toolbar 顯示不漂移

---

## L. Commit 前清單（提醒自己）

- [x] ~~`lib/constants.dart` 把 `kEnableAppiumIntegration` 改回原值~~ — 已確認：目前工作區與 master 一致（`kDebugMode && false`），無需處理（2026-07-29）
- [x] ~~刪掉 flutter repo 的 `MANUAL_TEST_VSFT-6964.md`~~ — 已移到本檔（km），flutter repo 的副本已刪（2026-07-29）
- [ ] 確認沒有殘留的 `print('🐛...')` debug log
- [ ] `git diff --cached` 最後檢查一次

## 補充：單元測試（2026-07-29 補上）

- `test/annotation_model/text_annotation_font_size_test.dart` — `getNextLargerNumber` / `clampedPreciseSizeString`（OLF 序列化，自 filesave_helper 抽出的純函式）/ `normalizedClone` 兩條路徑
- `test/widget/dialog/text_editor/text_editor_size_bridge_test.dart` — bridge 換算（cherry-pick 內既有）
- `make test` 全套 2798 個測試通過（2026-07-29）
