# mvbf — 圖片資產

**先讀 [`SKILL.md`](SKILL.md)**（步驟 0–2、註解標準、引號）。這裡只放「真的在做這件事時才需要」的部分，從 SKILL.md 拆出來的，內容未改。

> 什麼時候讀：改了 `.svg` 但 App 顯示舊圖／logo 在亮暗兩個主題取到同一支檔／要驗 `.svg.vec` 的顏色／要讓一張圖跟著主題翻色

---

## 圖片資產：App 讀的不是 `.svg`

### 管線

執行期只讀**編譯後**的 `images/dist/<name>.svg.vec`（`UtilityHelper.getSvgVectorPath`），
原始 `.svg` 從來不會被打開。新增或改圖：

```bash
mkdir -p tmp_images && cp <new>.svg tmp_images/
make images    # vector_graphics_compiler → images/dist/*.svg.vec，再把 svg 搬進 images/
```

`tmp_images/` 是 gitignore 的暫存區，`make images` 跑完會自己清空。

⚠️ **改了 `.svg` 卻沒跑 `make images`：測試全綠、App 顯示舊圖**，沒有任何徵兆。
驗 dist 有沒有同步（不需要人眼）——重編到暫存目錄比 sha：

```bash
fvm flutter packages pub run vector_graphics_compiler --input-dir <tmp> --out-dir <out>
shasum <out>/<name>.svg.vec images/dist/<name>.svg.vec   # 相同 = 同步
```

編譯是決定性的：同一份 svg 重編會 **byte-identical**（VB-2267 實測，含對照組）。

### `.vec` 裡的顏色**可以**用位元組驗

填色編在**檔頭的顏色表**：offset 15 起、stride 10、每格 **3 byte 且是 BGR**。
VB-2267 的亮暗兩版實測（同一份幾何、只換色 → 兩檔等長 8601，只差 21 個 byte）：

```
offset  15/25/35/45/55/65/75（7 格）
light:  25 00 db · 25 00 db · 25 00 da · 27 00 db · 26 00 d8 · 24 00 d9 · 27 00 d8
dark:   ff ff ff × 7
```

BGR 反轉後正好是亮色 SVG 裡那六個紅（`#db0025` 佔兩格）。

**寫斷言不要寫死位移**（位移隨檔案與 compiler 版本而異）。驗不變式本身就夠：
兩檔**等長**、**有差異**、且**每個差異位置在暗版都是 `0xff`**。這條擋得住
「換錯顏色後重編」與「.vec 被換成別份美術」，實測兩種變異都會紅。

> ⚠️ **我一開始下錯結論。** 掃 ARGB uint32 掃不到東西（白版紅版數字一模一樣），
> 我就寫下「`.vec` 的顏色沒辦法用位元組驗」—— 實際上只是**編碼假設錯了**（是 3-byte BGR）。
> 是 mvbf PR #279 的 reviewer 指出來的。
> **「我的探針壞了」不等於「這件事驗不了」**，見 `cross-system-claims.md` §5。

### 亮／暗雙檔：`_edu` 後綴慣例

`UtilityHelper.getThemeFileName(base, isLight)`：亮色 → `${base}_edu`、暗色 → `base`。

| 要什麼 | 用哪個 |
|---|---|
| 跟隨主題 | `VSThemeSvgImage` / `VSThemeSvgIcon`（內部走 `theme.getSvgAssetPath`） |
| 不分主題 | `VSSvgImage` / `VSSvgIcon` |
| 預載清單 | `ImageCollection` 的 `themeSvgs` vs `noThemeSvgs`，要跟上面對齊 |

⚠️ **`VSIcons` 的常數必須是不含 `_edu` 的 base name，否則整個機制靜默空轉。**
`myViewBoard_logo` 曾經寫成 `'myViewBoard_logo_edu'`，等於直接當檔名用，
`getThemeFileName` 在兩個主題回同一支檔 —— 畫面照常顯示、零錯誤訊息。
**這就是 VB-2267 的根因。**

**徵兆**：常數值自己帶了 `_edu` / `_on` / `_off` 後綴，卻被標成 `/// theme`。

### 要讓一張圖跟著主題翻色之前，先追它畫在什麼底上

**底不跟著主題翻，圖就不能翻。** repo 裡有些表面的顏色是寫死的（直接用
`VSGlobalColors.*` 或裸 `Colors.*`），不走 `vsColors` token，暗色主題下不會變暗。
把白版圖畫上去等於消失，而且**畫面不會有任何錯誤徵兆**。

對**每一個**消費點各查一次（不能只查一個就推論其他的）：

```bash
grep -n 'vsColors\|Theme\.of' <畫那塊底色的檔>   # 沒命中 = 這塊不隨主題變
```

VB-2267 實例：標題列 / 設定▸關於 / 登入框三處的底都是 `vsColors.containerBackground`
（暗色會變暗）✅ 可以翻；手掌擦 `eraser_palm_helper.dart` 全檔零 `vsColors`
❌ 必須固定取亮色版。

---
