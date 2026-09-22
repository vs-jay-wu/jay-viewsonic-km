# shape-pen-sizing domain

**形狀筆（Shape Pen）的「粗細」到底換算成多大的圖章 —— 四個實作有四種答案。**

不綁單一 repo：`edu-droid-flutter`（mvbf）、狸貓版三端（mac / Android / Swallow）都各自硬編了
一份公式，OLF 只存 `pen-width`，各端自己還原。由 VB-2164 調查時整理（2026-09-16）。

| 文件 | 內容 |
|---|---|
| 本頁 | 四個實作的公式對照、來源考古、畫布縮放行為差異、已知後果 |

---

## 一句話

**滑桿標「1–32」，但形狀筆的圖章大小只在 0.5×–1.0× 之間跑**，而且那個「1×」是多少，
四個實作各不相同（mvbf 在 VB-2164 修正前甚至隨螢幕 DPR 在 48 / 32 / 40 / 32 之間跳，
修正後凍成 40，與狸貓 mac／Android 一致）。
> ⚠️ **那不是三個獨立來源。** 狸貓 mac（`ShapePenCatalog.swift:85`）與 Android
> （`StrokeRender.kt:10`）的註解都明說 40 是**抄 mvbf 的 DPR-2 分支**（`80/2`）。
> 正確的論據是「另外兩端已經把 mvbf 的 DPR-2 值凍成常數，mvbf 這次跟上」，
> 不是「三端各自算出 40」。（2026-09-17 PR #278 review 要求補出處時查證並更正。）

所以使用者把粗細從 **24 拉到 32，圖章只大 14%** —— 看起來像沒作用。這不是 bug 回歸，
是 2020 年原始實作留下的公式，至今沒人改過。

---

## 四個實作對照

粗細 UI 範圍四端都是 1–32。下表是**圖章邊長（該端自己的座標空間，單位：點）**。

| | 公式 | 1 | 24（預設） | 32（最大） | 32÷24 | 1→32 |
|---|---|---|---|---|---|---|
| **mvbf**（VB-2164 修正後，全 DPR） | `40 × (0.5 + w/64)` | 20.5 | **35** | **40** | 1.14× | 1.95× |
| ~~mvbf 修正前 DPR 2~~ | `40 × (0.5 + w/64)` | 20.5 | 35 | 40 | 1.14× | 1.95× |
| ~~mvbf 修正前 DPR 1~~ | `48 × (0.5 + w/64)` | 24.75 | 42 | 48 | 1.14× | 1.94× |
| **狸貓 mac** | `40 × (0.5 + w/64)`，捨到半點 | 20.5 | **35** | **40** | 1.14× | 1.95× |
| **狸貓 Android** | `40 × (0.5 + w/64)` | 20.6 | 35 | 40 | 1.14× | 1.94× |
| **狸貓 Windows**（Swallow） | `w + 20` | 21 | **44** | **52** | 1.18× | 2.48× |

圖章間距四端一致都是 `int(邊長 × 1.414)`，除了 Swallow 用 `pitch = 邊長 × 1.0`。

### 兩個立刻跳出來的後果

1. **同一份 OLF 在 Windows 與 Android/Mac 開，圖章差 26%**（預設 24 → 44 vs 35）。
   OLF 只存 `pen-width`，還原公式各端自己寫死。
2. **兩條公式的「地板」都是 20**（Flutter 是 `40 × 0.5`，Sparrow 是 `+20`），最小粗細時
   兩邊幾乎重合（20.5 vs 21），差異全在斜率（0.625/單位 vs 1.0/單位）。
   > 這像是同一個原始意圖分家後其中一邊改了斜率 —— 但**這是看數字推的，沒有證據**。

### 程式碼位置

| 端 | 檔案 |
|---|---|
| mvbf 產生端 | `lib/model/whiteboard_tool.dart` `setShapePenImage()`（`maxScale`/`minScale`） |
| mvbf 讀 OLF 端 | `lib/helper/element_helper.dart` `case "shape-pen"`（**同一條公式的第二份**） |
| mvbf 基準值 | `lib/helper/utility_helper.dart` `UtilityHelper.shapePenStampBaseSize`（VB-2164 起的常數 40）<br>修正前是 `lib/widget/theme_png_image.dart` 的 `ThemePNGIcon._getSize()`（DPR 分桶） |
| mvbf 點陣化 | `lib/helper/utility_helper.dart` `loadStorageScaledShapePen()` |
| mvbf 繪製 | `lib/annotation_model/shape_pen.dart` `_getImageSizeInPoint()` / `calculatePath()` |
| 狸貓 mac | `myViewBoard/Canvas/Model/ShapePenCatalog.swift`（`stampBaseSize` / `stampScale` / `stampSize`） |
| 狸貓 Android | `app/src/main/kotlin/com/viewsonic/droid/canvas/model/StrokeRender.kt`（`ShapePenStampGeometry`） |
| 狸貓 Windows | `Swallow.Core/DesignSystem/DesignTokens.cs`（`ShapeStampSizeBump`）＋ `Swallow.Core/Canvas/PenStampSampler.cs` |

