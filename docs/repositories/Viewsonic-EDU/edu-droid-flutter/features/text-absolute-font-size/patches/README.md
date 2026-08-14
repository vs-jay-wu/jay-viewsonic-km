# VSFT-6964 patch 保存

工作區快照，供未來續做 / 對照使用。**程式碼本身未 commit**，這份 patch 是唯一的完整備份。

## Git 座標（產生 patch 當下）

| 項目 | 值 |
|---|---|
| 產生日期 | 2026-08-14 |
| Repo | `Orgs/Viewsonic-EDU/edu-droid-flutter`（mvbf） |
| 工作分支 | `Jay/VSFT-6964-text-font-size` |
| **base（master HEAD）** | `093103866eeba22850f8ed267490533f6a694560` |
| base commit 標題 | `[User Story VSFT-9739] 快取讀取規則對稱化，並以 schema 簽章讓改版後強制重新偵測` |
| merge-base(HEAD, master) | 同上 —— **分支自 master 開出後未再 merge** |
| 舊修法分支（保留） | `Jay/VSFT-6964-tmp-font-size` @ `04b2c3571a4bc4f6927983088ca18a3fa23dd6f3` |
| 更早的 WIP commit | `f41b437c20fd172cf24df65243b7451b759c667a`（票上提到的起點） |

`vsft-6964-worktree-vs-master.patch` = **工作區（含未 staged 與未追蹤檔案）相對 base commit 的完整差異**，共 19 個檔案。

## 還原方式

```bash
cd Orgs/Viewsonic-EDU/edu-droid-flutter
git checkout -b <新分支> 093103866
git apply <此目錄>/vsft-6964-worktree-vs-master.patch
```

若 master 已經往前走，先確認衝突：

```bash
git apply --check --3way vsft-6964-worktree-vs-master.patch
```

## 未來續做前務必先做的比對

因為 base 是 `093103866`，續做前要先看 **base → 當時的 master** 這段期間有沒有人動到相關檔案：

```bash
git log --oneline 093103866..master -- \
  lib/annotation_model/text_annotation.dart \
  lib/widget/dialog/text_editor/ \
  lib/helper/file_olf_save_helper.dart \
  lib/helper/olf_file/olf_reader.dart \
  plugin/flutter_quill-10.5.5/lib/src/editor/widgets/
```

特別要注意的檔案（本次改動的核心）：

- `lib/annotation_model/text_annotation.dart` —— 改最多（`normalizedClone` 參數化、存檔正規化、格線對齊、iwb 補償）
- `lib/widget/dialog/text_editor/ui_v2/text_editor.dart` —— TextScaler、commit 域轉換
- `lib/widget/dialog/text_editor/ui_v2/text_editor_size_bridge.dart` —— **新檔**
- `plugin/flutter_quill-10.5.5/.../text_line.dart` —— quill patch（caret 高度乘 textScaler）

## patch 內容組成

這份 patch 混合了兩批改動（未分離）：

1. **cherry-pick 自 `04b2c3571`** 的 WIP（2026-07-29 舊修法）—— 包含一些夾帶檔案：
   `android/build.gradle`、`macos/Podfile.lock`、`native_screenshot/.classpath`、
   `app_update_helper.dart`、`docs/pptx-import-conversion-panic-fix.md`（與本票無關）
2. **2026-08-14 的新實作**（第 1、2 項 + 格線對齊 + Q2）

> ⚠️ commit 前記得把第 1 類的夾帶檔案挑掉，並確認 `lib/debug_credentials.dart`
> （本機憑證，不應進 commit）。

## 驗證狀態（產生 patch 當下）

- `flutter test` 全套 **2923 passed / 0 failed**（+1 skipped）
- 真機 `3629105H804NHC`（Pixel Tablet, edla debug）：
  zoom 100% 建 fontSize=20 → zoom 175% → 點進編輯，**toolbar 顯示 20** ✅
- **尚未驗證**：游標高度 / 選取 / IME / 多行斷行 / lasso resize 後進編輯 /
  OLF 實際存檔內容 / mvbW 雙向開檔

詳見 [`../findings.html`](../findings.html) §10–11 與 [`../overview.html`](../overview.html)。
