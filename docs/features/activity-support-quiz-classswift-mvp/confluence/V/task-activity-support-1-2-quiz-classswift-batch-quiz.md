<!--
==============================================================
SOURCE TRACKING — 更新 Confluence 後請同步更新此區塊與內文
==============================================================

page_id:        568492207
url:            https://viewsonic-vsi.atlassian.net/wiki/spaces/clsft/pages/568492207/Task+Activity+Support+1-2+Quiz+ClassSwift+batch+quiz
space:          V
cloned_version: 2
cloned_at:      2026-07-02

Note: 使用者提供的 URL 中 space segment 為 `clsft`，但 Confluence API metadata 回報的
      space key 為 `V`（display name = ClassSwift）。依 docs-feature-spec.md 規則，
      資料夾以 API 回報的正式 space key `V` 為準。

Maintenance rule: 每次重新 clone 時，先 commit「同步前差異」說明，再覆寫此檔；
                  版號跟 cloned_at 要同步更新，commit 訊息附 Confluence URL。
==============================================================
-->

> | 來源頁面 | page_id | clone 版本 | clone 日期 |
> |---|---|---|---|
> | [[Task][Activity Support] 1-2 切到 Quiz 喚起 ClassSwift 並進行一鍵派題 (等支援 batch quiz)](https://viewsonic-vsi.atlassian.net/wiki/spaces/clsft/pages/568492207/Task+Activity+Support+1-2+Quiz+ClassSwift+batch+quiz) | 568492207 | v2 | 2026-07-02 |

# [Task][Activity Support] 1-2 切到 Quiz 喚起 ClassSwift 並進行一鍵派題 (等支援 batch quiz)

VSFT-9338 dcbcc80e-91e1-36a8-b77b-74919585b732 System Jira

## 2026/06/30 會議記錄

注意事項

1. 是否要跳起 Join Class 視窗可以參考 Spainner 的邏輯，如果有學生就不會顯示，反之亦然。
2. 只要有派題，派題按鈕就會 disable。無論是否有更換至下一頁。
3. 題目判斷數量是由 ClassSwift 去實作，並且送派題 API 無論是多題或者單題都是使用過去相同的 API

待討論格式與傳送。

1. 單題派題與多題派題 的 data 串接，是由 MyViewboard team 解析 原檔格式，然後丟 HTML 中的 JSON 至 ClassSwift 解析
2. 派題結束後要送事件給 MyViewboard
3. 中間有失敗要傳送事件給 MyViewboard 用於顯示 error

## 2026/07/01 會議記錄

事前準備

1. OLF 檔案
2. ClassSwoft 的單題與多題流程結果

   1. 題目種類：圖片題、是非題 (True or False)、多選 (Multi-Select)、單選 (Single-Select)、投票題（Poll）、聲音題 (Audio)、簡答題（Sort Answer）

討論結果

拆解 Task

### Jay 執行

1. 單題派題與多題派題 的 data 串接，是由 MyViewboard team 解析 原檔格式，然後丟 HTML 中的 JSON 至 ClassSwift 解析

   1. 使用過去的 Message 的傳遞方式：AIDL 傳遞資訊

      1. JSON 往 ClassSwift 傳送
2. 派題結束後要送事件給 MyViewboard

   1. myViewBoard 與 ClassSwift 之間 Event 如何傳遞
3. 中間有失敗要傳送事件給 MyViewboard 用於顯示 error

   1. myViewBoard 與 ClassSwift 之間 Event 如何傳遞
4. 圖片題要確認圖片的格式目前是 URL 檔案是放在在哪裡

   1. Image url 或是 Path
5. Audio 題要確認 Audio 的格式目前是 URL 檔案是放在在哪裡

### Ingrid 執行

1. 單題派題與多題派題 的 data 串接，是由 MyViewboard team 解析 原檔格式，然後丟 HTML 中的 JSON 至 ClassSwift 解析

   1. 收到 JSON 判斷流程進入登入/非登入流程再單選/多選派題
2. 派題結束後要送事件給 MyViewboard

   1. 傳送資訊給 MyViewboard
3. 中間有失敗要傳送事件給 MyViewboard 用於顯示 error

   1. 傳送資訊給 MyViewboard
4. 圖片題要確認圖片的格式目前是 URL 檔案是放在在哪裡

   1. 確認圖片題能夠顯示圖片
5. Audio 題要確認 Audio 的格式目前是 URL 檔案是放在在哪裡
