# myViewBoard 品牌圖在暗色主題的紅／白切換 —— 五端現況

**盤點日期：2026-09-17。** 起因是 `VB-2267`（原 `VSFT-6912`）：mvbf 暗色主題下 logo
仍是紅色，與 Sparrow 不一致。

> 這份只記**盤點結果與判準**。mvbf 這端的實作走 `VB-2267`；狸貓版三端 Jay 決定
> 「不管，之後交給其他人處理」（2026-09-17），這份就是給那個人的底稿。

---

## 一句話結論

**各端的行為完全跟著它各自的「復刻來源」走**，不是誰特別疏忽：

| 端 | repo | 復刻來源 | 來源有做嗎 | 自己有做嗎 |
|---|---|---|---|---|
| Android 出貨線（mvbf） | `edu-droid-flutter` | —（自己就是來源） | — | ❌ → `VB-2267` 處理中 |
| Windows 出貨線（Sparrow） | `edu-sparrow-app` | — | — | ✅ 全套 |
| 狸貓版 Android | `edu-mvb-android-playground` | mvbf | ❌ | ❌ |
| 狸貓版 macOS | `edu-mvb-mac-playground` | mvbf | ❌ | ❌ |
| 狸貓版 Windows（Swallow） | `edu-swallow-app` | Sparrow | ✅ | ✅（部分） |

---

## 判準：哪些品牌圖該做紅白切換

**不是所有品牌圖都該翻白。** Sparrow 自己的分法就是現成的答案：

| 類別 | 做不做 | Sparrow 的證據 |
|---|---|---|
| **App 品牌識別**（wordmark、產品標，單獨出現在 chrome 上） | ✅ 做 | `Assets/{Light,Dark}Theme/ProductLogos/` 三張都有白版 |
| **並排的來源／服務圖示**（跟 Google Drive、Dropbox、OneDrive 同一排） | ❌ 不做 | `Assets/CloudDrive/myViewBoard.png` 放在**兩棵主題樹之外**，跟 `GoogleDrive.png` 同層 |

理由：來源圖示旁邊都是別家商標，不會有人隨主題翻色；只翻自家那顆，整排反而不一致。
同一判準見狸貓版 Android 暗色票 spec `0159`（只把單色的 Apple SSO glyph 翻白，
Google／Microsoft 的彩色 glyph 不動）。

mvbf 的 `myViewBoard_icon`（符號標）落在後者 —— 2026-09-17 Jay 裁定**不做**。
程式碼本身也已經表態：帳號選單那個消費點寫著 `preserveIconColor: true`，
`VSIcons` 標的是 `/// no theme, colorful, svg`。

---

## 各端細節

### Sparrow（`edu-sparrow-app`）—— 參考實作

機制：`src/Sparrow.UWP/App.xaml` 把 `x:Key="Light"` 指到 `Themes/Education.xaml`、
`x:Key="Dark"` 指到 `Themes/Corporate.xaml`，同名資源 key 各指一棵資產樹。
`Sparrow.Shared/Assets/{LightTheme,DarkTheme}/` **兩邊各 369 個同名檔**。

實測像素（不透明主色）：

| 資產 | 尺寸 | Light | Dark |
|---|---|---|---|
| `ProductLogos/AppIcon.png`（wordmark） | 215×64 | `(219,0,37)` | `(255,255,255)` |
| `ProductLogos/Whiteboard.png` | 403×120 | `(219,0,37)` | `(255,255,255)` |
| `ProductLogos/Companion.png` | 536×145 | `(247,176,0)` | `(255,255,255)` |
| `DesktopMode/…/myViewBoard.png` | 96×96 | `(219,0,37)` | `(255,255,255)` |
| `DesktopMode/…/myViewBoard_S.png` | 64×64 | `(219,0,37)` | `(255,255,255)` |
| `…/Background/myViewBoardSettingIcon.png` | 80×80 | `(76,76,76)` | `(255,255,255)` |

### mvbf（`edu-droid-flutter`）—— `VB-2267`

