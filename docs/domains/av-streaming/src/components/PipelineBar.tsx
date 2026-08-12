import Link from 'next/link'
import { PIPELINE_STAGES, type PipelineStage } from '@/data/types'
import { STAGE_META } from '@/data/taxonomy'

/**
 * 資料路徑總圖。環節與說明都來自 taxonomy.ts 的 STAGE_META，
 * 所以改一次就同步；highlight 用來讓子系統頁只亮它涉及的那幾格。
 */
export function PipelineBar({ highlight }: { highlight?: PipelineStage[] }) {
  return (
    <div className="my-8 overflow-x-auto">
      <ol className="flex min-w-max items-stretch gap-2">
        {PIPELINE_STAGES.map((stage, i) => {
          const meta = STAGE_META[stage]
          const on = !highlight || highlight.includes(stage)
          return (
            <li key={stage} className="flex items-stretch gap-2">
              <div
                className={`flex w-[132px] flex-col rounded-lg border px-3 py-3 transition ${
                  on
                    ? 'border-slate-700 bg-slate-900/70'
                    : 'border-slate-800/60 bg-slate-950 opacity-35'
                }`}
              >
                <span className="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
                  {stage}
                </span>
                <span className="mt-1 text-sm font-semibold text-slate-100">{meta.label}</span>
                <p className="mt-1.5 text-[11px] leading-4 text-slate-500">{meta.blurb}</p>
                {meta.concept && (
                  <div className="mt-auto pt-2.5">
                    <Link
                      href={`/concepts/${meta.concept}`}
                      className="font-mono text-[10px] text-sky-500 hover:text-sky-400"
                    >
                      概念 ↗
                    </Link>
                  </div>
                )}
              </div>
              {i < PIPELINE_STAGES.length - 1 && (
                <span className="self-center text-slate-700 select-none">→</span>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** 單一 repo 用的迷你 stage 標記。 */
export function StageChips({ stages }: { stages: PipelineStage[] }) {
  if (stages.length === 0) {
    return <span className="text-[11px] text-slate-600">不在資料路徑上</span>
  }
  return (
    <span className="flex flex-wrap gap-1">
      {stages.map((s) => (
        <span
          key={s}
          title={STAGE_META[s].label}
          className="rounded bg-slate-800/70 px-1.5 py-0.5 font-mono text-[10px] text-slate-400"
        >
          {s}
        </span>
      ))}
    </span>
  )
}
