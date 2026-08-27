# Mock 框架統一 — 移除 Mockito，收斂到 mocktail

> ⚠️ **本文件為 AI 產出的分析草稿，不是團隊定案。**
>
> - 第 2～4 節的評價與建議是 AI 的判斷，**未經團隊討論、未經任何 reviewer 同意**，不代表 mvbf 的測試策略共識。
> - 第 1 節的調查數字與第 5 節的執行結果是實測值（指令輸出可覆現），但仍可能隨程式碼演進而過期。
> - 引用本文件前請自行覆核；要當成決策依據，需先走正常的團隊討論流程。
> - **但第 5 節的程式碼改動已實際送出**（PR [#222](https://github.com/Viewsonic-EDU/edu-droid-flutter/pull/222)，等待 review）。也就是說：「拔掉 mockito」這個動作已經在 review 流程上，是否採納由 reviewer 決定；第 2～4 節的其餘建議則完全沒有動。

針對「統一 mock 框架：移除 Mockito 依賴，全面統一改用 mocktail」這項提案的現況調查、優缺點分析，以及實際執行結果。

調查與執行日期：2026-08-12
Repo：`edu-droid-flutter`（mvbf 主 app）

相關檔案：
- `pubspec.yaml` — `dev_dependencies`
- `test/unit_tests/bloc/dialog_bloc_test.dart`
- `test/annotation_model/table/table_annotation_test.dart`
- `test/annotation_model/adorning_able/line_able_test.dart`
- `test/annotation_model/helpers/annotation_set_helper_test.dart`
- `test/command/modify_anno_opacity_command_test.dart`
- `test/command/modify_anno_lock_command_test.dart`
- `test/command/transform_anno_command_test.dart`

---

## 1. 調查前的假設 vs 實際現況

提案的字面讀法會讓人以為這是一次「框架遷移」。實測後不是 — 實際狀況單純得多。

| 項目 | 數量 |
| --- | --- |
| `test/` 下 test 檔案總數 | 191 |
| import `package:mocktail` | 59 檔 |
| import `package:mockito` | **7 檔**（全在 `test/`，`lib/` 完全沒有） |
| mockito codegen 產物（`*.mocks.dart`） | **0 個** |
| 主 app `pubspec.yaml` | 同時掛 `mockito: ^5.4.4` 與 `mocktail: ^1.0.4` |

### 關鍵發現：那 7 個檔案沒有真的在「用」Mockito

7 個檔案**完全沒有用到 Mockito 的核心 API**：

- 沒有 `@GenerateMocks` / `@GenerateNiceMocks`，因此 `build_runner` 從未為 mockito 產生任何 mock（0 個 `.mocks.dart`）
- 沒有任何 `when(...)` stub 設定
- `dialog_bloc_test.dart` 裡出現的 `verify(...)` 是**該檔自己定義的 local top-level function**（跟 Mockito 的 `verify` 同名，Dart 的 local 宣告會遮蔽 import，所以一直是走自己那個），不是 Mockito 的行為驗證

它們對 Mockito 的唯一依賴，是借用 `Mock` 這個 base class 來寫空殼：

```dart
class MockAnnotation extends Mock implements Annotation {}   // 全部都是這種用法
```

也就是說：**mvbf 主 app 其實沒有在使用 Mockito，只是忘了拔掉。**

### 範圍陷阱：`plugin/` 底下的 mockito 不能動

以下 pubspec 也有 mockito，但都是**第三方上游 fork**，動它們只會製造未來 merge 衝突：

- `plugin/camera-0.11.0/pubspec.yaml` — `mockito: 5.4.4`
- `plugin/camera_avfoundation/pubspec.yaml` — `mockito: 5.4.4`
- `plugin/pdfx/script/tool/pubspec.yaml` — `mockito: ^5.0.7`
- `plugin/appium_flutter_server/pubspec.yaml` — `mockito: any`

自家 `packages/` 已經是 mocktail，本來就一致：`packages/sketch_recognizer`、`packages/spotlight`。

**結論：這項提案的有效範圍只有主 app 的 `pubspec.yaml` + 7 個 test 檔。**

---

## 2. 提案評價

方向對，但它把一件 30 分鐘的清理工作，包裝成看起來需要開會拍板的「框架統一決策」。

### 真實的優點

- 少一個 dev_dependency，少一組 version solving 約束
- 消除「新人該用哪個？」的認知分歧 — 59:7 的比例其實早就定案了
- mocktail 不需 codegen，跟 mvbf「已經沒在跑 mockito codegen」的現實一致

### 成本

- 7 個檔案改 import 行；`Mock` base class 在兩邊同名，多數檔案只需換那一行
- 潛在風險（需實跑才知道）：兩者對「未 stub 的方法」機制不同（Mockito 走 `provideDummy`，mocktail 走 `registerFallbackValue` + `MissingStubError`）。原本靠 Mockito 預設行為默默過關的測試可能會炸

### 被高估的收益

「統一框架」**不會提升測試品質**。`extends Mock implements Annotation` 是 `noSuchMethod` 空殼，它**繞過型別檢查** — 改了 `Annotation` 的介面，這些測試不會編譯失敗，只會在執行期回傳無意義的預設值或 throw。換成 mocktail 之後，這個問題一模一樣。

---

## 3. 其他選項（比「選哪個框架」更值得討論）

真正的議題不是 Mockito vs mocktail，而是 **mock 用得太多**。

### 選項 C：偏好 fake / 真實物件，mock 只留給 I/O 邊界

mvbf 的 test 目錄裡其實已經有這個習慣（`test/hotkey/`、`test/helper/`、`test/bloc/` 下不少手寫 fake 與直接用真實物件）。

`Annotation`、`PageData`、`PageSetModel` 這些是**純資料 / 領域模型**，本來就該直接 `new` 出來，或寫 in-memory fake：

```dart
// 而不是 class MockAnnotation extends Mock implements Annotation {}
final anno = Annotation(id: 'a1', opacity: 1.0, isLocked: false);
```

好處：介面一改就編譯失敗（測試才有防護價值）、讀起來像真實用法、不用 stub 一長串 getter。mock 只保留給真的沒辦法的東西 — 網路、檔案系統、platform channel、時間。

### 選項 D：不做 big-bang，用機械化規則收斂

不強迫改舊測試，改成「新程式碼不准 import mockito」，用 lint 擋（例如 `custom_lint` 的 banned imports）。存量隨手遇到再改。

風險最低，但「pubspec 還掛著 mockito」就沒解決 — 除非直接拔 dependency，那 7 檔就非改不可，也就回到 big-bang（只有 7 檔，其實無所謂）。

### 選項 E：針對邊界用專用 test double

比通用 mock 更穩定：

- HTTP → `MockClient`（`package:http/testing.dart`）或 `http_mock_adapter`
- 時間 → `fake_async`
- bloc → 已經在用的 `bloc_test`

這些不是 mock 框架的替代品，而是讓 mock 的使用面積縮小。

---

## 4. 建議

1. **拔掉 mockito 直接做，不要當成 initiative 討論**。7 檔、無 codegen、零 production 依賴 — 這是清理，不是遷移。
2. **範圍限定主 app `pubspec.yaml`**，`plugin/` 下的第三方 fork 一律不動。
3. **真正該提的議題是「`extends Mock implements <領域模型>` 這種用法要不要收掉」** — 這才影響測試的防護力。但應分開談，而且漸進進行（遇到就改），不要開專案。

一句版：**Mockito 已經沒人在用了，拔掉就好；比較值得花力氣的是別再對純資料模型下 mock。**

---

## 5. 實際執行結果（2026-08-12）

已依 `edu-droid-flutter` 的 `.claude/commands/dev-deliver.md` 流程走完並開出 PR。

| 項目 | 值 |
| --- | --- |
| Branch | `Jay/remove-mockito-dependency` |
| Commit | `699ba44b6` — `[Refactor] 移除 mockito 依賴，測試 mock 框架統一為 mocktail` |
| PR | [Viewsonic-EDU/edu-droid-flutter#222](https://github.com/Viewsonic-EDU/edu-droid-flutter/pull/222) |
| Jira | 無 ticket → 依 dev-deliver 決策表跳過所有 Jira 操作（Phase 1 / Phase 7） |
| Diff 規模 | 9 檔，+7 / −24 |

### 改動內容

1. 7 個 test 檔的 `import 'package:mockito/mockito.dart';` → `import 'package:mocktail/mocktail.dart';`（每檔僅此一行）
2. `pubspec.yaml` `dev_dependencies` 移除 `mockito: ^5.4.4`
3. `fvm flutter pub get` → `pubspec.lock` 中的 `mockito` 條目已消失

### 驗證

| 階段 | 結果 |
| --- | --- |
| **全量 `make test`（191 檔）** | **`02:58 +2780 ~1: All tests passed!`**（2780 pass / 1 skip / 0 fail, exit 0） |
| 改動前基準（受影響 7 檔） | `00:01 +117: All tests passed!` |
| 改動後（受影響 7 檔） | `00:03 +117: All tests passed!` |
| `dart analyze`（7 檔） | `No issues found!` |
| `grep -rn "package:mockito" test lib integration_test` | 0 筆 |
| `git diff` 純格式噪音檢查 | 0 行（符合 `no-auto-format`） |

工具鏈：`fvm` + Flutter 3.41.5（`.fvmrc`）。

> 附註：repo 根目錄存在 `test_failures.txt` / `test_failures2.txt`，原本推測全量測試本來就有已知失敗、結果需另行判讀。**實測全量是全綠的**，所以那兩個檔案是舊紀錄，不影響本次判讀。

### 未做的事

- 未處理「選項 C」（收掉對領域模型的 mock）— 那是另一個議題，PR #222 的 body 有留一段說明並明確標註「尚未經團隊討論、不在該 PR 動」。
- 未加 lint 規則擋 mockito import（拔掉 dependency 後，import 本來就會編譯失敗，lint 屬加分項）。

### 沒有預期外的破壞

原本擔心的「Mockito `provideDummy` vs mocktail `MissingStubError` 行為差異」沒有發生 — 因為那 7 個檔案從未設定 stub，也沒有呼叫未 stub 的方法回傳 non-nullable 值。這符合「Mockito 只被當作空殼 base class」的調查結論。