---

## 考古：這些決定各自從哪來

三個設計決定，**只有造成「24 和 32 看起來一樣」的那一條沒有留下理由**。

| 決定 | 來源 commit | 有沒有理由 |
|---|---|---|
| `0.5–1.0` 夾住縮放比 | `8e8e828cf` 2020-09-17 `[Implementation] Add shape pen`（Leland） | ❌ commit 訊息空白，無票號，註解只解釋 `32` 這個除數 |
| 拿 `ThemePNGIcon.iconSize` 當幾何基準 | `fe6635e14` 2022-06-28 `[Bug 36199] Shape Pen - Inconsistent thickness of the shape pen strokes (part2)`（Henry） | ✅ 修跨平台粗細不一致：改之前基準是素材自己的像素寬，還要對 Windows OLF 的 96px 圖套 density 魔術數（0.33 / 0.28） |
| 繪製時 `÷ getDevicePixelRatio()` | `247de6c7f` 2022-11-01 `Fix low-resolution Shape Pen (simplified version)`（Aaron Chang） | ✅ 修高 DPR 螢幕上圖章糊掉 |

**反證（證明 0.5–1.0 不是當時的共用慣例）**：同一位作者兩週後加的魔術線筆
（`089ccf6b1` 2020-09-29）**完全沒有這條公式**，直接 `loadUiImage(path)` 載原圖。

**那天是試錯出來的，不是設計出來的**：2022-11-01 有 part 1/2/3 三個嘗試，part 2、part 3
隔天被 revert，最後留下 simplified version；2022-06 的 part1 也被 revert 過一次。

**狸貓版兩端都認為 DPR 分桶是缺陷並主動凍掉**：

- mac spec 0066 divergence 表第 4 列：「Stamp base size varies with devicePixelRatio (48/32/40/32 pt)」
  → 「Fix at the DPR-2 value **40 pt**」，理由 “Deterministic rendering, testable”，記為 `[changed:L0]`
- Android `StrokeRender.kt`：`/** ThemePNGIcon.iconSize at the canonical DPR-2 branch */`

但**兩端都照抄了 `0.5 + w/64`**，沒有人質疑它。

---

## 畫布縮放：mvbf 與狸貓 mac 行為相反

這一條 mac 的 spec **沒有涵蓋到**。它只寫了「拖拉改變大小時圖章尺寸不變，這就是 Flutter 的行為」
（那條確實對），但畫布縮放走的是完全不同的機制。

| | 縮放機制 | 放大 N× 之後 |
|---|---|---|
| **mvbf** | **烘進每個 annotation**（`infinite_canvas_transform_command.dart` 逐一 `resetTransform` + `setPaintScale`） | 圖章**尺寸與間距完全不變**，只是路徑變長、數量變多 |
| **狸貓 mac** | **view transform**（`PageSceneRenderer.apply(to:)` 做 `context.scaleBy`） | 圖章**跟著放大 N×**，沒有上限 |

mvbf 那邊是**刻意**的：`shape_pen.dart` 覆寫了 `setPaintDeltaScale`，把基底的
`super.setPaintDeltaScale(deltaScale)` **註解掉**，只重算圖章位置；而 `_getImageSizeInPoint()`
只看 `_image.width / DPR`，**從來不看 `_paintScale`**。對照一般筆（`polyline.dart`）：
`setPaintDeltaScale` → `resetPaintWidth()` → `_paint.strokeWidth = _paintWidth * _paintScale`，
所以一般筆會跟著變粗。

### 實測（2026-09-16，macOS build，外接 2560×1440 非 HiDPI）

同一份內容只改畫布縮放，逐像素量測：

