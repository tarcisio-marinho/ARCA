import { NotePencil, Plus, PushPin, Trash } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, cn, Empty, PageHeader } from '../components/ui'
import { api, del, post, put, timeAgo } from '../lib/api'

type Note = { id: number; title: string; body: string; pinned: boolean; updatedAt: string }

export default function Notes() {
  const qc = useQueryClient()
  const { data: notes } = useQuery({ queryKey: ['notes'], queryFn: () => api<Note[]>('/api/notes') })
  const [params] = useSearchParams()
  const [sel, setSel] = useState<number | null>(() => Number(params.get('id')) || null)
  const [draft, setDraft] = useState<Note | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const current = notes?.find((n) => n.id === sel) ?? null

  useEffect(() => {
    if (current && current.id !== draft?.id) setDraft(current)
  }, [current, draft?.id])
  useEffect(() => {
    if (!sel && notes?.length) setSel(notes[0].id)
  }, [notes, sel])

  const save = (n: Note) => {
    setDraft(n)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      await put(`/api/notes/${n.id}`, n)
      qc.invalidateQueries({ queryKey: ['notes'] })
    }, 600)
  }
  const create = async () => {
    const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })
    const n = await post<Note>('/api/notes', { title: `Diário — ${today}`, body: '' })
    await qc.invalidateQueries({ queryKey: ['notes'] })
    setSel(n.id)
    setDraft(n)
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<NotePencil weight="duotone" className="size-6" />}
        eyebrow="Sobreviver"
        title="Diário & notas"
        subtitle="Registre sintomas, doses dadas, consumo, contatos e decisões. Salva sozinho."
        actions={
          <Button variant="primary" onClick={create}>
            <Plus weight="bold" /> Nova nota
          </Button>
        }
      />
      <div className="flex min-h-0 flex-1">
        <aside className="w-[260px] shrink-0 overflow-y-auto border-r border-line p-2">
          {notes?.map((n) => (
            <button key={n.id} onClick={() => setSel(n.id)} className={cn('mb-0.5 block w-full rounded-[10px] px-3 py-2 text-left', sel === n.id ? 'bg-elevated ring-1 ring-line-2' : 'hover:bg-[#151515]')}>
              <div className="flex items-center gap-1.5 truncate text-[13.5px] font-medium">
                {n.pinned && <PushPin weight="fill" className="shrink-0 text-gold" />}
                {n.title}
              </div>
              <div className="truncate text-xs text-fg-3">
                {timeAgo(n.updatedAt)} · {n.body.slice(0, 40) || 'vazia'}
              </div>
            </button>
          ))}
        </aside>
        <section className="min-w-0 flex-1 overflow-y-auto">
          {draft ? (
            <div className="mx-auto max-w-3xl px-6 py-6">
              <div className="mb-3 flex items-center gap-2">
                <input value={draft.title} onChange={(e) => save({ ...draft, title: e.target.value })} className="min-w-0 flex-1 bg-transparent font-display text-2xl font-bold tracking-tight outline-none" />
                <Button size="sm" variant="ghost" onClick={() => save({ ...draft, pinned: !draft.pinned })} title="Fixar">
                  <PushPin weight={draft.pinned ? 'fill' : 'regular'} className={draft.pinned ? 'text-gold' : ''} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (!confirm('Apagar esta nota?')) return
                    await del(`/api/notes/${draft.id}`)
                    setSel(null)
                    setDraft(null)
                    qc.invalidateQueries({ queryKey: ['notes'] })
                  }}
                >
                  <Trash />
                </Button>
              </div>
              <textarea
                value={draft.body}
                onChange={(e) => save({ ...draft, body: e.target.value })}
                placeholder="Escreva aqui… (ex: 14h — dipirona 500 mg para João, febre 38,4 °C)"
                className="min-h-[60vh] w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-fg-3"
              />
            </div>
          ) : (
            <Empty icon={<NotePencil className="size-6" />} title="Nenhuma nota">
              Um diário ajuda muito: horário de remédios, evolução de sintomas, consumo de água.
            </Empty>
          )}
        </section>
      </div>
    </div>
  )
}
