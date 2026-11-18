import {
  Backpack,
  BookOpenText,
  Books,
  CurrencyBtc,
  FirstAidKit,
  Gauge,
  HardDrives,
  List,
  MagnifyingGlass,
  MapTrifold,
  MonitorPlay,
  NotePencil,
  Robot,
  SidebarSimple,
  Toolbox,
  Translate,
  type Icon,
} from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { cn } from './ui'

type Item = { to: string; label: string; icon: Icon; hint?: string }
const GROUPS: { label: string; items: Item[] }[] = [
  { label: 'Geral', items: [{ to: '/', label: 'Início', icon: Gauge }] },
  {
    label: 'Sobreviver',
    items: [
      { to: '/guias', label: 'Guias de sobrevivência', icon: FirstAidKit },
      { to: '/suprimentos', label: 'Suprimentos', icon: Backpack },
      { to: '/mapas', label: 'Mapas offline', icon: MapTrifold },
      { to: '/notas', label: 'Diário & notas', icon: NotePencil },
    ],
  },
  {
    label: 'Conhecimento',
    items: [
      { to: '/ia', label: 'IA Arca', icon: Robot },
      { to: '/biblioteca', label: 'Biblioteca', icon: Books },
      { to: '/videos', label: 'Vídeos', icon: MonitorPlay },
      { to: '/documentos', label: 'Documentos & PDFs', icon: BookOpenText },
      { to: '/tradutor', label: 'Tradutor', icon: Translate },
    ],
  },
  {
    label: 'Tecnologia',
    items: [
      { to: '/ferramentas', label: 'Ferramentas', icon: Toolbox },
      { to: '/bitcoin', label: 'Bitcoin', icon: CurrencyBtc },
      { to: '/sistema', label: 'Sistema', icon: HardDrives },
    ],
  },
]

function ArcaGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M3 14h18l-3 6H6z" />
      <path d="M12 3v11" />
      <path d="M12 4l6 8h-6z" />
    </svg>
  )
}

function StatusPill({ collapsed }: { collapsed: boolean }) {
  const { data } = useQuery({ queryKey: ['status'], queryFn: () => api('/api/status'), refetchInterval: 30_000 })
  const items = [
    { label: 'IA', ok: data?.llm?.ok },
    { label: 'Acervo', ok: data?.kiwix?.ok },
    { label: 'Internet', ok: data?.internet, neutral: true },
  ]
  if (collapsed)
    return (
      <div className="flex flex-col items-center gap-1.5 py-2">
        {items.map((i) => (
          <span key={i.label} title={`${i.label}: ${i.ok ? 'ok' : 'off'}`} className={cn('size-2 rounded-full', i.ok ? 'bg-ok' : i.neutral ? 'bg-fg-3' : 'bg-err')} />
        ))}
      </div>
    )
  return (
    <div className="space-y-1.5 rounded-xl border border-line bg-base p-3">
      {items.map((i) => (
        <div key={i.label} className="flex items-center justify-between text-xs">
          <span className="text-fg-2">{i.label}</span>
          <span className={cn('flex items-center gap-1.5 font-semibold', i.ok ? 'text-ok' : i.neutral ? 'text-fg-3' : 'text-err')}>
            <span className={cn('size-1.5 rounded-full bg-current', i.ok && 'pulse-ok')} />
            {data ? (i.ok ? (i.label === 'Internet' ? 'online' : 'pronto') : i.label === 'Internet' ? 'offline' : 'fora') : '…'}
          </span>
        </div>
      ))}
    </div>
  )
}

