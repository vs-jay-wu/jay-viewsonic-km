import type { ReactNode } from 'react'

function Figure({ children, caption }: { children: ReactNode; caption?: string }) {
  return (
    <figure className="my-8 max-w-3xl">
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="min-w-max rounded-lg border border-slate-800 bg-slate-900/40 p-5">
          {children}
        </div>
      </div>
      {caption && (
        <figcaption className="mt-3 text-[13px] leading-6 text-slate-500">{caption}</figcaption>
      )}
    </figure>
  )
}

const FRAME_STYLE = {
  I: 'bg-sky-500/20 text-sky-200 ring-sky-500/40',
  P: 'bg-slate-700/50 text-slate-200 ring-slate-600',
  B: 'bg-amber-500/15 text-amber-200 ring-amber-500/40',
} as const

type FrameKind = keyof typeof FRAME_STYLE

/**
 * GOP 結構圖。這是 mermaid 畫不出來的東西 —— 需要表達「哪一幀參考哪一幀」，
 * 而且參考關係有前向與雙向兩種。用手寫 SVG 疊在幀序列上。
 */
export function GopDiagram({
  pattern,
  refs = [],
  caption,
}: {
  /** 例如 "IPPPPPPP" 或 "IBBPBBP" */
  pattern: string
  /** [from, to] 索引配對，畫出參考箭頭 */
  refs?: [number, number][]
  caption?: string
}) {
  const frames = pattern.toUpperCase().split('') as FrameKind[]
  const W = 46
  const GAP = 12
  const step = W + GAP
  const totalW = frames.length * step - GAP
  const archH = 34

  return (
    <Figure caption={caption}>
      <div style={{ width: totalW }}>
        <svg width={totalW} height={archH} className="block" aria-hidden>
          {refs.map(([from, to], i) => {
            const x1 = from * step + W / 2
            const x2 = to * step + W / 2
            const mid = (x1 + x2) / 2
            const backwards = x2 < x1
            return (
              <g key={i} stroke={backwards ? '#f59e0b' : '#64748b'} fill="none">
                <path
                  d={`M ${x1} ${archH - 2} Q ${mid} 2 ${x2} ${archH - 2}`}
                  strokeWidth="1"
                  opacity="0.75"
                />
                <circle cx={x2} cy={archH - 2} r="2" fill={backwards ? '#f59e0b' : '#64748b'} />
              </g>
            )
          })}
        </svg>
        <ol className="flex" style={{ gap: GAP }}>
          {frames.map((f, i) => (
            <li key={i} className="text-center" style={{ width: W }}>
              <div
                className={`flex h-11 items-center justify-center rounded font-mono text-sm font-semibold ring-1 ring-inset ${FRAME_STYLE[f]}`}
              >
                {f}
              </div>
              <span className="mt-1 block font-mono text-[10px] text-slate-600">{i}</span>
            </li>
          ))}
        </ol>
      </div>
      <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-500">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-sky-500/40" />
          <dt>I</dt>
          <dd>完整畫面，可獨立解出</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-slate-600" />
          <dt>P</dt>
          <dd>只存與前一幀的差異</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-amber-500/40" />
          <dt>B</dt>
          <dd>同時參考前後，需要等未來的幀</dd>
        </div>
      </dl>
    </Figure>
  )
}

type Box = { label: string; note?: string; span?: number; tone?: 'meta' | 'data' | 'frag' }

const BOX_TONE = {
  meta: 'bg-sky-500/15 text-sky-200 ring-sky-500/30',
  data: 'bg-slate-700/40 text-slate-200 ring-slate-600',
  frag: 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/30',
} as const

/** 容器結構圖：把 MP4／fMP4 的 box 佈局畫成按比例的長條。 */
export function BoxDiagram({
  rows,
  caption,
}: {
  rows: { title: string; boxes: Box[]; hint?: string }[]
  caption?: string
}) {
  return (
    <Figure caption={caption}>
      <div className="space-y-5" style={{ minWidth: 420 }}>
        {rows.map((row) => {
          const total = row.boxes.reduce((s, b) => s + (b.span ?? 1), 0)
          return (
            <div key={row.title}>
              <p className="mb-1.5 font-mono text-[11px] text-slate-400">{row.title}</p>
              <div className="flex gap-1">
                {row.boxes.map((b, i) => (
                  <div
                    key={i}
                    style={{ flex: `${b.span ?? 1} 1 0` }}
                    className={`rounded px-2 py-2 text-center ring-1 ring-inset ${
                      BOX_TONE[b.tone ?? 'data']
                    }`}
                  >
                    <span className="block font-mono text-[11px] font-semibold">{b.label}</span>
                    {b.note && (
                      <span className="mt-0.5 block text-[10px] leading-3 opacity-70">
                        {b.note}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {row.hint && <p className="mt-1.5 text-[11px] text-slate-500">{row.hint}</p>}
            </div>
          )
        })}
      </div>
    </Figure>
  )
}

/** 並列比較。比 markdown 表格好的地方是每欄可以有結論列。 */
export function CompareGrid({
  columns,
  rows,
  verdict,
}: {
  columns: string[]
  rows: { label: string; cells: ReactNode[] }[]
  verdict?: ReactNode
}) {
  return (
    <div className="my-8 max-w-3xl">
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[520px] border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="border-b border-slate-700 pb-2 text-left" />
              {columns.map((c) => (
                <th
                  key={c}
                  className="border-b border-slate-700 px-3 pb-2 text-left font-semibold text-slate-100"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="align-top">
                <th className="border-b border-slate-800 py-2.5 pr-3 text-left font-medium text-slate-400">
                  {r.label}
                </th>
                {r.cells.map((cell, i) => (
                  <td key={i} className="border-b border-slate-800 px-3 py-2.5 text-slate-300">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {verdict && (
        <p className="mt-3 text-[13px] leading-6 text-slate-400">
          <span className="mr-1.5 font-semibold text-slate-200">結論</span>
          {verdict}
        </p>
      )}
    </div>
  )
}

/** 一串有順序的步驟，用在「封包怎麼被切」這類線性流程。 */
export function Steps({ items }: { items: { label: string; detail: ReactNode }[] }) {
  // 外層 div 是必要的：Steps 常放在 .prose-note 裡，
  // 少了它這個 ol 會變成 prose 的直接子元素而吃到清單樣式。
  return (
    <div>
    <ol className="my-8 max-w-3xl list-none space-y-3 pl-0">
      {items.map((s, i) => (
        <li key={s.label} className="flex gap-4">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 font-mono text-[11px] text-slate-400">
            {i + 1}
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-slate-100">{s.label}</p>
            <p className="mt-0.5 text-[13px] leading-6 text-slate-400">{s.detail}</p>
          </div>
        </li>
      ))}
    </ol>
    </div>
  )
}