根因不是「缺白資產」，是**主題機制空轉**：`VSIcons.myViewBoard_logo` 寫成完整檔名
`'myViewBoard_logo_edu'`，`getThemeFileName` 的 `_edu` 後綴慣例對它失效，
兩個主題都拿到紅版。詳見 km 的 `mvbf` skill〈圖片資產〉。

消費點五處，其中**手掌擦必須維持紅版** —— 它的底色寫死、不隨主題變暗，
白 logo 畫上去會消失。

### 狸貓版 Android（`edu-mvb-android-playground`）

**不是沒注意到，是主動判定不做。** 暗色主題三刀（spec `0153`/`0158`/`0159`）都已完成，
資產全量盤點 `docs/measurements/MT-1441-vector-asset-survey.md` 點名 `myviewboard_logo_edu`，
歸類為「彩色（不可 tint）… 多是 on 態強調色／品牌 logo，暗色下通常維持原樣即可」。

要做的話機制已經有了：`designsystem/ThemedDrawable.kt` 的 `themedDrawableRes(light, dark)`，
目前只用在 `ic_guest`。⚠️ 該 repo 的暗色**不走 Android `-night` 資源限定詞**
（spec `0159` 核心前提 #1），丟 `drawable-night/` 不會生效。

### 狸貓版 macOS（`edu-mvb-mac-playground`）

從沒進過視野：暗色 spec `0083-dark-mode-adaptive-tokens.md` 全文 grep 不到 logo／brand。
10 個品牌 imageset 全部沒有 dark appearance（整個 xcassets 只有 20 個有，清一色是
工具列單色圖示）。消費點：`BrandLogo.swift`（標題列）、`SettingsView`（關於）、
`LoginSheet`（登入）、`CanvasView`（手掌擦區，對應 mvbf 的 `eraser_palm_helper`）等。

⚠️ mac 的手掌擦那處要比照 mvbf 先追底色，不要直接翻白。

### 狸貓版 Windows / Swallow（`edu-swallow-app`）

已有機制與資產：`ThemeAsset` / `ThemeGlyph` 在 `ActualTheme == Dark` 時給檔名加 `.dark`
後綴，全 repo 257 個 `.dark.png`。

| 資產 | 尺寸 | Light | Dark | 消費點 |
|---|---|---|---|---|
| `Assets/Account/AppIcon(.dark).png` | 215×64 | `(219,0,37)` | `(255,255,255)` | `SignInView`（登入畫面） |
| `Assets/Settings/Whiteboard(.dark).png` | 403×120 | `(219,0,37)` | `(255,255,255)` | `SettingsView`（設定▸關於） |

**缺口**：`Companion` 整個資產不存在（Sparrow 兩版都有）；`Assets/Cloud/myViewBoard.png`
沒有 `.dark` 版（但依上面的判準，來源圖示本來就不該做）；找不到標題列 wordmark 的消費點。

---

## 票況

| 票 | 內容 | 狀態 |
|---|---|---|
| `VB-2267`（原 `VSFT-6912`） | mvbf 暗色 logo 與 Sparrow 不一致 | 2026-09-17 搬到 VB 並開工 |
| 狸貓版三端 | **無票** | 2026-09-17 Jay：不管，交給其他人 |

`VB-2267` 原始描述在 2026-04-08 被改寫過一次，**兩張 ADO 對照截圖（mvbf 紅 vs Sparrow 白）
已經不在單上**，URL 只留在 changelog 的舊值裡（`dev.azure.com/viewsonic-ssi/…/attachments/…`）。
Jay 2026-09-17 決定不救。

---

## 證據等級

- **實測**：所有顏色數字（PIL 讀不透明像素取眾數）、資產尺寸、檔案存在與否。
- **讀碼看到**：所有機制描述與消費點（檔名在正文；行號刻意不記，會漂移）。
- **未查證**：沒有跑過任何一支 app，暗色下的實際觀感與對比都沒有目視確認；
  Swallow「沒有標題列 wordmark」只 grep 過 `AppIcon` / `BrandLogo` / `TitleLogo` /
  `Whiteboard` / `Companion` 幾個字串，換命名就會漏。
