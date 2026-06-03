# Next Actions：確定要做的後續工作

> 此處列 **已經確定要做、但尚未實作** 的項目。本文件**不涵蓋實作**，只記錄決策與待辦。
>
> 跟其他文件的區分：
> - `open-questions.md` —— **尚待 PM / 跨團隊決策**的疑問（沒答案就無法繼續）
> - `out-of-scope-suggestions.md` —— **不在 VSFT-8368 範圍**的後續建議（給其他 team）
> - `investigation/findings.md` —— 調查結果（觀察事實）
> - **本檔** —— 已決定要做、等待實作 window 或進一步討論細節

## 紀律

- 新增項目時請寫清楚：**為什麼確定要做**（決策來源）、**範圍**、**預估影響範圍**
- 若項目過程中發現新疑問 / 需要 PM 決策 → 搬到 `open-questions.md`
- 若項目發現超出 VSFT-8368 範圍 → 搬到 `out-of-scope-suggestions.md`
- 完成後標 ✅ 並附 commit hash / 日期

---

## 1. `device type` 分類粒度重評估

**狀態**：⚠️ 待重新評估（原 Q14 撤掉後新增）

**背景**
- cs User Properties spec 在 **v91** 新增 Device Data 段並定義 `device type` enum：`ifp / desktop / laptop / tablet / phone`
- mvbf `_deviceType()` 首次 commit 是 **2026-05-28**（VSFT-8368 commit `9d3591b8b` / `4feec6820` / `06d07caff`），晚於 spec v91
- → mvbf 是**在已知 spec 的情況下**選擇粗粒度（Android / iOS 一律 `tablet`，不分 `phone`；mac / Windows 一律 `desktop`，不分 `laptop`）
- 原 Q14 假設「mvbf 是早期自擬、跟 spec 並行」是錯的，已撤

**現況實作（`amplitude_user_properties.dart:157-173`）**
```
IFP 機型(DeviceModel 非 Undefined) → 'ifp'
mac / windows                      → 'desktop'
iOS / Android                      → 'tablet'
其他                               → 'na'
```

**需要重評估**
1. 是否補上 `phone` 偵測（Android / iOS 螢幕尺寸 / SDK 判別）？
2. 是否補上 `laptop` 偵測（mac / Windows 有沒有電池 / 螢幕尺寸）？
3. 未知裝置用 `'na'` vs spec 不在 enum 內 —— 是接受 `na`、還是改成不送（對齊 cs Web / cs Android 的 `(none)` 行為）？

**為什麼確定要做（vs 留 open question）**
> 待 Jay 補充：是 PM 已說過要做？還是內部已對焦結論「應該補細分」？
> 如果還沒共識，這條應該搬回 open-questions.md（取代撤掉的 Q14）

**預估影響**
- code：`amplitude_user_properties.dart` `_deviceType()` 函式
- 測試：需要在不同實體裝置實測（Android phone / iOS iPhone / Windows laptop 等）
- spec 對齊：若決定加 `phone` / `laptop`，能成為 cs 生態第一個系統性送這欄的端

---

> 之後其他「已決定要做的後續工作」加在這裡。
