'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { CONCEPT_IDS } from '@/data/types'
import { CONCEPT_META, SYSTEM_META } from '@/data/taxonomy'

type Item = { href: string; label: string; hint?: string; sub?: true }

/** 深入頁：掛在某個主頁底下，用縮排表示層級。 */
const DEEP_DIVES: Record<string, Item[]> = {
  '/systems/airsync': [{ href: '/systems/airsync/webrtc-fork', label: 'libwebrtc fork 改了什麼', sub: true }],
  '/concepts/capture': [
    { href: '/concepts/capture/virtual-devices', label: '虛擬裝置的跨平台現實', sub: true },
  ],
}

function withDeepDives(items: Item[]): Item[] {
  return items.flatMap((item) => [item, ...(DEEP_DIVES[item.href] ?? [])])
}

const SYSTEM_ITEMS: Item[] = withDeepDives(
  Object.values(SYSTEM_META).map((m) => ({ href: m.href, label: m.label })),
)

const CONCEPT_ITEMS: Item[] = withDeepDives(
  CONCEPT_IDS.map((id) => ({
    href: `/concepts/${id}`,
    label: CONCEPT_META[id].label,
    hint: CONCEPT_META[id].status === 'outline' ? '大綱' : undefined,
  })),
)

function useActive(pathname: string) {
  return (href: string) => (href === '/' ? pathname === '/' : pathname === href)
}

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: Item
  active: boolean
  onNavigate: () => void
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center justify-between gap-2 rounded border-l-2 py-1.5 pr-2.5 text-[13px] transition ${
        item.sub ? 'pl-5 text-[12px]' : 'pl-2.5'
      } ${
        active
          ? 'border-sky-500 bg-sky-500/10 font-medium text-sky-300'
          : 'border-transparent text-slate-400 hover:bg-slate-900 hover:text-slate-100'
      }`}
    >
      <span className="flex items-center gap-1.5">
        {item.sub && (
          <span aria-hidden className="text-slate-600">
            ↳
          </span>
        )}
        {item.label}
      </span>
      {item.hint && (
        <span
          className={`font-mono text-[9px] ${active ? 'text-sky-500/70' : 'text-slate-600'}`}
        >
          {item.hint}
        </span>
      )}
    </Link>
  )
}

function NavSections({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname()
  const isActive = useActive(pathname)

  return (
    <>
      <Link href="/" onClick={onNavigate} className="block">
        <p className="font-mono text-[10px] tracking-widest text-sky-500 uppercase">domain</p>
        <p
          className={`mt-1 text-sm font-semibold ${
            isActive('/') ? 'text-sky-300' : 'text-slate-100'
          }`}
        >
          av-streaming
        </p>
      </Link>

      <div className="mt-7">
        <p className="mb-2 font-mono text-[10px] tracking-widest text-slate-600 uppercase">
          子系統
        </p>
        <ul className="space-y-0.5">
          {SYSTEM_ITEMS.map((item) => (
            <li key={item.href}>
              <NavLink item={item} active={isActive(item.href)} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6">
        <p className="mb-2 font-mono text-[10px] tracking-widest text-slate-600 uppercase">
          通用概念
        </p>
        <ul className="space-y-0.5">
          {CONCEPT_ITEMS.map((item) => (
            <li key={item.href}>
              <NavLink item={item} active={isActive(item.href)} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6 space-y-0.5 border-t border-slate-800 pt-5">
        <NavLink
          item={{ href: '/glossary', label: '縮寫對照' }}
          active={isActive('/glossary')}
          onNavigate={onNavigate}
        />
        <NavLink
          item={{ href: '/open-questions', label: '待釘問題' }}
          active={isActive('/open-questions')}
          onNavigate={onNavigate}
        />
      </div>
    </>
  )
}

/** 目前頁面的標題，給行動版頂欄用。 */
function useCurrentLabel() {
  const pathname = usePathname()
  if (pathname === '/') return '總覽'
  const all = [
    ...SYSTEM_ITEMS,
    ...CONCEPT_ITEMS,
    { href: '/glossary', label: '縮寫對照' },
    { href: '/open-questions', label: '待釘問題' },
  ]
  return all.find((i) => i.href === pathname)?.label ?? 'av-streaming'
}

export function Nav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const currentLabel = useCurrentLabel()

  // 換頁就關抽屜。
  useEffect(() => setOpen(false), [pathname])

  // 抽屜開著時鎖住背景捲動。
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <>
      {/* 行動版：頂欄 + 抽屜 */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="切換導覽"
          className="rounded border border-slate-700 px-2.5 py-1.5 text-slate-300 hover:bg-slate-900"
        >
          <span className="block h-[1.5px] w-4 bg-current" />
          <span className="mt-[3px] block h-[1.5px] w-4 bg-current" />
          <span className="mt-[3px] block h-[1.5px] w-4 bg-current" />
        </button>
        <div className="min-w-0">
          <p className="font-mono text-[9px] tracking-widest text-sky-500 uppercase">
            av-streaming
          </p>
          <p className="truncate text-[13px] font-medium text-slate-100">{currentLabel}</p>
        </div>
      </header>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/70 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}
      <nav
        className={`fixed top-0 left-0 z-50 h-full w-64 overflow-y-auto border-r border-slate-800 bg-slate-950 px-5 py-6 transition-transform lg:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <NavSections onNavigate={() => setOpen(false)} />
      </nav>

      {/* 桌機版：常駐側欄 */}
      <nav className="sticky top-0 hidden h-screen w-60 shrink-0 overflow-y-auto border-r border-slate-800 px-5 py-7 lg:block">
        <NavSections onNavigate={() => undefined} />
      </nav>
    </>
  )
}
