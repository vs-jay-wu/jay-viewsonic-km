# 備案：CS 浮動視窗改成「單一 overlay window ＋ 真 z-index」

**狀態：不做（2026-09-16 決定）。** 不是「不好」，是**被 Android 平台擋住**。
spike 已完整做過並實測，下面三段是那次 spike 的產出。

相關：[換窗閃爍的調查紀錄](../repositories/Viewsonic-EDU/ragdoll-cat/features/window-switch-flicker/)
／平台限制的完整版在團隊 repo `ragdoll-cat/docs/window-framework.md` §3

## 想解決什麼

CS 的浮動視窗都是 `TYPE_APPLICATION_OVERLAY`，而 **Android 沒有任何公開 API 能重排
已附加 overlay 的 z-order**。所以「把視窗帶到最上層」只能拆掉重建，中間要靠一張截圖遮著
—— 換窗閃爍的所有問題都源於此。

若所有視窗收進**一個** overlay window、各自是 child view，切換就只是 `bringToFront()`。

## 討論出來的結論（這才是價值）

### 1. 視覺面完全達標，這點實測過

合成測試場（兩張跟真實 CS 視窗同樣畫法的卡片，含 `elevation` 陰影）：

- `bringToFront()` → `frame_commit` 只要 **16–24 ms**（現行拆建做法 49–107 ms）
- 全程**不需要截圖**，陰影自然一直都在
- 全螢幕 `FLAG_NOT_TOUCHABLE` 的 host **觸控確實會穿透**到底下的 mVB 畫布
  （實測：swipe 畫出的筆跡精準落在對應座標）

### 2. 但卡在兩道平台牆

**牆一：可觸控區縮不成子視窗的聯集。**
業界做法是 `ViewTreeObserver.addOnComputeInternalInsetsListener` +
`InternalInsetsInfo.setTouchableInsets(TOUCHABLE_INSETS_REGION)`。實測：

| 檢查 | 結果 |
|---|---|
| compileSdk 35 編譯 | `Unresolved reference`（不在 public SDK） |
| 反射取 listener 註冊方法 / `InternalInsetsInfo` / `setTouchableInsets` | **都可用** |
| 反射取 **`touchableRegion` 欄位** | **`NoSuchFieldException`** |

該類別列舉得到的成員只有 `contentInsets`、`mTouchableInsets`、`visibleInsets` ——
AOSP 四個裡精準少掉 `touchableRegion`。剩下能用的模式只給**一個矩形**。

> 「縮到所有視窗的聯集矩形」也救不了：實測一組常見擺法，聯集是 `x 36..2568, y 130..1600`
> —— 幾乎整個螢幕（因為兩個視窗常分別在左下與右上）。

**牆二：`FLAG_NOT_TOUCHABLE` 會被系統壓到 80% 不透明度。**
對照實驗（同 process 同時間）：

| 視窗 | 可觸控 | 系統回報 alpha |
|---|---|---|
| 全螢幕 host（`NOT_TOUCHABLE`） | 否 | **0.8** |
| 300×300 測試窗（`NOT_TOUCHABLE`，程式**明確設 `alpha = 1.0f`**） | 否 | **0.8** |
| 兩個透明輸入窗 / 兩個真實 CS 視窗 | 是 | 1.0 |

→ 成因是那個 flag，與尺寸無關，**app 的明確要求會被系統覆寫**。畫素也對得上：
卡片底色 245、實測 247 = `245 × 0.8 + 255 × 0.2`。

### 3. 封閉循環

```
要觸控穿透        → 必須 FLAG_NOT_TOUCHABLE
FLAG_NOT_TOUCHABLE → 系統壓到 80% 不透明度
要 100% 不透明     → 必須可觸控
可觸控            → 吃掉視窗之間的觸控（老師不能在空白處書寫）
要兩者兼得        → 需要 touchableRegion → 拿不到
```

### 4. 還有一個沒驗完、但預期會死的點

變形方案（視覺 host ＋ 每個視窗一個透明輸入窗轉發觸控）裡，**文字輸入預期會壞**：
內容 view 住在既不可觸控又不可聚焦的 host 裡，`EditText` 拿不到焦點也叫不出 IME。
CS 目前有這需求（`CSCreateQuizCollectionFolderWidget` 會為了輸入框動態切 `FLAG_NOT_FOCUSABLE`）。
輸入窗轉發的是觸控，不是焦點，救不了。

另外那個轉發本身**也沒驗成功** —— 37 次 `dispatchTouchEvent` 全部沒有被可點擊元件消費，
成因未隔離（可能只是我 harness 的 bug，但沒繼續追）。

## 為什麼先不做

- 兩道牆都是平台層，只能靠**私有欄位**繞過（會被逐版收緊，不該押在出貨產品上）
- 代價包含：所有 CS 視窗變 80% 不透明、自製一整套輸入路由、很可能失去文字輸入
- 而它要解的那個閃爍，**已經用約 200 行（四個小類別）修掉了** —— 代價不成比例
- 規模：`IWindowContainer` 只有 13 個成員、`CSWindowManager` 只有 5 處硬轉型，
  機械成本其實不高。**卡住的純粹是平台，不是工程量**

## 翻案條件（任一成立）

1. Android 開放任意 touchable region 的**公開** API，或 `touchableRegion` 從非 SDK 名單移除
2. 產品端明確接受「所有 CS 視窗 80% 不透明度」（白畫布上幾乎無感，背景有圖或深色會透出來）
3. 累積出更多**必須靠真 z-order 才能解**的缺陷，使自製輸入轉發 ＋ 失去 IME 的代價變得划算
4. CS 不再需要視窗內文字輸入（那會拆掉上面第 4 點那道牆）