| 縮放 | 圖章(24) | 圖章(32) | 圖章(1) | 圖章間距 | 馬克筆線粗 | 馬克筆線長 |
|---|---|---|---|---|---|---|
| 50% | 29 px | 33 px | 18 px | 49 / 56 / 28 | **3 px** | 136 px |
| 98% | 29 px | 33 px | 17 px | 49 / 56 / 28 | — | — |
| 150% | — | 32 px | 18 px | 56 / 28 | **7 px** | 407 px |

對照組成立：馬克筆線長 136→407 px（正好 3 倍）、線粗 3→7 px 都跟著縮放；
**圖章尺寸與間距三個縮放層級完全一致**。

### 順帶：圖片尺寸不是天花板

曾經以為 mvbf 是「放大到素材原生尺寸就不再大」。**實測推翻**：素材是 96×96 px，而
`ui.instantiateImageCodec(targetWidth: N)` 會照 N 放大（餵 400 就給 400×400，不夾住）。

mvbf 真正的上限來自 `maxScale = 1.0`，而那只由**滑桿的 `max: maxStrokeSize`** 間接保證。
一旦 `strokeWidth > maxStrokeSize`（VB-2164 就是這種狀態），縮放比會 > 1，
去要 > 96 px 的圖 → 被放大 → 除了太大**還會糊**。

---

## 已知後果

- **VB-2164**（2026-04-08 開，2026-09-16 修）：換螢幕後預設筆寬比可設定上限還粗。
  兩個獨立缺陷：
  1. 預設筆寬取 `MainToolState.devicePixelsScale`、上限取 `ScreenBloc` → 兩個 scale 來源分叉
  2. 圖章點陣圖記著產生時的 DPR，繪製時卻除以當下 DPR → 換 DPR 螢幕後尺寸被
     `DPR產生/DPR繪製` 放大（Retina → 非 Retina 變兩倍）
- **同一個粗細跨螢幕畫出來不一樣大** —— 已在 VB-2164 一併修掉（見下節）。
- **24 → 32 只大 14%**：使用者會覺得粗細滑桿在形狀筆上沒作用。**目前無人負責，也還沒開票。**
- **跨端 26% 差異**：同一份 OLF 在 Windows 與 Android/Mac 開，圖章大小不同。

---

## OLF 怎麼看這件事（olfparser v-next 合約，2026-09-16 查證）

透過 GitHub API 讀 `Viewsonic-EDU/olfparser`（本機 checkout offloaded 在外接碟、當時未掛載）。

### legacy OLF 的 shape-pen **有**特別處理，但只針對 Sparrow

`docs/olf-vnext/conversion-rules-sparrow-flutter.md` 備註②：

> shape-pen 的筆寬 Sparrow 存檔時會先 **減 20**、讀檔時加回
> （寫 `OLFStroke.cs:180-181`、讀 `:294-298`）—— v-next 存「實際粗細」，所以匯入 **+20**、匯出 **−20**。

Rust 實作 `rust/crates/olf-upgrade/src/containers.rs` `upgrade_pen_size()`：

```rust
if ctx.platform == SourcePlatform::Flutter {
    return json_f64(v / ctx.ratio);   // Flutter 檔：只除 ratio，沒有 shape-pen 特例
}
if is_shape_pen {
    return v + 20.0;                  // Sparrow 檔：shape-pen +20
}
json_f64(v * scale)
```

### v-next 定義 `pen-width` = 「實際粗細」

`docs/olf-vnext/vnext-spec.md:179`：

> `pen-width` / `pen-height`｜number｜必填｜筆刷寬/高，絕對 px（**實際粗細**；
> legacy shape-pen 的 −20 偏移已在轉換時校正）

### ⚠️ 但 Flutter 的 `pen-width` 不是「實際粗細」

這是**結構性的落差**，不是實作 bug：

| | `pen-width` 的語意 | 實際畫出來的圖章邊長 |
|---|---|---|
| Sparrow（+20 校正後） | = 圖章 blit 尺寸 | **等於 `pen-width`** |
| Flutter / mvbf | 滑桿名目粗細 × `devicePixelsScale` | `40 × (0.5 + pen-width/64)` —— **不等於 `pen-width`** |

v-next 對 Flutter 來源只做單位換算（÷ ratio），**沒有把「名目粗細」換算成「實際粗細」**。
所以同一個 v-next `pen-width` 欄位，Sparrow 系與 Flutter 系讀出來的意思不一樣。

spec 自己也留了一條相關的未定案（備註③）：

