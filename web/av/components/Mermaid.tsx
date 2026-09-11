'use client'

import { useEffect, useId, useRef, useState } from 'react'

/**
 * mermaid 走 npm 套件而不是 CDN —— 離線也能看，版本也鎖得住。
 * 動態 import 避免把 mermaid 打進 server bundle。
 */
export function Mermaid({ chart, caption }: { chart: string; caption?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          darkMode: true,
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          themeVariables: {
            background: '#020617',
            primaryColor: '#0f172a',
            primaryTextColor: '#e2e8f0',
            lineColor: '#64748b',
          },
        })
        const { svg } = await mermaid.render(`m${id}`, chart)
        if (!cancelled && ref.current) ref.current.innerHTML = svg
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [chart, id])

  return (
    <figure className="my-8 max-w-4xl">
      <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/40 p-5">
        {error ? (
          <pre className="font-mono text-xs whitespace-pre-wrap text-rose-400">
            mermaid 渲染失敗：{error}
          </pre>
        ) : (
          <div ref={ref} className="[&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full" />
        )}
      </div>
      {caption && (
        <figcaption className="mt-3 text-[13px] text-slate-500">{caption}</figcaption>
      )}
    </figure>
  )
}
