# mvbf — hotfix 與發版

**先讀 [`SKILL.md`](SKILL.md)**（步驟 0–2、註解標準、引號）。這裡只放「真的在做這件事時才需要」的部分，從 SKILL.md 拆出來的，內容未改。

> 什麼時候讀：squash merge 的 PR 能不能 backport／cherry-pick 的衝突該照哪邊解／`patch-id` 不同是不是掉東西了／release note 的 route A

---

## 出 hotfix / 發版：四條補在團隊 skill 之外的判準

流程本體在**專案 repo 的** `.claude/skills/mvb-hotfix-release/SKILL.md`（團隊維護，不要在這裡複製）。
以下四條是 2026-09-18 出 `3.10.207`（VSFT-10164 / backport PR #287）時，團隊 skill **沒涵蓋**、
**講得太緊**、或**已經過期**的地方。

> 📤 **這四條應該上游到該 repo（前三條進 `mvb-hotfix-release`，第 4 條進 `mvb-release-note`），
> 待與 Jay 確認。** 在那之前先放這裡，不要自己去改專案 repo。

### 1. squash merge 的 PR 可以安全 backport（§4 那條「停下來回報」要分兩層）

skill §4 說「master 上只找得到一顆涵蓋全部改動的，就是 squash —— **停下來回報，不要往下挑**」。

那條的**本意**是「不要拿 PR 頁面上的 SHA 去挑」（那些 SHA 不在 master 歷史上）。
但 squash 之後，**master 上那一顆就是該 PR 的完整淨改動**，挑它不會漏、也不會多帶。

所以判準是：**停下來回報是對的（讓人確認範圍），但「不能挑」不成立。**
回報時要講清楚「PR 有 N 顆、master 上只有 1 顆、那 1 顆等於全部」，由人拍板。

**證據等級：實測。** PR #275 `gh api .../pulls/275` 回 `commits=3`、
`merge_commit_sha=68d68db40`（1 個 parent），master 上只有那一顆；cherry-pick 後
增刪行與來源逐行相同（比對法見第 3 條）。

### 2. 衝突可能來自「不在範圍內的 commit 的 context」——解法要看 hotfix 線自己的前提

skill §5 只說「用**上界**那一刻的檔案狀態當基準，不要用 master 最新狀態」。
但它沒說：**上界的那個狀態，本身可能依賴一顆你並沒有要 backport 的 commit。**

實例：`android/app/src/store/AndroidManifest.xml` 的衝突，來源 commit 的 context 含
`7c4da965f`（移除 `SetLanguageActivity` 的 exported 覆寫）之後的狀態。照那邊解會把覆寫
一併拿掉 —— 但 `7c4da965f` 的**前提**是 ClassSwift v1.9.2 的 drop-standalone 刪掉了該 Activity，
而 hotfix 線釘的是 **CS v1.8.2**（`46eb2aa94`），Activity 還在，覆寫拿掉會讓 store APK
把 CS 的 `exported` 宣告原樣併進最終 manifest。

**判準**：解衝突前先問兩個問題 ——

1. 這段 context 是**哪顆 commit** 造成的？（`git log -S'<那段文字>' <起點>..origin/master`）
2. 那顆的**前提**在 hotfix 線成立嗎？

**版本釘選是最常見的「前提不成立」來源**：CS 版本、Flutter SDK 版本、plugin 版本 ——
hotfix 線釘的通常比 master 舊，master 上「因為升級了所以可以刪」的東西，在 hotfix 線不能刪。

### 3. patch-id 不同時，用「只比增刪行」區分「掉東西」與「只是 context 不同」

skill 講了 patch-id **不是**「必須相同」而是「不同時你要說得出原因」，但沒給怎麼說。

`git patch-id` 會把 **context 行**也算進指紋，所以**純粹因為周圍文字不同**就會變號 ——
這跟「cherry-pick 掉了東西」在輸出上長得一模一樣（都只是兩個不同的雜湊）。可分辨的探針：

```bash
diff <(git show <來源 SHA>   --format= | grep -E '^[+-]' | grep -v '^[+-][+-][+-]') \
     <(git show <分支上那顆> --format= | grep -E '^[+-]' | grep -v '^[+-][+-][+-]')
```

無輸出 ＝ **增刪行逐行相同**，差異只在 context → 正常，可以寫進 PR 描述當證據。
有輸出 ＝ 真的不一樣，逐行看是不是掉了東西。

⚠️ **對照組**：這條探針要在一個**已知有實質差異**的 commit 上跑出非空輸出，
才證明它有鑑別力（見 `cross-system-claims.md` §5）。

### 4. release note 的 route A 已經寫過線上頁面了（`mvb-release-note` 那句已過期）

那份 skill 寫著「Every publish so far has gone through route B, so route A has not yet
written to the live page. Treat its first real use as a shakedown.」——
**2026-09-18 已經不成立**：`scripts/mvb_release_note_publish.py --publish` 真的寫了，
page version 98 → 99，三道 post-write guard 全綠
（`node count 506 (expected 506)` / `old content byte-identical` / `new sections byte-identical`）。

所以 route A 現在是**預設路徑**，不必再當 shakedown 對待。但那次的作法仍值得照做，
因為它便宜：`--self-test`（21 checks）→ dry run 讀節點數與 APK URL → 才 `--publish`，
而且**三個 guard 要逐項讀**，不要只看 exit code。

⚠️ 那份 skill 的其他內容（route B 的取 body、slicing、`PYTHONIOENCODING=utf-8`）沒有過期，
只有「route A 還沒上線過」這一句要改。

---
