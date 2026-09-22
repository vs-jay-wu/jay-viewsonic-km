# mvbf — UI：tooltip、semantics、色票

**先讀 [`SKILL.md`](SKILL.md)**（步驟 0–2、註解標準、引號）。這裡只放「真的在做這件事時才需要」的部分，從 SKILL.md 拆出來的，內容未改。

> 什麼時候讀：tooltip 在機器上一個都不出現／螢幕閱讀器按不動某個自訂控制項／套了名字裡有 `Disable` 的色票結果整列在白底上消失

---

## Tooltip 與 semantics

### `VSTooltip` 只在**接了滑鼠**時 hover 觸發 —— 純觸控裝置驗不到

`lib/widget/custom_tooltip.dart` 把 `triggerMode` 寫死為 `TooltipTriggerMode.manual`
（原註解：`// Prevent trigger from long press`），剩下唯一的路徑是 hover，而那條還掛在
`_mouseIsConnected` 底下。**所以整個 app 的 tooltip 在純觸控機上一個都不會出現。**

**徵兆**：長按按鈕只會觸發它本來的動作（跳選單、開視窗），沒有任何 tooltip。

**判準**：要在機器上驗 tooltip 就得**接一隻滑鼠**，或改用 IFP。看不到時先用
**既有的**按鈕對照一次（例如 file manager，它本來就有 tooltip）——對照組也看不到，
就是觸發模式問題，不是你的改動壞了。證據等級：實測（2026-09-14，Pixel Tablet）。

延伸的設計判準：**tooltip 不可以承載操作所需的必要資訊**，因為觸控使用者永遠看不到。
必要資訊要放在 `semanticsLabel` 或可見的 UI 上。

### ⚠️ `VSTooltip` 內部是 `ExcludeSemantics`，會吃掉 child 的點擊語意

`custom_tooltip.dart` 的 `VSTooltip.build` 外層包了 `ExcludeSemantics`，砍的是**整棵子樹**。
把它包在一個自訂控制項外面，底下 `GestureDetector` 的 tap 語意會一起消失 ——
**螢幕閱讀器使用者按不動那個元件，而畫面上完全看不出異狀。**

正確作法（與 `lib/widget/common/vs_icon_button.dart` 既有寫法一致）：
**VSTooltip 只負責視覺，語意由呼叫端自己包一層 `Semantics` 補回來**，而且各欄位分工固定：

| 欄位 | 放什麼 |
|---|---|
| `identifier` | QA 定位字串（`[QA][main toolbar: …]`） |
| `label` | 使用者聽得懂的名稱（已翻譯） |
| `tooltip` | tooltip 文字；與 `label` 相同時省略，避免念兩次 |
| `enabled` / `selected` / `onTap` | 狀態與動作（`onTap` 就是被 ExcludeSemantics 吃掉、要補回來的那個） |

順序是 `Semantics( child: VSTooltip( child: 實際控制項 ) )` —— 包反了等於沒包。

**這條值得配一條測試釘住**，因為壞掉沒有視覺徵兆：

```dart
final node = tester.getSemantics(find.byType(MyWidget));
expect(node.getSemanticsData().hasAction(SemanticsAction.tap), isTrue);
```

> `VSTooltip` 那層 `ExcludeSemantics` 其實**過寬**：它 fork 的 `CustomTooltip` 本身就有
> `excludeFromSemantics` 參數（`custom_tooltip.dart` 的 `Semantics(label: excludeFromSemantics ? null : _tooltipMessage, child: widget.child)`），
> 只拿掉 tooltip 自己的 label、保留 child 語意。改它要驗 17 處呼叫端，
> **2026-09-14 與 Jay 確認先不開單**；在它被改掉之前，照上面的作法走。

### `semanticsId` 不是 `semanticsLabel`

`semanticsId` 是 QA 自動化定位用的字串，塞進 `label` 會被螢幕閱讀器逐字念出來。
repo 裡有不少 legacy 是這樣寫的（例：`ClassSwiftLaunchToggle` 曾經
`Semantics(label: widget.semanticsId)`）—— **legacy 這樣寫不構成新程式碼照做的理由**
（Jay 2026-09-14 原話：「我知道有很多 legacy 是這樣做，但新的請用正確做法做」）。

另一個同型錯誤是**多包一層 `Semantics`**：多一層就多一個節點，同一個控制項會被讀成兩個。
語意節點只留一個。

由來：VB-2213 / PR #271。

---

## vsColors：`*OnPrimary*` 不是「一般的 disabled 色」

`textOnPrimaryDisable` 的語意是「**疊在 primary 按鈕底色上**的 disabled 文字」，
它跟 `actionButtonBackgroundPrimaryDisable` 成對（唯一既有用途在
`lib/theme/utils/utils.dart` 的 `ElevatedButtonThemeData.disabledForegroundColor`）。

**light theme 的值是 `#ffffff` 純白**——套到白色 surface 上的選單列，整列會直接消失。

| 用途 | token | light | dark |
|---|---|---|---|
| surface 上的一般文字 / 圖示 | `textPrimary` / `iconPrimary` | `#333333` / `#4d4d4d` | `#ffffff` |
| **surface 上的 disabled** | **`textDisable` / `iconDisable`** | `#c2c2c2` | `#919191` |
| 疊在 primary 按鈕上的 disabled | `textOnPrimaryDisable` | `#ffffff` | `#919191` |

**判準**：挑 disabled token 時，先看它平常成對的「一般狀態」token 是哪個——
這一列平時用 `iconPrimary`，disabled 就該用 `iconDisable`，不是名字裡有 Disable 就能用。

**徵兆**：查到某個 disabled token 在 light theme 是純白或純黑，那它幾乎一定是
「on 某個底色」的 token，不是給 surface 用的。

查證：`grep -n '<token>' lib/theme/colors/vs_light_colors.dart lib/theme/colors/vs_dark_colors.dart`
再把色票代號拿去 `vs_global_colors.dart` 換成實際色值。

### 由來

VSFT-6704。Jay 指定用 `vsColors.textOnPrimaryDisable`，查證後發現在白底選單上會看不見，
回報後確認是他記錯，改用 `textDisable` / `iconDisable`。

---
