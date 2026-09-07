---
name: cs-review
description: "Use when reviewing code in ragdoll-cat (ClassSwift Android) — own changes before delivery, a PR, or when relaying another reviewer's findings. Covers the finding classes this repo's reviews keep producing (Roborazzi fixture/production parity, geometry consumed by unscaled code) and how to handle a review that conflicts with a prior decision. Examples: \"review cs 這些改動\", \"看一下 ragdoll-cat 這個 PR\", \"reviewer 給了意見\""
---

# ragdoll-cat code review

**先讀 `cs` skill**（團隊 rules 清單、fusion 兩種跑法、commit 格式、Roborazzi golden 復活機制）。

「收到別人的 review 不要照單全收」的通則寫在 `mvbf-review` §5，**與 repo 無關、一樣適用**
（尤其「診斷對、修法錯」那條）。這裡只放 ragdoll-cat 特有的、以及那份通則沒涵蓋的。

---

## 1. Roborazzi 的 fixture 必須與 production 的 Context 一致

這個 repo 的 PR gate 是 Roborazzi（`test-with-feature.md` Type B）。它有一個**安靜失效**的模式：

> 當你改的是「一整類畫面**怎麼被渲染**」（密度、主題、語系、字級來源）而不是畫面內容，
> **既有 golden 會全部繼續綠，同時全部停止覆蓋 production。**

因為每一支 snapshot 測試都是自己建被測物件的 Context。production 換了，fixture 沒換，
golden 釘住的就是一個**永遠不會出貨**的配置。

VSFT-10092 實例：`Mvb*` quiz 視窗只在 fusion 出貨，而 fusion 一律以 1.2 倍密度的 Context
inflate；但 169 張 golden 全部是從 Activity 的 Context 建的，也就是 1x。於是
**截字、裁切、`wrap_content` 那一列放不下 —— 這些 1.2x 才會出現的風險，在任何視窗上都不可能變紅。**

改完這類東西要問一次：

> **「改完之後，還有任何一張 golden 釘住的是真的會出貨的樣子嗎？」**

答案是「沒有」就要一併改 fixture 並重錄，不能只補一張新測試了事。

### 遷移範圍要逐項判斷，不是整批換

reviewer 說「把 `Mvb*` snapshot 測試都改成加權」時要逐支檢查**它是否也有未加權的出貨路徑**：

| | |
|---|---|
| 只在 fusion 出貨的 `Mvb*Window` | 改 —— 1x golden 本來就沒有意義 |
| 共用 widget（如 `CSResultOptionBarItem`） | **不要改** —— 獨立 app 也用它、而且是 1x，改成加權會**失去** 1x 覆蓋 |
| 刻意維持 1x 的（遮罩、toast） | 不要改，並在 helper 的 KDoc 寫明為什麼 |
| Activity 畫面（不走 Koin 視窗 factory） | 不要改 |

## 2. `createConfigurationContext()` 不帶主題

`createConfigurationContext()`（`scaledBy()` / `localizedContext()` 都用它）回傳的 Context
**沒有主題**。直接拿它 inflate Material 元件會炸：

```
java.lang.IllegalArgumentException: The style on this component requires your app theme
to be Theme.AppCompat (or a descendant).
    at com.google.android.material.internal.ThemeEnforcement.checkTheme
```

（VSFT-10092 實例：`MvbImageUploadView` 裡的 `LinearProgressIndicator`，一次炸掉 17 支測試。）

production 一直是 `LayoutInflater.from(ContextThemeWrapper(context, Theme_MaterialComponents))`，
所以測試裡**包 `ContextThemeWrapper` 才是與 production 一致，不是為了讓測試過** ——
這句要寫進 KDoc，否則下一個人會把它當多餘的包裝拿掉。

## 3. 「一邊長、另一邊沒長」＝ 靜默裁切的簽名

測試若把 host 的某個尺寸從**未加權**的 Resources 取，而被測物件是加權的，
golden 會拍出一張**裁切過**的圖，然後永遠綠。

VSFT-10092 實例（而且第一個踩到的是自己）：`MvbQuestionPanelWindowSnapshotTest` 的 host 寬度是
`activity.resources.getDimensionPixelSize(...)`，golden 從 864×772 變成 864×**925** ——
高度長了、寬度沒長。改成從加權 Resources 取之後才是 1037×925。

