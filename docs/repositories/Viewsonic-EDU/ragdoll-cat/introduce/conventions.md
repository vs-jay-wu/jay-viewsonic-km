# 命名規範

## Class 命名

格式：`ClassSwift_{Function}_{Component}`

```
ClassSwiftTextView
ClassSwiftLoginButton
ClassSwiftQuizCardView
```

ViewModel / WindowModel / WidgetModel 依所屬功能命名，不加 ClassSwift 前綴。

---

## XML android:id

### 一般元件

單一單字元件 → 全名小寫：
```xml
<!-- Button -->
android:id="@+id/button_confirm"

<!-- TextView -->
android:id="@+id/textview_title"
```

多單字元件 → 取每個單字首字母縮寫轉小寫：
```xml
<!-- LinearLayout -->
android:id="@+id/ll_container"

<!-- RecyclerView -->
android:id="@+id/rv_student_list"
```

常見縮寫對照：

| 元件 | 前綴 |
|------|------|
| `LinearLayout` | `ll_` |
| `ConstraintLayout` | `cl_` |
| `FrameLayout` | `fl_` |
| `RecyclerView` | `rv_` |
| `ScrollView` | `sv_` |
| `ImageView` | `iv_` |
| `TextView` | `tv_` |
| `Button` | `button_` |
| `EditText` | `et_` |
| `CheckBox` | `cb_` |

### Custom ClassSwift View

前面加 `cs` + 類別縮寫：
```xml
<!-- ClassSwiftTextView -->
android:id="@+id/cstv_student_name"
```

---

## Layout 資源檔命名

```
activity_xxx.xml       → 為 Activity 使用
fragment_xxx.xml       → 為 Fragment 使用
window_xxx.xml         → 為 Window（floating window）使用
dialog_xxx.xml         → 為 Dialog 使用
item_xxx.xml           → RecyclerView / ListView item
view_xxx.xml           → 獨立 include 的 view 片段

自訂 View（Custom View）→ 以 XML id 前綴開頭：
ClassSwiftTextView → cstv_layout_xxx.xml
```

---

## Drawable 資源命名

| 類型 | 前綴 | 範例 |
|------|------|------|
| Icon | `ic_` | `ic_close.xml` |
| Background | `bg_` | `bg_button_primary.xml` |
| Selector | `selector_` | `selector_tab_item.xml` |
| Shape | `shape_` | `shape_card_rounded.xml` |

---

## Color 資源

在 `colors.xml` 中定義語意色彩名稱，避免直接在 layout 使用 hex：

```xml
<color name="cs_primary">#XXXXXX</color>
<color name="cs_on_primary">#FFFFFF</color>
<color name="cs_surface_card">#XXXXXX</color>
```

---

## String 資源

使用 snake_case，以功能模組為前綴區隔：

```xml
<string name="login_title">登入</string>
<string name="quiz_submit_button">送出答案</string>
<string name="error_network_timeout">網路連線逾時，請重試</string>
```

---

## Kotlin Extension Functions

Extension function 應放在對應類別的 `utils/extension/` 目錄下：

```
utils/extension/
├── ViewExtension.kt
├── ContextExtension.kt
├── StringExtension.kt
└── ...
```

---

## API Response Model

所有 API response data class 放在 `api/response/` 下，以 `Response` 結尾命名：

```
QuizResultResponse
StudentListResponse
ClassroomInfoResponse
```

Request body 放在 `api/body/` 下，以 `Body` 或 `Request` 結尾命名。

---

## Git 分支策略

採用 **Git Flow**：

| 分支類型 | 用途 |
|----------|------|
| `main` | 等同 master，正式版本 |
| `develop` | 開發預設分支 |
| `feature/xxx` | 新功能開發 |
| `release/xxx` | 準備發版 |
| `hotfix/xxx` | 緊急修復 |

## Code Review 規則

所有 PR 必須至少包含以下任一組合的 reviewer：

- Alex + Denis 或 Nick
- Brandon → Alex + Denis 或 Nick 任一
- Nick → Denis + Alex 或 Brandon 任一
