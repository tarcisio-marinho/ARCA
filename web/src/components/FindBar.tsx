import { CaretDown, CaretUp, MagnifyingGlass, X } from '@phosphor-icons/react'
import { type RefObject, useEffect, useRef, useState } from 'react'
import { highlightIn } from '../lib/highlight'

/** Barra flutuante "achar na página": destaca o termo vindo da busca e navega entre as ocorrências. */
export function FindBar({ target, term, ready, onClose }: { target: RefObject<HTMLElement | null>; term: string; ready: unknown; onClose: () => void }) {
  const [marks, setMarks] = useState<HTMLElement[]>([])
  const [i, setI] = useState(0)

  useEffect(() => {
    const el = target.current
    if (!el || !term) return
    // espera o markdown pintar
    const t = setTimeout(() => {
      const m = highlightIn(el, term)
      setMarks(m)
      setI(0)
    }, 50)
    return () => clearTimeout(t)
  }, [target, term, ready])

  const first = useRef(true)
  useEffect(() => {
    marks.forEach((m, k) => m.classList.toggle('find-current', k === i))
    marks[i]?.scrollIntoView({ block: 'center', behavior: first.current ? 'auto' : 'smooth' })
    if (marks.length) first.current = false
  }, [marks, i])

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter' && marks.length && !/^(INPUT|TEXTAREA)$/.test((e.target as HTMLElement).tagName)) setI((x) => (x + (e.shiftKey ? marks.length - 1 : 1)) % marks.length)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [marks, onClose])

  const close = () => {
    const el = target.current
    if (el) highlightIn(el, '')
    onClose()
  }
  if (!term) return null
  const n = marks.length
  return (
    <div className="sticky top-3 z-20 mx-auto mb-4 flex w-fit items-center gap-2 rounded-xl border border-gold/30 bg-surface/95 px-3 py-1.5 text-[13px] shadow-xl backdrop-blur print:hidden">
      <MagnifyingGlass className="text-gold" />
      <span className="max-w-[220px] truncate font-semibold">“{term}”</span>
      <span className="text-fg-3 tabular-nums">{n ? `${i + 1} de ${n}` : 'não aparece no texto visível'}</span>
      <button disabled={!n} onClick={() => setI((x) => (x + n - 1) % n)} className="rounded p-1 text-fg-2 hover:bg-overlay hover:text-fg disabled:opacity-30" title="Anterior (Shift+Enter)">
        <CaretUp />
      </button>
      <button disabled={!n} onClick={() => setI((x) => (x + 1) % n)} className="rounded p-1 text-fg-2 hover:bg-overlay hover:text-fg disabled:opacity-30" title="Próxima (Enter)">
        <CaretDown />
      </button>
      <button onClick={close} className="rounded p-1 text-fg-3 hover:bg-overlay hover:text-fg" title="Fechar (Esc)">
        <X />
      </button>
    </div>
  )
}
