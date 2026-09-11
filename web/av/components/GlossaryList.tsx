'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  GLOSSARY_GROUPS,
  GLOSSARY_GROUP_LABEL,
  TERMS,
  type GlossaryGroup,
} from '@/data/glossary'
import { CONCEPT_META } from '@/data/taxonomy'
import { IconWarn } from './icons'

export function GlossaryList() {
  const [q, setQ] = useState('')

  const needle = q.trim().toLowerCase()
  const matched = useMemo(() => {
    if (!needle) return TERMS
    return TERMS.filter((t) =>
      [t.abbr, t.full ?? '', t.gloss, t.clash ?? ''].some((s) =>
        s.toLowerCase().includes(needle),
      ),
    )
  }, [needle])

  const groups = GLOSSARY_GROUPS.filter((g) => matched.some((t) => t.group === g))

  return (
    <div>
      <div className="sticky top-0 z-10 -mx-4 mb-8 bg-slate-950/95 px-4 py-3 backdrop-blur sm:mx-0 sm:px-0 lg:top-0">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜尋縮寫、全稱或說明…"
          aria-label="搜尋縮寫"
          className="w-full max-w-md rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-[14px] text-slate-100 placeholder:text-slate-600 focus:border-sky-600 focus:outline-none"
        />
        <p className="mt-2 font-mono text-[11px] text-slate-600">
          {matched.length} / {TERMS.length} 條
        </p>
      </div>

      {matched.length === 0 && (
        <p className="text-[14px] text-slate-500">
          找不到「{q}」。這個 domain 的縮寫多到我一定有漏 —— 跟我說一聲就補上。
        </p>
      )}

      {groups.map((group: GlossaryGroup) => {
        const rows = matched.filter((t) => t.group === group)
        return (
          <section key={group} className="mb-11">
            <h2 className="mb-4 border-b border-slate-800 pb-2 text-base font-semibold text-slate-100">
              {GLOSSARY_GROUP_LABEL[group]}
              <span className="ml-2 font-mono text-xs font-normal text-slate-600">
                {rows.length}
              </span>
            </h2>
            <dl className="space-y-5">
              {rows.map((t) => (
                <div key={t.abbr} className="max-w-3xl">
                  <dt className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <span className="font-mono text-[15px] font-semibold text-sky-300">
                      {t.abbr}
                    </span>
                    {t.full && <span className="text-[13px] text-slate-400">{t.full}</span>}
                    {t.concept && (
                      <Link
                        href={`/concepts/${t.concept}`}
                        className="font-mono text-[10px] text-slate-600 hover:text-sky-400"
                      >
                        {CONCEPT_META[t.concept].label} ↗
                      </Link>
                    )}
                  </dt>
                  <dd className="mt-1 text-[13px] leading-6 text-slate-300">{t.gloss}</dd>
                  {t.clash && (
                    <dd className="mt-1.5 flex items-start gap-1.5 text-[12px] leading-5 text-amber-500/85">
                      <IconWarn className="mt-[3px]" />
                      <span>撞名：{t.clash}</span>
                    </dd>
                  )}
                </div>
              ))}
            </dl>
          </section>
        )
      })}
    </div>
  )
}
