# Dart Analysis Server 記憶體：排除 mvbf 的 plugin/

mvbf 在 VS Code 開著幾天後，Dart analysis server 會漲到 **14 GB**。
這不是「大專案的正常開銷」，是設定不當造成的基準線過高，再乘上長時間累積。

個人設定，寫在 mvbf 的 `.vscode/settings.json`（該目錄已被 repo 的 `.gitignore` 排除，不會進 git、不影響同事）。

---

## 設定

```json
{
  "dart.analysisExcludedFolders": [
    "plugin"
  ]
}
```

改完要 `Cmd+Shift+P` → `Developer: Reload Window` 才生效。

---

## 為什麼：50 個 analysis context，46 個是 vendored 套件

Dart analysis server 的記憶體**不隨程式碼行數線性成長**，而是隨
**analysis context 數 × 各自的依賴閉包**成長。

每一個 `pubspec.yaml` 就是一個 context，每個 context 各建一個 `AnalysisDriver`，
每個 driver 都要持有：

- 該套件**以及整個傳遞依賴閉包**的 element model（含 Dart SDK 與 Flutter SDK）
- 檔案狀態快取
- 已解析的 AST 快取
- linter 規則狀態

mvbf 實測（2026-08-13）：

```
pubspec.yaml 數: 50        ← 50 個 analysis context
.dart 檔:      3329
程式碼行數:    649,969
產生碼:            8       ← 不是 codegen 造成的
```

65 萬行不算誇張，問題全在 context 數。分布：

```
11  plugin/pdfx                        ← federated plugin，一個套件 11 個子套件
 5  plugin/flutter_quill-9.2.14   ┐
 3  plugin/flutter_quill-10.5.5   ┘   ← 同一套件兩個版本並存
 2  plugin/flutter_inappwebview_android-1.1.3  ┐
 1  plugin/flutter_inappwebview_android-1.0.13 ┘ ← 又是兩版並存
 2  plugin/camera_android-0.10.9+11
 2  plugin/camera-0.11.0
 1  plugin/camera_avfoundation
 ... 其餘 20 幾個 vendored 套件
 1  <root>                             ← 真正在寫的程式碼
```

**50 個 context 裡有 46 個在 `plugin/` 底下**，全是不會去改的第三方套件，
而且同一套件的多個版本同時存在，分析器把每一份都當獨立專案各自載入完整 element model。

那 14 GB 裡，絕大部分花在分析這些。

而 mvbf 的 `analysis_options.yaml` **沒有任何 `exclude`**。

## 為什麼會「越開越大」而不是穩在某個值

分析器的 AST 快取有 LRU 淘汰，但連續多天的 session 中，隨著瀏覽、編輯、切檔案，
累積速度超過淘汰速度，加上 50 個 context 各自在累積，就一路爬。

所以是兩個因素相乘：**設定不當導致基準線過高** × **長時間存活導致累積**。
只修其中一個都不夠。

---

## 實測數字

強制重啟前後（2026-08-13）：

```
14.00 GB (峰值 15.00 GB)  存活 2 天 17 小時   ← kill -9 之前
   314 MB                 存活 4 秒           ← 自動重啟後
   955 MB                 存活 3 分鐘         ← 排除設定生效前的成長曲線
```

同一時間 Claude Code 起的兩個 LSP（走 `dart mcp-server`）：

```
7.68 GB (峰值 10.00 GB)  存活 5 天 22 小時
7.50 GB (峰值  9.40 GB)  存活 6 天 20 小時
```

`dart mcp-server` 本身的峰值曾各自到過 **19 GB**。

當時全機 footprint 53 GB，其中 dart 相關 33 GB，佔 **63%**。

---

## 三個必須知道的限制

1. **不影響 Claude Code。** `dart.analysisExcludedFolders` 是 VS Code Dart 擴充層級的設定，
   Claude Code 走的是 `dart mcp-server` → `dart language-server`，**吃不到這個設定**。
   那兩個 7.5 GB 的 LSP 還是會繼續漲，只能靠定期重啟 session 或
   `pkill -f "dart language-server"`（會按需自動重啟，無副作用）。

2. **`analysis_options.yaml` 的 `exclude` 效果未經驗證。** 它主要控制「哪些檔案被分析」，
   對於**巢狀 pubspec.yaml 是否仍會各自建立 context**尚未實測確認。
   要讓 Claude Code 那側也受惠，得走這條路，但需要先驗證。
   （驗證方式：加上 `exclude: plugin/**` 後重啟 LSP，觀察 footprint 是否下降。）

3. **失去對 `plugin/` 的跳轉。** 排除後，從自己的程式碼跳轉到那些套件的實作不會有結果。
   若有需要，把 `"plugin"` 換成更精確的子路徑（只排除 `plugin/pdfx`、
   `plugin/flutter_quill-9.2.14` 這些大宗）即可。

---

## 怎麼驗證效果

```bash
pgrep -f "client-id=VS-Code" | xargs -I{} footprint -p {} | grep phys_footprint
```

排除生效後，context 從 50 降到 4，footprint 應該穩在明顯較低的水位。

---

## 相關

- [README.md](README.md) —— Gradle build cache 與快取自動清理
- 判斷記憶體要看 **footprint** 不是 RSS：被壓縮／換出的頁面會讓 RSS 暴跌，
  一個 RSS 只剩 2 MB 的行程可能還握著 4.6 GB footprint
- macOS「應用程式記憶體不足」對話框顯示的是 **coalition**（app + 它啟動的所有子行程），
  所以終端機永遠背黑鍋：Warp 顯示 45 GB 時，Warp 本體只有 0.96 GB
