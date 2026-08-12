import Link from 'next/link'
import type { ReactNode } from 'react'
import { CONCEPT_IDS, PIPELINE_STAGES, type ConceptId } from '@/data/types'
import { CONCEPT_META, STAGE_META } from '@/data/taxonomy'
import { REPOS } from '@/data/repos'
import { PageHeader, Prose } from './Prose'
import { StageChips } from './PipelineBar'

/**
 * 概念頁的共用殼。內容由各頁自己以 TSX 寫在 children 裡，
 * 但頁首、對應環節、「公司哪裡用到」與頁間導覽全部由資料生成 ——
 * 所以九頁的結構一致，而且不會跟 repo 地圖脫節。
 */
export function ConceptPage({ id, children }: { id: ConceptId; children: ReactNode }) {
  const meta = CONCEPT_META[id]
  const usedBy = REPOS.filter((r) => r.concepts.includes(id))
  const relatedStages = PIPELINE_STAGES.filter((s) => STAGE_META[s].concept === id)

  return (
    <>
      <PageHeader eyebrow="concept · 通用技術" title={meta.label} lede={meta.blurb} />

      {relatedStages.length > 0 && (
        <div className="mb-8 flex flex-wrap items-center gap-2 text-[13px] text-slate-500">
          <span>對應資料路徑：</span>
          <StageChips stages={relatedStages} />
        </div>
      )}

      {children}

      <section className="mt-14 border-t border-slate-800 pt-8">
        <h2 className="text-xl font-semibold text-slate-100">
          公司哪裡用到
          <span className="ml-2 font-mono text-xs font-normal text-slate-600">
            {usedBy.length} repo
          </span>
        </h2>
        <p className="mt-1 text-[13px] text-slate-500">
          從 <code className="text-sky-400">data/repos.ts</code> 的 <code>concepts</code>{' '}
          欄位反查，不是手維護的清單。
        </p>
        <ul className="mt-4 max-w-3xl space-y-2.5">
          {usedBy.map((r) => (
            <li key={r.name} className="text-[13px] leading-6">
              <a
                href={`https://github.com/Viewsonic-EDU/${r.name}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-sky-400 hover:text-sky-300"
              >
                {r.name}
              </a>
              {r.vendored && <span className="ml-1.5 text-[11px] text-slate-600">上游</span>}
              {r.confidence === 'inferred' && (
                <span className="ml-1.5 text-[11px] text-slate-600">推論</span>
              )}
              {r.confidence === 'code' && (
                <span className="ml-1.5 text-[11px] text-emerald-500/80">已讀 code</span>
              )}
              <span className="text-slate-400"> — {r.summary}</span>
            </li>
          ))}
        </ul>
      </section>

      <nav className="mt-10 border-t border-slate-800 pt-6">
        <p className="mb-2 font-mono text-[10px] tracking-widest text-slate-600 uppercase">
          其他概念
        </p>
        <p className="flex flex-wrap gap-x-3 gap-y-1.5 text-[13px]">
          {CONCEPT_IDS.filter((c) => c !== id).map((c) => (
            <Link
              key={c}
              href={`/concepts/${c}`}
              className="text-slate-400 hover:text-sky-400"
            >
              {CONCEPT_META[c].label}
            </Link>
          ))}
        </p>
      </nav>
    </>
  )
}

/** 章節標題 + 內文，讓九頁的節奏一致。 */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  const slug = title.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()
  return (
    <section className="mt-12 first:mt-0">
      <h2 id={slug} className="scroll-mt-20 text-xl font-semibold text-slate-100">
        {title}
      </h2>
      <div className="mt-3">
        <Prose>{children}</Prose>
      </div>
    </section>
  )
}