> ⚠️ Flutter 檔在 zoom≠1 存檔時的筆寬空間尚未完全定案（讀端另有視圖補償
> `olf_reader.dart:523-524`），需實檔驗證。

**對 VB-2164 的影響：無。** 這次的修改只動 mvbf 的**算繪基準**，完全沒碰 `pen-width` 的讀寫，
所以不影響 OLF 合約。反而是**改善**：base 凍成常數之後，「Flutter 的 pen-width → 實際尺寸」
第一次變成一個確定的函數（`40 × (0.5 + w/64)`），而不是隨開檔機器的 DPR 變動。
未來若要把兩系的語意對齊，這是前提。

> 這條落差**尚未回報**給 olfparser / 狸貓版。要不要處理由 spec owner 決定。


## VB-2164 把 base 凍成常數（2026-09-16）

`utility_helper.dart` 的 `loadStorageScaledShapePen` 原本拿 `ThemePNGIcon.iconSize`
當文件座標基準。它是**依 DPR 分桶的 UI 圖示尺寸**，全 repo 其餘 50 幾處用途都是標題列高度、
對話框邊界這類 UI chrome —— 那裡是唯一拿它當文件幾何的地方。

改成 `UtilityHelper.shapePenStampBaseSize = 40`。**點陣圖的像素數仍然乘當下 DPR**，
只有「文件座標的邊長」不再跟 DPR 有關。

**為什麼選 40（不要誤讀成「照抄狸貓版」）**：40 本來就是 **mvbf 自己 DPR 2 那一桶的值**，
也是絕大多數機器實際在用的值 —— 選它等於「保留最常見的現況、消掉其餘三桶」。
狸貓 mac／Android 先前凍住的也正是這個值（他們是從 mvbf 的 DPR-2 分支取的），
所以這個選擇同時讓三端收斂；但**權威來源是 mvbf 自己的現況，不是狸貓版**。

### 實測（同一份檔案、同一個分頁、粗細都 32，在同一個畫面上量）

| | 在 DPR2 內建畫 | 在 DPR1 外接畫 |
|---|---|---|
| 修正前 | 可見寬 33 px，間距 56 px | 可見寬 **39 px**，間距 **67 px** |
| 修正後 | 可見寬 33 px，間距 56 px | 可見寬 **32 px**，間距 **56 px** |

DPR 2 那一欄前後完全相同 —— DPR-2 機器沒有任何變化。

### 對既有檔案的影響

**建立檔案時的 DPR 不會進到檔案裡。** 實測：在兩個不同 DPR 螢幕上畫、視覺大小差 20% 的兩筆，
存進 OLF 後 `pen-width` **完全相同**（都是 `42.666666666666664`）。
圖章大小是開檔時用 `pen-width` 重算的：`base × (0.5 + strokeWidth/(2×maxStrokeSize))`。

所以差異一直都是「**用哪台機器開**」造成的，不是「用哪台機器建立」：

| 開檔機器的 DPR | 修正前 base | 修正後 base | 圖章變化 |
|---|---|---|---|
| ≤ 1（非 HiDPI） | 48 | 40 | **−16.7%** |
| ≤ 1.5 | 32 | 40 | **+25%** |
| ≤ 2（多數 Retina / density-2） | 40 | 40 | **不變** |
| > 2（density-3） | 32 | 40 | **+25%** |

修正前同一份檔案在兩台機器上最多差 **1.5 倍**（48 vs 32）；修正後 **0**。

## 超過上限的 `pen-width` 會怎樣（mvbf 實測，2026-09-16）

造一個把 `pen-width` 改成 **96** 的 OLF（正常值 42.667），在 mvbf 開起來：

| 階段 | 圖章可見寬 | 圖章間距 | 換算圖章框 |
|---|---|---|---|
| 對照組：同檔另一排 `pen-width=42.667` | 32 px | 56 px | **40 pt**（= 上限） |
| 開檔後 `pen-width=96` | 53 px | 91 px | **65 pt**（+62%） |
| **把粗細 slider 拖一點點之後** | 29 px | 50 px | **35 pt**（−46%） |

65 pt 完全符合 `40 × (0.5 + 96×0.5/42.667)`。

**結論：不會壞，而且這個降級策略是合理的。**

1. **開檔**：**保留檔案原本的大小**，正常算繪，只是比使用者能設定的最粗還粗。
   副作用是解碼尺寸可能超過素材的 96 px → 會糊。沒有例外、沒有錯誤訊息。
