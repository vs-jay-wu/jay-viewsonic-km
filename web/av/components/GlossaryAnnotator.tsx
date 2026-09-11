'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { buildAliasIndex, type Term } from '@/data/glossary'
import { CONCEPT_META } from '@/data/taxonomy'

/**
 * 讀到縮寫不用離開頁面。
 *
 * 做法：hydrate 之後掃過 <main> 的文字節點，把已知縮寫包成可 hover / focus / tap 的
 * <span>，滑過就出現全稱與一句話解釋；同時收集這一頁出現過哪些縮寫，生成頁尾清單。
 *
 * 為什麼用 DOM 掃描而不是逐處手動包 <Abbr>：內容是我維護的，任何需要「每次寫到縮寫
 * 都要記得包起來」的方案都會腐化。這樣新頁面與新縮寫都自動吃到。
 *
 * 安全性：只在 useEffect 裡動 DOM（hydrate 之後），而且這些頁面都是靜態 server
 * component、掛載後不會再 re-render，所以不會跟 React 的 reconciliation 打架。
 * 換頁時 pathname 變化會重跑一次。
 */

const SKIP_TAGS = new Set(['PRE', 'A', 'SVG', 'BUTTON', 'INPUT', 'H1', 'H2', 'H3', 'SCRIPT', 'STYLE'])

/**
 * inline <code> 不整個跳過 —— 站上大量用 <code> 包協議訊息與 API 名稱，
 * 那些正好就是要解釋的縮寫（<code>FIR</code>、<code>PLI</code>）。
 *
 * 規則：只有「整個 code 元素的文字剛好就是一個已知縮寫」才標註。
 * 這樣 <code>PLI</code> 會標，<code>flvMuxer.sendVideo(...)</code> 不會。
 * <pre> 底下的 code 由 SKIP_TAGS 的 PRE 擋掉。
 */
function codeBlocksAnnotation(codeEl: HTMLElement, byAlias: Map<string, unknown>) {
  return !byAlias.has((codeEl.textContent ?? '').trim())
}

const MARK_CLASS = 'gloss-mark'

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

type Hover = { term: Term; x: number; y: number } | null

