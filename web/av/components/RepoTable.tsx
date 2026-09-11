import Link from 'next/link'
import { REPO_GROUPS, type Repo, type RepoGroup } from '@/data/types'
import { GROUP_META, CONCEPT_META } from '@/data/taxonomy'
import { loadWorkspaceIndex, LOCATION_META } from '@/lib/workspace'
import { StageChips } from './PipelineBar'
import { IconStar, IconWarn } from './icons'

function LocationBadge({ repo }: { repo: string }) {
  const index = loadWorkspaceIndex()
  const meta = LOCATION_META[index.locate(repo)]
  return (
    <span
      title={meta.hint}
      className={`inline-block rounded px-1.5 py-0.5 font-mono text-[10px] ring-1 ring-inset ${meta.className}`}
    >
      {meta.label}
    </span>
  )
}

function ConfidenceMark({ repo }: { repo: Repo }) {
  if (repo.confidence === 'readme') return null
  if (repo.confidence === 'code') {
    return (
      <span
        title="讀過原始碼，可以當事實用"
        className="ml-1.5 font-mono text-[10px] text-emerald-500/80"
      >
        已讀 code
      </span>
    )
  }
  return (
    <span
      title="從名稱／語言推論，尚未查證"
      className="ml-1.5 font-mono text-[10px] text-slate-600"
    >
      推論
    </span>
  )
}

/**
 * notes 的前綴約定：`! ` = 警告／坑，`* ` = 重點。
 * 存成純文字前綴而不是 emoji，渲染時才換成 SVG —— 資料層保持乾淨可搜尋。
 */
function NoteItem({ note }: { note: string }) {
  const kind = note.startsWith('! ') ? 'warn' : note.startsWith('* ') ? 'star' : 'plain'
  const text = kind === 'plain' ? note : note.slice(2)

  return (
    <li className="flex gap-1.5">
      {kind === 'warn' && <IconWarn className="mt-[3px] text-amber-500/80" />}
      {kind === 'star' && <IconStar className="mt-[3px] text-sky-400/80" />}
      {kind === 'plain' && (
        <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-slate-600" />
      )}
      <span className={kind === 'plain' ? '' : 'text-slate-400'}>{text}</span>
    </li>
  )
}

function RepoRow({ repo }: { repo: Repo }) {
  return (
    <tr className="border-b border-slate-800/70 align-top">
      <td className="py-3 pr-4">
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`https://github.com/Viewsonic-EDU/${repo.name}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[13px] text-sky-400 hover:text-sky-300"
          >
            {repo.name}
          </a>
          <LocationBadge repo={repo.name} />
          {repo.priority === 1 && (
            <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-300 ring-1 ring-inset ring-sky-500/30">
              先讀
            </span>
          )}
          {repo.deprecated && (
            <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-300 ring-1 ring-inset ring-rose-500/30">
              已停用
            </span>
          )}
          {repo.vendored && (
            <span className="rounded bg-slate-700/40 px-1.5 py-0.5 text-[10px] text-slate-400">
              上游
            </span>
          )}
        </div>
        {repo.realName && (
          <p className="mt-1 font-mono text-[11px] text-slate-500">內部名：{repo.realName}</p>
        )}
        <p className="mt-1.5 text-[13px] leading-6 text-slate-300">
          {repo.summary}
          <ConfidenceMark repo={repo} />
        </p>
        {repo.notes && repo.notes.length > 0 && (
          <ul className="mt-2 space-y-1 text-[12px] leading-5 text-slate-500">
            {repo.notes.map((n) => (
              <NoteItem key={n} note={n} />
            ))}
          </ul>
        )}
        {repo.concepts.length > 0 && (
          <p className="mt-2 flex flex-wrap gap-2 text-[11px]">
            {repo.concepts.map((c) => (
              <Link
                key={c}
                href={`/concepts/${c}`}
                className="text-slate-500 underline decoration-slate-700 underline-offset-2 hover:text-sky-400"
              >
                {CONCEPT_META[c].label}
              </Link>
            ))}
          </p>
        )}
      </td>
      <td className="py-3 pr-4 font-mono text-[11px] whitespace-nowrap text-slate-500">
        {repo.lang}
      </td>
      <td className="w-[190px] py-3">
        <StageChips stages={repo.stages} />
      </td>
    </tr>
  )
}

/** 依 group 分段列出 repo。表格內容全部由 repos.ts 生成。 */
export function RepoTable({ repos }: { repos: Repo[] }) {
  const groups = REPO_GROUPS.filter((g) => repos.some((r) => r.group === g))

  return (
    <div className="my-8">
      {groups.map((group: RepoGroup) => {
        const rows = repos.filter((r) => r.group === group)
        const meta = GROUP_META[group]
        return (
          <section key={group} className="mb-12">
            <h3 className="text-base font-semibold text-slate-100">
              {meta.label}
              <span className="ml-2 font-mono text-xs font-normal text-slate-600">
                {rows.length}
              </span>
            </h3>
            <p className="mt-1 max-w-2xl text-[13px] text-slate-500">{meta.blurb}</p>
            <div className="mt-4 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <table className="w-full min-w-[600px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-700 text-left">
                    <th className="pb-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                      Repo
                    </th>
                    <th className="pb-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                      語言
                    </th>
                    <th className="pb-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                      Pipeline 環節
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <RepoRow key={r.name} repo={r} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}
    </div>
  )
}
