import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Nav } from '@/components/Nav'
import { GlossaryAnnotator } from '@/components/GlossaryAnnotator'

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