function SidebarSearch({ collapsed, onExpand }: { collapsed: boolean; onExpand: () => void }) {
  const nav = useNavigate()
  const { pathname, search } = useLocation()
  const ref = useRef<HTMLInputElement>(null)
  const [v, setV] = useState('')
  useEffect(() => {
    if (pathname === '/busca') setV(new URLSearchParams(search).get('q') ?? '')
  }, [pathname, search])
  // ⌘K / Ctrl+K ou "/" (fora de campos de texto) focam a busca
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName) || (e.target as HTMLElement)?.isContentEditable
      if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) {
        e.preventDefault()
        if (collapsed) onExpand()
        setTimeout(() => {
          ref.current?.focus()
          ref.current?.select()
        }, 0)
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [collapsed, onExpand])

  if (collapsed)
    return (
      <div className="px-2.5 pt-3">
        <button onClick={() => nav('/busca')} title="Buscar em tudo (⌘K)" className="flex h-9 w-full items-center justify-center rounded-[10px] text-fg-2 hover:bg-[#151515] hover:text-fg">
          <MagnifyingGlass className="size-[19px]" />
        </button>
      </div>
    )
  return (
    <form
      className="px-2.5 pt-3"
      onSubmit={(e) => {
        e.preventDefault()
        const q = v.trim()
        nav(q ? `/busca?q=${encodeURIComponent(q)}` : '/busca')
        ref.current?.blur()
      }}
    >
      <div className="group relative">
        <MagnifyingGlass className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-3 group-focus-within:text-gold" />
        <input
          ref={ref}
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && ref.current?.blur()}
          placeholder="Buscar em tudo…"
          className="h-9 w-full rounded-[10px] border border-line bg-base pr-10 pl-9 text-[13.5px] text-fg outline-none placeholder:text-fg-3 focus:border-gold/50 focus:ring-2 focus:ring-gold/15"
        />
        <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border border-line-2 px-1.5 font-mono text-[10px] text-fg-3">⌘K</kbd>
      </div>
    </form>
  )
}

export function Layout() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('arca.sidebar') === '1')
  const [mobileOpen, setMobileOpen] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])
  useEffect(() => {
    localStorage.setItem('arca.sidebar', collapsed ? '1' : '0')
  }, [collapsed])

  const nav = (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-line bg-[#0d0d0d] transition-[width] duration-200',
        collapsed ? 'w-[68px]' : 'w-[256px]'
      )}
    >
      <div className="flex items-center gap-2 border-b border-line px-3 py-3">
        <button
          onClick={() => collapsed && setCollapsed(false)}
          className="brand-mark flex size-9 shrink-0 items-center justify-center rounded-xl bg-gold-grad text-gold-ink"
          title="Arca"
        >
          <ArcaGlyph className="size-[19px]" />
        </button>
        {!collapsed && (
          <>
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-display text-[16px] font-bold tracking-tight">Arca</span>
              <span className="truncate text-[11px] text-fg-3">Kit offline de sobrevivência</span>
            </div>
            <button onClick={() => setCollapsed(true)} className="ml-auto hidden rounded-md p-1 text-fg-3 hover:text-fg md:block" title="Recolher menu">
              <SidebarSimple weight="duotone" className="size-[18px]" />
            </button>
          </>
        )}
      </div>

      <SidebarSearch collapsed={collapsed} onExpand={() => setCollapsed(false)} />

      <nav className="flex-1 space-y-5 overflow-y-auto px-2.5 py-4">
        {GROUPS.map((g) => (
          <div key={g.label}>
            {!collapsed && <div className="mb-1.5 px-2.5 text-[10.5px] font-semibold tracking-[0.14em] text-fg-3 uppercase">{g.label}</div>}
            <div className="space-y-0.5">
              {g.items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  end={it.to === '/'}
                  title={collapsed ? it.label : undefined}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex h-9 items-center gap-3 rounded-[10px] px-2.5 text-[13.5px] font-medium transition',
                      collapsed && 'justify-center px-0',
                      isActive ? 'bg-elevated text-fg ring-1 ring-line-2' : 'text-fg-2 hover:bg-[#151515] hover:text-fg'
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full bg-gold-grad" />}
                      <it.icon weight={isActive ? 'duotone' : 'regular'} className={cn('size-[19px] shrink-0', isActive && 'text-gold')} />
                      {!collapsed && <span className="truncate">{it.label}</span>}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-line p-2.5">
        <StatusPill collapsed={collapsed} />
      </div>
    </aside>
  )

  return (
    <div className="flex h-full">
      <div className="hidden h-full md:block">{nav}</div>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden" onClick={() => setMobileOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}>{nav}</div>
          <div className="flex-1 bg-black/60" />
        </div>
      )}
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-line px-4 py-2.5 md:hidden">
          <button onClick={() => setMobileOpen(true)} className="rounded-lg p-1.5 text-fg-2 hover:bg-overlay">
            <List className="size-5" />
          </button>
          <span className="font-display font-bold">Arca</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
