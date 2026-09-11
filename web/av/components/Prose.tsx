import type { ReactNode } from 'react'
import { IconInsight, IconNote, IconWarn } from './icons'

/** 散文容器。用純 TSX 寫筆記時，排版統一交給這裡與 globals.css 的 .prose-note。 */
export function Prose({ children }: { children: ReactNode }) {
  return <div className="prose-note max-w-3xl">{children}</div>
}

export function PageHeader({
  eyebrow,
  title,
  lede,
}: {
  eyebrow?: string
  title: string
  lede?: ReactNode
}) {
  return (
    <header className="mb-10 border-b border-slate-800 pb-8">
      {eyebrow && (
        <p className="mb-2 font-mono text-xs tracking-widest text-sky-500 uppercase">
          {eyebrow}
        </p>
      )}
      <h1 className="text-2xl font-bold tracking-tight text-slate-50 sm:text-3xl">{title}</h1>
      {lede && <div className="mt-4 max-w-3xl text-[15px] leading-7 text-slate-400">{lede}</div>}
    </header>
  )
}

/** 需要跳出來提醒的東西：待查證、坑、合規敏感。 */
export function Callout({
  kind = 'note',
  title,
  children,
}: {
  kind?: 'note' | 'warn' | 'insight'
  title?: string
  children: ReactNode
}) {
  const style = {
    note: 'border-slate-700 bg-slate-900/60',
    warn: 'border-amber-600/40 bg-amber-950/25',
    insight: 'border-sky-600/40 bg-sky-950/25',
  }[kind]
  const iconColor = {
    note: 'text-slate-400',
    warn: 'text-amber-400',
    insight: 'text-sky-400',
  }[kind]
  const Icon = { note: IconNote, warn: IconWarn, insight: IconInsight }[kind]

  return (
    <div className={`my-6 max-w-3xl rounded-lg border px-4 py-4 sm:px-5 ${style}`}>
      {title && (
        <p className="mb-2 flex items-start gap-2 text-sm font-semibold text-slate-100">
          <Icon className={`mt-0.5 ${iconColor}`} />
          <span>{title}</span>
        </p>
      )}
      <div className="prose-note text-[14px]">{children}</div>
    </div>
  )
}