**偵測方式**：重錄後比對新舊 golden 的尺寸，只有一軸變化就去找那個寫死／未加權的尺寸。

```bash
# 對每張改動的 golden 比對舊尺寸（需要 PIL）
git status --porcelain app/src/test/snapshots | awk '{print $2}' | while read p; do
  python3 - "$p" <<'PY'
import sys, io, subprocess
from PIL import Image
p=sys.argv[1]
new=Image.open(p).size
old=Image.open(io.BytesIO(subprocess.check_output(['git','show',f'HEAD:{p}']))).size
if old!=new and (old[0]==new[0]) != (old[1]==new[1]):
    print('只有一軸變化 →', p, old, '→', new)
PY
done
```

## 4. 改視窗的「畫法」時，風險在幾何被未加權的程式碼消費

改一個視窗怎麼繪製（密度加權是典型），最容易漏的**不是視窗裡面的像素**，
而是**外面有誰在讀它的幾何**。VSFT-10092 的 review 用這一條抓出三個問題，而我原本一個都沒有。

改完之後要主動找這幾類消費者：

- **擺位／定位器讀「錨窗的即時尺寸」** —— `BesideAnchorWindowPlacement` 讀
  `anchor.customWindow.getCurrentSize()`，錨窗放大後整對就撐破螢幕，
  `SideBySideWindowPositioner` 從「並排」掉進「夾邊重疊」的分支
- **成對視窗被設計成尺寸相同** —— `MvbActivationStatusWindow` 與
  `SelectOrgAndSelectClassWindow` 是同一組常數 `365.33 × 485.33`，好讓活化卡成功後
  把同一個位置交給選班卡（SC-009）。只放大一邊就破了那個交接
- **同一個 class 裡兩處換算用了不同密度** —— `KatexView` 把 `android:textSize` 以加權
  Resources 解析出 px、卻用系統密度換回 dp，而它量回來的高度又用加權密度換算。
  兩處必須同基準，否則字級與行高**必有一個**差 1.2 倍

```bash
# 放大某個視窗後，找誰在讀它的尺寸／位置
grep -rn "getCurrentSize()\|getWindowConfig().location" app/src/main/java
# 找「兩個視窗被寫成同尺寸」的成對常數
grep -rn "WINDOW_WIDTH_DP\s*:\s*Float\s*=" app/src/main/java
```

## 5. review 意見與「用名稱明確釘住相反行為」的測試衝突時，測試是既有決定

改一個純函式來滿足 review 之前，先看它的測試怎麼寫的。

VSFT-10092 實例：把 `SideBySideWindowPositioner` rule 4 加上「左移錨窗」能把重疊從 500px
壓到物理下限 278px，而且只影響 1x 走不到的分支 —— 看起來是純賺。但
`SideBySideWindowPositionerTest` 有一條測試在**名稱**（`without moving the anchor`）與
**斷言訊息**（`no room to make: anchor stays`）兩處明確釘住相反行為。那是原作者刻意的決定，
不是漏寫。

**判準**：測試的名稱／訊息把某個行為講成「刻意如此」，就當成既有決定 ——
**在原地寫下你想改什麼、能換到什麼、為什麼沒改，然後另開票**，不要為了讓一份 review
變綠就推翻它。反過來，測試只是「碰巧記錄了當時的實作」（名稱只描述輸入輸出、沒有意圖），
就可以改。

## 6. 交付時把「刻意接受的缺陷」寫在它會被讀到的地方

產品決定接受一個看得出來的缺陷時（VSFT-10092 接受選班卡與 Quiz Collection 重疊），
**至少要寫三個地方**，否則它會被當成 bug 回報或被「修好」：

1. **缺陷發生的那行程式碼旁** —— 附兩台裝置的算式，讓下一個人不用自己重算
2. **被違反的那條 KDoc 不變式** —— 標明它現在只在什麼條件下成立
   （`SideBySideWindowPositioner` 的「never stacked on top of it」自 1.2x 起只在 1x 成立）
3. **PR 描述與 Jira 留言** —— 寫成「已知落差，刻意保留，請不要當成 bug 回報」

---

## 相關

- `cs` — 這個 repo 的工作核心（先讀）
- `mvbf-review` §5 — 「不要照單全收」的通則，與 repo 無關
- `handoff-docs` — PR 描述與 Jira 留言的寫法
