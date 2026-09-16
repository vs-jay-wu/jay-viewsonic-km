# Desktop Mode（桌面標註模式）on macOS — 可行性 POC

狸貓版 mac（`edu-mvb-mac-playground`）把 Sparrow 的**桌面標註模式**搬到 macOS 的可行性研究。
2026-09-10 由 Jay 提出、在本機做出可執行原型後驗證。

**需求單：[VB-2247](https://viewsonic-vsi.atlassian.net/browse/VB-2247)**
（2026-09-16 開立，掛在 `VB-1897` Mac Native 底下）。單裡的範圍、三件待決策事項與驗收條件
都出自這份文件；**細節與證據留在這裡**，Jira 只放結論。

## 入口

| 檔案 | 內容 |
|---|---|
| [`index.html`](index.html) | 可行性結論、舊版 Sparrow 架構對照、功能盤點、macOS 的四個關鍵技術決策、**實測數據**（三螢幕／擷取鏈／進入耗時）、風險與未決、若要正式做的切法建議 |
| [`verify.html`](verify.html) | **人工驗證清單** 6 區 24 項——自動化驗不到的部分（穿透、Space、全螢幕、多螢幕排列、擷取三式）；勾選存 localStorage |

用瀏覽器開 `index.html`。

## 一句話

**可行，而且比 Windows 那側簡單。**
舊版是「獨立 WPF 程序 ⇄ Bridge ⇄ UWP」三個程序在對話，那是 UWP 沙箱逼出來的；
macOS 上標註層只是本 app 的另一個 `NSWindow`，整層 IPC 消失。
**不需要新增任何 entitlement**，只有「擷取畫面」會用到螢幕錄製權限，純標註不用。

## 原型在哪

**程式碼沒有 commit、也沒有推遠端**（需求單是 VB-2247，但原型本身刻意不進版控）。在本機 worktree：

```
~/.mvb-worktrees/poc-desktop-mode        # 本機分支 poc/desktop-mode，off main
  myViewBoard/DesktopMode/               # 6 個新檔，約 1450 行
  myViewBoard/Toolbar/MainToolbarView.swift   # 唯一改動的既有檔（多一顆入口鈕）
  specs/poc/DESKTOP-MODE-FEASIBILITY.md  # 同內容的 md 版（repo 內視角）
```

確認它還在、還沒被動過：

```bash
git -C ~/.mvb-worktrees/poc-desktop-mode status --short
# 預期：M myViewBoard/Toolbar/MainToolbarView.swift
#       ?? myViewBoard/DesktopMode/
#       ?? specs/poc/DESKTOP-MODE-FEASIBILITY.md
```

跑起來：

```bash
open -n ~/.mvb-dd/poc-desktop-mode/Build/Products/Debug/myViewBoard.app
# 主工具列最右邊那顆「螢幕」圖示 = 進入桌面標註模式
```

> 這批程式碼是**丟棄式**的：沒有 DesignTokens、沒有 Flutter parity、沒有測試、沒有 divergence 標記。
> 真的要做時整份重寫。它存在的目的是回答「可不可行、流程長什麼樣」，不是拿來合併。

## 票

| | |
|---|---|
| 需求單 | [VB-2247](https://viewsonic-vsi.atlassian.net/browse/VB-2247) — [mVB Mac][Desktop Mode] 桌面標註模式 |
| 父項 | `VB-1897` Mac Native |
| 實作票 | 還沒開；**一律開在 VB** 並連回 VB-2247（2026-09-16 起不再開 `MT-`） |

開 VB 單的欄位與標題慣例見 [`jira-vb`](../../../../../.claude/skills/jira-vb/SKILL.md) skill。
