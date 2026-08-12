# av-streaming domain

ViewSonic 影音技術（AirSync / MVB Cast in-out / Recorder）的學習筆記。

這個 domain 與 `docs/` 底下其他文件不同 —— 它是一個**獨立的 Next.js + TypeScript 站**，
不是 markdown 或靜態 HTML。

## 為什麼是 Next app 而不是 md

1. **知識存成 typed data。** repo 地圖、pipeline 環節、概念連結全部在 `src/data/` 裡是有型別的資料，
   分群表、資料路徑圖、概念頁的「哪些 repo 用到」都由同一份資料生成。改一次就同步，
   壞連結是 TS 編譯錯誤而不是點下去 404。
2. **local / offloaded 狀態是動態查的。** `src/lib/workspace.ts` 在 render 時讀 repo 根的
   `local.workspace.json` 與檔案系統，所以 badge 永遠是當下的真相 —— 這個狀態刻意不寫進內容。
3. **影音領域吃互動圖。** mermaid 走 npm 套件（不是 CDN，離線可用），特殊圖表手寫 component。

## 跑起來

```
npm install
npm run dev      # http://localhost:3100
```

`npm run build` 可驗證整站與型別。`npm run typecheck` 只跑型別。

> **不要在 dev server 還跑著的時候執行 `npm run build`。**
> 兩者共用 `.next/`，會讓 dev 端的 client bundle 壞掉 —— 症狀是頁面看起來正常但
> **完全沒有互動性**（元件沒 hydrate，例如 glossary 的搜尋框打字沒反應），
> 而且 console 不會報錯，很難察覺。
> 修法：`pkill -f "next dev"`、`rm -rf .next`、重新 `npm run dev`。

## 結構

```
src/
├── data/                  ← 知識本體（typed）
│   ├── types.ts           ← PipelineStage / RepoGroup / ConceptId / Repo
│   ├── taxonomy.ts        ← 各分類的顯示文字與說明
│   ├── repos.ts           ← repo 地圖（唯一的事實來源）
│   └── glossary.ts        ← 縮寫對照，含撞名警告
├── lib/workspace.ts       ← 讀 local.workspace.json 判定 local/offloaded
├── components/
│   ├── Nav.tsx            ← 側欄 / 行動版抽屜，含 active 狀態
│   ├── Prose.tsx          ← Prose / PageHeader / Callout
│   ├── ConceptPage.tsx    ← 概念頁共用殼 + Section
│   ├── Mermaid.tsx        ← mermaid（npm 套件，非 CDN）
│   ├── diagrams.tsx       ← GopDiagram / BoxDiagram / CompareGrid / Steps
│   ├── PipelineBar.tsx    ← 由 repos.ts 生成的資料路徑圖
│   └── RepoTable.tsx      ← 由 repos.ts 生成的分群表
└── app/
    ├── page.tsx           ← domain 首頁：資料路徑 + 三條 pipeline
    ├── systems/
    │   ├── airsync/
    │   │   └── webrtc-fork/        ← 深入頁：58 個自家 commit 實際改了什麼
    │   ├── mvb-cast/
    │   └── recorder/
    ├── concepts/<id>/
    │   └── capture/virtual-devices/ ← 深入頁：虛擬裝置的跨平台現實
    ├── glossary/          ← 縮寫對照（唯一的 client component，有即時搜尋）
    └── open-questions/
```

**深入頁**：主題展開會壓垮母頁高度時就開子路由，母頁留 blockquote 指路。
Nav 的 `DEEP_DIVES` 對應表決定縮排層級 —— 加新深入頁時要同時加進去。

**排版慣例**：`.prose-note` 的樣式只套用在**直接子元素**（`> p`、`> ul`…），
這樣圖表元件內部的 `ul` / `table` 不會被 prose 樣式汙染。加新圖表元件時
若它的根就是 `ol`/`table`，記得包一層 `div`。

**不用 emoji**：圖示走 `components/icons.tsx` 的 inline SVG（`currentColor`，
顏色跟著文字走）。`repos.ts` 的 `notes` 用純文字前綴 `! `（警告）與 `* `（重點），
由 `RepoTable` 在渲染時換成 SVG —— 資料層保持乾淨可搜尋。

**縮寫自動標註**：`GlossaryAnnotator`（掛在 layout 的 `<main>` 尾端）在 hydrate 後掃過
內文文字節點，把 `glossary.ts` 裡的縮寫加上虛線底線與 hover/focus/tap 提示，
並生成頁尾的「本頁出現的縮寫」。

- **不需要手動包 `<Abbr>`** —— 新頁面、新縮寫都自動吃到。想讓某段不被標註，
  在容器上加 `data-no-gloss`。
- 跳過 `code` / `pre` / `a` / `h1`–`h3` / `svg` 等（見 `SKIP_TAGS`）。
- **標註區分大小寫** —— TURN、FIR、ICE、DASH 都是英文單字，只認全大寫形式。
- 內文出現太頻繁而顯吵的縮寫，在 `glossary.ts` 那筆設 `noAnnotate: true`
  （仍會列在 glossary 頁）。多種寫法用 `abbr` 的 `" / "` 分隔或 `aliases`。

## 現況

- **repo 地圖完成** —— 建立於 2026-08-07，48 筆：47 個 `edu-as-*` 加上 MVB 側相關 repo。
- **通用概念九頁內容完成** —— capture / codecs / containers / webrtc / transport /
  discovery / vendor-protocols / drm-auth / storage。每頁都拉回對應的 repo 講，
  不是通用教科書內容。
- **子系統三頁** —— AirSync 最完整；MVB Cast 的信令與一對多架構已查證；
  Recorder / Live 已完整讀過原始碼（含「live 就是 RTMP 推流到 YouTube/Facebook/Twitch」）。
### 可信度標記

`repos.ts` 每筆有 `confidence`，頁面上會顯示：

- `code` → 標「已讀 code」，可以當事實用
- `readme` → 不標記，來自遠端 README 與頂層目錄
- `inferred` → 標「推論」，從名稱／語言猜的，**不要當結論**

這個區分不是形式。`/open-questions` 裡已結案的 5 題中有 **2 題推翻了原本只看 README 的判斷**：

- **`edu-as-webrtc` 才是實際在開發的 libwebrtc fork**（default branch `v0.9.36-windows`，
  改動集中在 Windows Media Foundation 的速率控制）。它的 README 還是 LiveKit 的原文，
  所以我一開始誤判成純 vendored；而我以為最重要的 `edu-as-webrtc-airsync`
  其實是停在 2021 年的上游鏡像。
- **MVB Cast 的一對多是 peer 中繼樹不是 mesh**（`Scalable-Broadcast.js`，
  `maxRelayLimitPerUser` 預設 2）。

### 懸著的問題

`/open-questions`（10 條），每條附「為什麼值得查」與「怎麼查」。最擋路的兩條：
`edu-as-webrtc` 的自家 diff 具體怎麼改、`edu-as-display-channel` 的 direct/tunnel 差異。

## 合規注意

`edu-as-castauthtool` 涉及從第三方商業軟體逆向提取 Google Cast 認證憑證，
其 README 內含第三方授權碼明文。這份筆記**刻意不複製任何憑證／授權內容**，
只描述架構角色。對外（包含公司內其他團隊）討論前先確認。
