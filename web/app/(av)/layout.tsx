/**
 * av-streaming 的 **root layout**（不是 km 的子頁）。
 *
 * `app/` 底下沒有共用的 `layout.tsx`，`(km)` 與 `(av)` 各自是一個 root layout，
 * 各自宣告 `<html>`／`<body>`、各自 import 自己的 globals.css。
 * 這正是「同一個 domain、兩套系統」要的：
 *
 * - **樣式互不干擾**：km 是淺色、av 是深色（`color-scheme: dark`），
 *   兩份 CSS 只會各自載入自己那邊的路由，不會互相蓋。
 * - **跨界一定整頁重載**（Next 對多 root layout 的行為），所以不會出現
 *   「km 的 Sidebar 還在、內容卻是 av」這種半套畫面。
 *
 * 刻意**不放任何回 km 的連結**（Jay 2026-09-11 指定）——
 * 這邊是獨立的閱讀站，從 km 過來是開新分頁，回去就用瀏覽器的分頁。
 */
import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Nav } from '@av/components/Nav'
import { GlossaryAnnotator } from '@av/components/GlossaryAnnotator'

export const metadata: Metadata = {
  title: 'AV Streaming — ViewSonic 影音技術學習筆記',
  description: 'AirSync / Cast in-out / Recorder 的影音格式、串流與儲存筆記',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>
        <div className="lg:flex">
          <Nav />
          <main className="min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-14 lg:py-10">
            {children}
            <GlossaryAnnotator />
          </main>
        </div>
      </body>
    </html>
  )
}
