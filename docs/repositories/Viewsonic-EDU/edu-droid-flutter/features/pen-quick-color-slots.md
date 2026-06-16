# Pen Quick Color Slots — 系統 vs 使用者控制

筆選色面板的 3 個快速顏色格子（slot1 / slot2 / slot3）在「系統」和「使用者」之間的職責劃分。

相關 Jira：[VSFT-8926](https://viewsonic.atlassian.net/browse/VSFT-8926)
相關程式碼：
- `lib/model/current_user.dart` — `_updateMarkerStyle()`（系統側寫入）
- `lib/bloc/main_tool_bloc/main_tool_state.dart` — `_getDefaultQuickColorStyles` / `_getDefaultQuickThinPenStyles`（預設值）
- `lib/bloc/main_tool_bloc/main_tool_bloc.dart` — `_setQuickStyle`（event handler）
- `lib/model/preference_settings/user_preference/marker_preference.dart` — 從網站讀回的偏好

## 背景

每枝筆（粗 / 細）的快速選色面板有 3 格顏色（slot1、slot2、slot3）。App 預設：

| 筆 | slot1 | slot2 | slot3 | 預設 selected index |
| --- | --- | --- | --- | --- |
| 粗筆 | 黑 | 紅 | 藍 | 0 |
| 細筆 | 黑 | 紅 | 藍 | 1 |

（細筆預設 selected = 1 是歷史設計，跟粗筆不對稱。）

使用者可以在 myviewboard.com 設定「預設筆的樣式」，這個偏好會在登入時被 app 拉回來。

## 各 slot 的職責

`MainToolSetQuickStyle` 在程式碼中的所有 dispatch 點：

| 來源 | 觸發者 | 寫入 slot |
| --- | --- | --- |
| `quick_color_overlay.dart` | 使用者 long-press 浮層 | 1 / 2 / 3 |
| `pen_dialog_model.dart` | 使用者開 pen settings dialog | 1 / 2 / 3 |
| `pen_selection_helper.dart` | 使用者操作 pen selection panel | 1 / 2 / 3 |
| `current_user.dart` (`_updateMarkerStyle`) | **系統**（登入） | **僅 slot1** |

歸納出的設計慣例：

- **slot1**：登入時系統會覆寫（套網站設定）。其他時候由使用者自由修改，系統不會碰
- **slot2、slot3**：只有使用者主動操作會改變，系統不會碰

這個慣例先前沒有明文，VSFT-8926 處理時一併釐清。

## 規格（VSFT-8926 後）

假設使用者在 myviewboard.com 設定：粗筆=紫、細筆=綠

| 階段 | 粗筆 slot1 / 2 / 3 | 細筆 slot1 / 2 / 3 | 粗 index | 細 index |
| --- | --- | --- | --- | --- |
| 初次開啟 app（預設） | 黑 / 紅 / 藍 | 黑 / 紅 / 藍 | 0 | 1 |
| 登入後 | **紫** / 紅 / 藍 | **綠** / 紅 / 藍 | 強制 0 | 強制 0 |
| 登出後 | （不動）| （不動）| 不動 | 不動 |

### 重點

- **登入時：** slot1 寫入網站設定的顏色，且 index 強制切到 0，使用者一登入就用自己的主色作畫
- **登出時：** 完全不動（slot1 顏色、寬度、selected index 全部保留登入時的狀態）
- **slot2、slot3：** 不論登入 / 登出都不動，使用者期間自訂的內容會持續保留

### 設計理由

「登出時不動 slot1」是刻意設計：

- 使用者登出後通常還是會繼續使用 app，這時把剛剛習慣的主色清掉（換回黑）會打斷工作
- slot1 從「系統管理」轉成「保留使用者上次狀態」，行為對使用者更友善
- 若使用者真的要清，可以自己 long-press 改色，或重新登入用網站新設定

### Trade-offs

- 使用者期間若手動修改 slot1 的顏色，下次登入時還是會被網站設定覆蓋。這是現況既有行為（不是新引入），符合「登入時 slot1 由網站接管」的設計
- 登出後 slot1 仍是上次登入的色，可能造成「我明明登出了，為什麼還顯示我帳號的主色？」的疑問。視為「app 記住你上次的偏好」即可

## 與此前的差異（VSFT-8926 修了什麼）

修正前 `_updateMarkerStyle` 的兩個問題：

1. **登出時細筆 slot1 變紅**：`MarkerPreference.defaultPreference.thinPenColor` 是紅（`0xFFFF0000`），登出時被寫進細筆 slot1，導致細筆變成「紅 / 紅 / 藍」而不是預期的「黑 / 紅 / 藍」
   - 粗筆沒這問題是因為 `defaultPreference.thickPenColor = Colors.black` 與 slot1 預設相符
2. **登入時細筆沒切到使用者主色**：細筆預設 index=1（紅），登入只把使用者色寫進 slot1（黑那格），index 沒切過去，使用者畫出來還是紅色

修正方向：

- 登入：兩枝筆 slot1 寫入網站設定色 + 強制把 selected index 切到 0
- 登出：early-return，完全不動 slot1
