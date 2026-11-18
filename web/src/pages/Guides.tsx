import { ArrowLeft, FirstAidKit, MagnifyingGlass, Printer, Robot } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { FindBar } from '../components/FindBar'
import { Markdown, slugify } from '../components/Markdown'
import { Button, Card, cn, Empty, Input, PageHeader, Spinner } from '../components/ui'
import { api } from '../lib/api'

type Doc = { id: number; title: string; category: string; sourceRef: string; chars: number }
const slugOf = (d: Doc) => d.sourceRef.split('/').pop()!.replace(/\.md$/, '')

export default function Guides() {
  const { id } = useParams()
  const nav = useNavigate()
  const [filter, setFilter] = useState('')
  const [params, setParams] = useSearchParams()
  const findTerm = params.get('q') ?? ''
  const articleRef = useRef<HTMLDivElement>(null)
  const closeFind = useCallback(() => setParams({}, { replace: true }), [setParams])
  const { data: docs, isLoading } = useQuery({ queryKey: ['docs', 'guide'], queryFn: () => api<Doc[]>('/api/docs?type=guide') })

  const sorted = useMemo(() => [...(docs ?? [])].sort((a, b) => a.sourceRef.localeCompare(b.sourceRef)), [docs])
  const current = sorted.find((d) => String(d.id) === id || slugOf(d) === id)
  const { data: doc } = useQuery({ queryKey: ['doc', current?.id], queryFn: () => api(`/api/docs/${current!.id}`), enabled: !!current })

  const groups = useMemo(() => {
    const g = new Map<string, Doc[]>()
    for (const d of sorted.filter((d) => !filter || (d.title + d.category).toLowerCase().includes(filter.toLowerCase()))) {
      g.set(d.category, [...(g.get(d.category) ?? []), d])
    }
    return [...g.entries()]
  }, [sorted, filter])

  const toc = useMemo(() => (doc?.content ?? '').split('\n').filter((l: string) => /^##\s/.test(l)).map((l: string) => l.replace(/^##\s+/, '')), [doc])

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<FirstAidKit weight="duotone" className="size-6" />}
        eyebrow="Sobreviver"
        title="Guias de sobrevivência"
        subtitle="Protocolos curados em português — revisados para o cenário sem energia e sem internet."
      />
      <div className="flex min-h-0 flex-1">
        {/* lista */}
        <aside className={cn('w-full shrink-0 overflow-y-auto border-r border-line p-4 md:w-[300px]', current && 'hidden md:block')}>
          <div className="relative mb-4">
            <MagnifyingGlass className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar guias…" className="pl-9" />
          </div>
          {isLoading && <Spinner />}
          {!isLoading && !sorted.length && (
            <Empty icon={<FirstAidKit className="size-6" />} title="Nenhum guia indexado ainda">
              Os guias ficam em <code>content/</code> e são indexados quando o app sobe.
            </Empty>
          )}
          <div className="space-y-5">
            {groups.map(([cat, list]) => (
              <div key={cat}>
                <div className="mb-1.5 px-2 text-[10.5px] font-semibold tracking-[0.14em] text-fg-3 uppercase">{cat}</div>
                {list.map((d) => (
                  <Link
                    key={d.id}
                    to={`/guias/${slugOf(d)}`}
                    className={cn(
                      'block rounded-[10px] px-3 py-2 text-[13.5px] transition',
                      current?.id === d.id ? 'bg-elevated text-fg ring-1 ring-gold/25' : 'text-fg-2 hover:bg-[#151515] hover:text-fg'
                    )}
                  >
                    {d.title}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </aside>

        {/* leitor */}
        <section className={cn('min-w-0 flex-1 overflow-y-auto', !current && 'hidden md:block')} id="guide-scroll">
          {!current ? (
            <Empty icon={<FirstAidKit className="size-6" />} title="Escolha um guia">
              Em emergência médica, comece por <b>Primeiros socorros</b>. Imprima os guias críticos enquanto ainda há energia.
            </Empty>
          ) : !doc ? (
            <div className="p-8">
              <Spinner />
            </div>
          ) : (
            <div className="mx-auto flex max-w-5xl gap-8 px-6 py-8 md:px-10">
              <article className="min-w-0 flex-1">
                <div className="mb-6 flex flex-wrap items-center gap-2 print:hidden">
                  <Button size="sm" variant="ghost" className="md:hidden" onClick={() => nav('/guias')}>
                    <ArrowLeft /> Guias
                  </Button>
                  <Button size="sm" variant="dark" onClick={() => window.print()}>
                    <Printer /> Imprimir
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => nav(`/ia?q=${encodeURIComponent(`Sobre o guia "${doc.title}": `)}`)}>
                    <Robot /> Perguntar à IA sobre este guia
                  </Button>
                </div>
                <div className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-gold uppercase">{doc.category}</div>
                <h1 className="mb-6 font-display text-[34px] leading-tight font-extrabold tracking-[-0.03em]">{doc.title}</h1>
                <FindBar target={articleRef} term={findTerm} ready={doc} onClose={closeFind} />
                <div ref={articleRef}>
                  <Markdown>{doc.content.replace(/^#\s+.*\n/, '')}</Markdown>
                </div>
              </article>
              {toc.length > 2 && (
                <nav className="sticky top-8 hidden h-fit w-56 shrink-0 xl:block print:hidden">
                  <Card className="p-4">
                    <div className="mb-2 text-[10.5px] font-semibold tracking-[0.14em] text-fg-3 uppercase">Nesta página</div>
                    <div className="space-y-1">
                      {toc.map((t: string) => (
                        <a key={t} href={`#${slugify(t)}`} className="block truncate text-[13px] text-fg-2 hover:text-gold">
                          {t}
                        </a>
                      ))}
                    </div>
                  </Card>
                </nav>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