2. **選取**：adorning menu 的粗細 slider **顯示在滿格**，
   因為 `annotation_set.dart` 回報選取寬度時 clamp 成 `maxStrokeSize`，
   `adorning_color_picker.dart` 的 `value` 又 clamp 一次（所以 Flutter `Slider` 不會 assert）。
   值超出可表示範圍時把拉桿頂在最大值是常規做法。
3. **只有使用者主動拉動粗細 slider** 才會改寫：`adorning_menu_bloc` 的
   `AdorningMenuSetThicknessEvent` → `setPaintWidth()` + `setShapePenImage()`。
   查證過：改顏色走 `_setColor`、移動／旋轉／改透明度**都不會**碰寬度
   （全 repo 只有 `adorning_menu_bloc` 的 thickness handler、
   `modify_anno_line_thickness_command`、以及 OLF reader 會呼叫 `setPaintWidth`）。

值本身**沒有任何 clamp**，上限完全靠滑桿的 `max` 間接保證 —— 而這正是它能保留超標檔案的原因。
`StrokeAndOpacitySliders` 那支沒有 clamp 的 slider 三個呼叫端
（`painter_picker` / `browser_doodle_view` / `object_dialog`）全是筆／物件工具的設定值，
拿不到選取筆畫的原始寬度，所以沒有會 assert 的路徑。

> **不要在讀檔時 clamp。** 檔案存的時候使用者要的就是那個大小；新版設不到那麼大，
> 那就至少讓舊檔維持原樣，只在使用者主動改粗細時才落到新範圍內。
> 讀檔就截斷（44 → 32，縮 27%）反而是破壞既有內容。
> **VB-2164 的修改沒有碰這條**（只動算繪基準，`pen-width` 的讀寫未變）。

殘留的小瑕疵（**不是缺陷，也不在本票範圍**）：slider 顯示的值跟實際不符，
使用者看不出這筆超標；而且只要拖一格就會從 65 pt 掉到 35 pt，落差很大。
要改善的話是 UI 回饋問題（例如顯示真實值），不是算繪或資料問題。


## 未查證 / 翻案條件

- **狸貓 mac 的畫布縮放行為是讀碼推得，沒有實機驗證。** 要坐實得把 mac app build 起來，
  在同一份內容上做跟上表一樣的量測。
- ~~狸貓 mac 的 v-next 讀檔沒有除 ratio~~ —— **已判定為正確**。v-next 規定 `pen-width` 是
  **絕對 px、與 zoom 無關**（`contract.md:254`、`vnext-spec.md:20`），所以 v-next 路徑
  （`OLFCanonicalMapping.swift` 的 `max(1, pen-width)`）不除 ratio 是對的；legacy 路徑
  （`OLFReader.mapStroke` 的 `pen-width / ratio`）除 ratio 也是對的（legacy Flutter 檔乘過 ratio）。

  **但衍生一個真實問題**：v-next 的 `pen-width` 可以超過滑桿上限 32 ——
  Sparrow 來源的預設值經 `+20` 校正後就是 **44**。mac 的 `stampScale` 分母是字面常數 32
  且**沒有夾制**。同樣的輸入在 mvbf 也會讓縮放比 > 1。**這條尚未回報給狸貓版。**
  （mvbf 側已實測，見下節。）

---

## 怎麼重新查證

```bash
# 公式的三筆來源 commit（在 edu-droid-flutter）
git log --format='%h %ad %an %s' --date=short -S "maxScale - minScale" -- lib/model/whiteboard_tool.dart
git log --format='%h %ad %an %s' --date=short -S "ThemePNGIcon.iconSize" -- lib/helper/utility_helper.dart

# 四端各自的常數
grep -n "maxScale\|minScale" <mvbf>/lib/model/whiteboard_tool.dart
grep -n "stampBaseSize\|stampScale" <mac>/myViewBoard/Canvas/Model/ShapePenCatalog.swift
grep -n "shapePenStampBaseSize\|stampSide" <android>/app/src/main/kotlin/com/viewsonic/droid/canvas/model/StrokeRender.kt
grep -n "ShapeStampSizeBump" <swallow>/Swallow.Core/DesignSystem/DesignTokens.cs
```

**逐像素量測的做法**（本頁數字就是這樣來的）：截圖畫布區域 → 掃 row/column profile 找非白像素
的連通帶 → 帶內的每個連通段就是一個圖章，段寬＝可見寬度、相鄰段左緣距離＝間距。
比肉眼看可靠得多 —— 14% 的差異用看的分不出來。