export function GlossaryAnnotator() {
  const pathname = usePathname()
  const [found, setFound] = useState<Term[]>([])
  const [hover, setHover] = useState<Hover>(null)

  const show = useCallback((el: HTMLElement, term: Term) => {
    const r = el.getBoundingClientRect()
    setHover({ term, x: r.left + r.width / 2, y: r.top })
  }, [])

  useEffect(() => {
    // glossary 自己那頁不用標註 —— 整頁都是定義。
    if (pathname === '/glossary') {
      setFound([])
      return
    }

    const main = document.querySelector('main')
    if (!main) return

    const { aliases, byAlias } = buildAliasIndex()
    if (aliases.length === 0) return
    const re = new RegExp(`\\b(${aliases.map(escapeRe).join('|')})\\b`, 'g')

    // 先收集候選文字節點，再一次改 DOM（邊走邊改 TreeWalker 會出事）
    const targets: Text[] = []
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || node.nodeValue.length < 2) return NodeFilter.FILTER_REJECT
        for (let p = node.parentElement; p && p !== main; p = p.parentElement) {
          if (SKIP_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT
          if (p.classList.contains(MARK_CLASS)) return NodeFilter.FILTER_REJECT
          if (p.dataset.noGloss !== undefined) return NodeFilter.FILTER_REJECT
          if (p.tagName === 'CODE' && codeBlocksAnnotation(p, byAlias)) {
            return NodeFilter.FILTER_REJECT
          }
        }
        re.lastIndex = 0
        return re.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
      },
    })
    for (let n = walker.nextNode(); n; n = walker.nextNode()) targets.push(n as Text)

    const seen = new Map<string, Term>()

    for (const node of targets) {
      const text = node.nodeValue ?? ''
      const frag = document.createDocumentFragment()
      let last = 0
      re.lastIndex = 0

      for (let m = re.exec(text); m; m = re.exec(text)) {
        const term = byAlias.get(m[1])
        if (!term) continue
        seen.set(term.abbr, term)

        if (m.index > last) frag.append(text.slice(last, m.index))

        const span = document.createElement('span')
        span.className = MARK_CLASS
        span.tabIndex = 0
        span.setAttribute('role', 'button')
        span.setAttribute(
          'aria-label',
          `${m[1]}${term.full ? `：${term.full}` : ''}。${term.gloss}`,
        )
        span.dataset.abbr = term.abbr
        span.textContent = m[1]
        frag.append(span)

        last = m.index + m[1].length
      }
      if (last < text.length) frag.append(text.slice(last))
      node.parentNode?.replaceChild(frag, node)
    }

    setFound([...seen.values()])

    // 用事件委派，不必為每個 span 掛 listener
    const byAbbr = new Map([...seen.values()].map((t) => [t.abbr, t]))
    const pick = (e: Event) => {
      const el = (e.target as HTMLElement | null)?.closest?.(`.${MARK_CLASS}`)
      if (!(el instanceof HTMLElement)) return null
      const term = byAbbr.get(el.dataset.abbr ?? '')
      return term ? { el, term } : null
    }

    const onOver = (e: Event) => {
      const hit = pick(e)
      if (hit) show(hit.el, hit.term)
    }
    const onOut = (e: Event) => {
      if (pick(e)) setHover(null)
    }
    const onClick = (e: Event) => {
      const hit = pick(e)
      if (!hit) return
      e.preventDefault()
      show(hit.el, hit.term)
    }

    main.addEventListener('mouseover', onOver)
    main.addEventListener('mouseout', onOut)
    main.addEventListener('focusin', onOver)
    main.addEventListener('focusout', onOut)
    main.addEventListener('click', onClick)

    return () => {
      main.removeEventListener('mouseover', onOver)
      main.removeEventListener('mouseout', onOut)
      main.removeEventListener('focusin', onOver)
      main.removeEventListener('focusout', onOut)
      main.removeEventListener('click', onClick)
    }
  }, [pathname, show])

  // 捲動或按 Esc 就收起來
  useEffect(() => {
    if (!hover) return
    const close = () => setHover(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('scroll', close, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [hover])

  return (
    <>
      {hover && <Tooltip hover={hover} />}
      {found.length > 0 && <PageGlossary terms={found} />}
    </>
  )
}

function Tooltip({ hover }: { hover: NonNullable<Hover> }) {
  const { term, x, y } = hover
  // 靠邊時把氣泡往內收，不要被裁掉
  const half = 160
  const clampedX = Math.min(Math.max(x, half + 8), window.innerWidth - half - 8)
  const below = y < 140

  return (
    <div
      role="tooltip"
      data-no-gloss
      style={{
        position: 'fixed',
        left: clampedX,
        top: below ? y + 26 : y - 12,
        transform: `translate(-50%, ${below ? '0' : '-100%'})`,
        width: half * 2,
        zIndex: 60,
      }}
      className="pointer-events-none rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-3 shadow-xl shadow-black/40"
    >
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-mono text-[13px] font-semibold text-sky-300">{term.abbr}</span>
        {term.full && <span className="text-[11px] text-slate-400">{term.full}</span>}
      </p>
      <p className="mt-1.5 text-[12px] leading-5 text-slate-300">{term.gloss}</p>
      {term.clash && (
        <p className="mt-1.5 text-[11px] leading-4 text-amber-500/85">撞名：{term.clash}</p>
      )}
      {term.concept && (
        <p className="mt-1.5 font-mono text-[10px] text-slate-500">
          深入：{CONCEPT_META[term.concept].label}
        </p>
      )}
    </div>
  )
}

function PageGlossary({ terms }: { terms: Term[] }) {
  const sorted = [...terms].sort((a, b) => a.abbr.localeCompare(b.abbr))
  return (
    <section data-no-gloss className="mt-14 border-t border-slate-800 pt-8">
      <h2 className="text-base font-semibold text-slate-100">
        本頁出現的縮寫
        <span className="ml-2 font-mono text-xs font-normal text-slate-600">{sorted.length}</span>
      </h2>
      <p className="mt-1 text-[12px] text-slate-500">
        內文裡有虛線底線的縮寫可以直接滑過或點一下看解釋，不必離開這頁。
        完整清單見 <Link href="/glossary" className="text-sky-400 hover:text-sky-300">縮寫對照</Link>。
      </p>
      <dl className="mt-4 grid max-w-3xl gap-x-8 gap-y-2 sm:grid-cols-2">
        {sorted.map((t) => (
          <div key={t.abbr} className="flex gap-2 text-[12px] leading-5">
            <dt className="w-24 shrink-0 font-mono font-semibold text-sky-300/90">{t.abbr}</dt>
            {/* 只用 full，不截斷 gloss —— 截到一半的句子比留白更難讀 */}
            <dd className="text-slate-400">{t.full ?? '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
