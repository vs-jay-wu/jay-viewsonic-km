# VSFT-6964 調查記錄

## Bug：OLF 存檔重開後 font size 漂移（130→106、48→46、20→20）（2026-07-29）

**回報**：zoom 維持 122.66% 不動，存檔重開後：130→106、48→46、20→20。

### 結論（TL;DR）

兩個缺陷疊加，都與「canvas zoom 烤進 annotation matrix」的機制有關：

- **D1（存檔端，資料損毀）**：`TextAnnotation.toJson`（`text_annotation.dart:1089`）用
  **預設整數化的 `normalizedClone()`** 把 annotation matrix 的 scale 烤進字級：
  `getNextLargerNumber(json_size × matrix_scale)` → round → floor 到偶數 → **clamp 到 [10,130]**。
  超過 130 的 scaled 值被 clamp 是最大災難（159.45 → 130，直接損失 18.5%）。
- **D2（開檔端，幽靈 zoom）**：`olf_reader.dart:320` 把 page matrix 的 scale（=存檔時
  的 canvas zoom）還原給 `infiniteCanvasScale`，**卻不烤回任何 annotation matrix**
  （`pageSetMatrix` 只被讀 scale，從未 apply）。開檔後畫面實際以 100% 渲染、
  zoom 標籤卻顯示 122.66%。WIP 的 bridge 相信這個標籤去除法 → 數字漂移。

### 三個數字的完整驗算（與實際檔案逐一吻合）

前提（已證實）：文字在 zoom=100% 時建立（quill 為整數 display 值），之後 pinch 到
122.66%（scale 烤進 annotation matrix），然後存檔。

| display | 存檔 D1：×1.22657 → 整數化 | 檔案內容（×f2s 2.0） | 開檔 D2：÷1.22657 → floor偶數 | 重開顯示 |
|---|---|---|---|---|
| 20 | 24.53 → **24** | 48 ✓ | 19.57 → | **20**（僥倖不變）|
| 48 | 58.88 → **58** | 116 ✓ | 47.29 → | **46** |
| 130 | 159.45 → **clamp 130** | 260 ✓ | 105.98 → | **106** |

檔案實測（`tmp_0729_01.olf` 從裝置 run-as 拉出）：font-size = [20,32,48,68,84,**116**,196,**260**]
全為整數；page matrix scale = 1.2265710829939889。

### 驗證方法（全程未改程式碼）

1. `adb run-as` 拉出 app cache 的 OLF → 解包 `content.json` 檢查實際存值
2. VM Service 對執行中 debug app 求值（`vm_eval.dart`，scratchpad 可重用）：
   - `olfRatio=2.0`、`fileToScreenScale=1.0`、`infiniteCanvasScale=1.2265710829939889`、`dpr=2.0`
   - 畫布 annotation 實際 `jsonList size` 與 `matrix scale`（開檔後 = 整數 + m0=1.0）
   - 活體驗證 quill `Document.fromJson→toDelta` 與 `jsonToTextSpan` 都**保留 float**
     （排除編輯器關閉與 span 管線嫌疑，鎖定 toJson 的 normalizedClone）
3. 靜態追碼：pinch zoom 把 scale 烤進所有 annotation matrix
   （`infinite_canvas.dart` `_concatenatingTransformByElement`）

### 關鍵定性

- 存檔後檔案裡的 font-size 是「**烤過 zoom 的視覺尺寸**」（display×zoom），page matrix
  另存 zoom。今天的 loader 不重烤 → 視覺大小大致不變（58 vs 58.88 px），但「使用者
  當初挑的數字」已經永久遺失（48 變 58）。
- **D1 在 WIP 之前就存在**（getNextLargerNumber 的 clamp/floor 一直都在 toJson 裡），
  但舊 toolbar 直接顯示 quill 原值，掩蓋了問題；WIP 的 bridge 讓它可見。
- WIP 在編輯器開啟端改用 `normalizedClone(convertToIntegerFontSize: false)` 保留精度，
  但 **存檔端 toJson 仍走整數化預設** —— 這正是先前單元測試 gap 分析點名的
  「OLF 序列化」風險成真。

### 修正實作（2026-07-29，已完成並 hot restart 到實體機）

Jay 的設計決策：**clamp 屬於顯示域（toolbar 的 10~130），實際存的 scaled 值可合法超過 130**。

1. **D1**：`toJson` 改用 `normalizedClone(convertToIntegerFontSize: false)` —— 保留 float、
   不 floor、不 clamp（`text_annotation.dart`）
2. **匯入端**：XML textarea 路徑拿掉 scaled 域 clamp（與 content.json 路徑一致），
   刪除 `clampedPreciseSizeString`
3. **D2 不需修**：檔案存 display×zoom + 開檔還原 zoom 標籤剛好互相抵消，
   存檔端不再損毀後 round-trip 天然成立

單元測試：toJson round-trip 覆蓋 130/48/20 @ 122.66%（使用者實測案例）+ 130@400%=520
極端案例；`make test` 全套 2798 通過。

**待驗證（Jay 進行中）**：mvbW 對超過 130（或 float）的 font-size 是否會丟值 / clamp。
若會，需再議存檔上限相容策略。舊檔已損毀的數值無法救回。

### ~~修法方向~~（原分析，已由上方決策取代）

**先決問題**：mvbW / mvbX 渲染 OLF 時會不會 apply pageset matrix 的 scale？
（我們存的檔案 page matrix 有 1.2266 —— 其他平台開啟時畫面會放大 1.2266 倍嗎？）

- 若**會**：正確修法 = 存檔不把 zoom 烤進字級（保留 display 域數值 + page matrix 記
  zoom），開檔把 page scale 烤回 annotation matrix（D2 選項 A）。Round-trip 完美
  （48→48），跨平台視覺也一致。
- 若**不會**（其他平台只看 font-size 數字）：存檔烤 zoom 是視覺相容的必要之惡，
  則修法 = 開檔後 `infiniteCanvasScale` 歸 1（D2 選項 B），toolbar 會顯示烤過的值
  （48@122.66% 重開顯示 58）—— 視覺一致但數字仍變，需要跟 PM/QA 確認可接受度。
- **無論選哪邊，D1 的整數化都該處理**：toJson 的 normalizedClone 應改為
  `convertToIntegerFontSize: false`（或至少把 clamp 拿掉），否則 WIP 的 float 精度
  在存檔時照樣被毀（例：zoom 175% 建的 20 → quill 35.0 → 存檔變 34）。

### 相關程式碼位置

- **D1**：`text_annotation.dart:1086-1089`（toJson → normalizedClone() 預設整數化）
- **D2**：`olf_reader.dart:316-320`（只設 infiniteCanvasScale，未 apply 到元素）
- 存檔 font-size 縮放：`file_olf_save_helper.dart:764`（× fileToScreenScale）
- 匯入 font-size：`element_helper.dart:1344`（÷ olfRatio）
- zoom 烤 matrix：`infinite_canvas.dart` `_concatenatingTransformByElement`
- bridge：`lib/widget/dialog/text_editor/ui_v2/text_editor_size_bridge.dart`
