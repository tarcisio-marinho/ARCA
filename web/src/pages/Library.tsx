import { ArrowLeft, ArrowSquareOut, Books, MagnifyingGlass } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Badge, Button, Card, cn, Empty, Input, PageHeader, Select, Spinner } from '../components/ui'
import { api, fmtBytes, fmtNum } from '../lib/api'

type Book = { id: string; name: string; path: string; title: string; description: string; language: string; category: string; articleCount: number; size: number; icon?: string }
type Hit = { book: string; bookTitle: string; title: string; path: string; snippet: string; lang: string }

const CAT_LABEL: Record<string, string> = {
  wikipedia: 'Wikipédia',
  stack_exchange: 'Perguntas & respostas',
  other: 'Referência',
  devdocs: 'Programação',
  wiktionary: 'Dicionário',
  wikibooks: 'Livros',
  wikivoyage: 'Viagem',
  ifixit: 'Reparos',
  gutenberg: 'Livros',
  freecodecamp: 'Programação',
}
const LANG: Record<string, string> = { por: 'PT', eng: 'EN', spa: 'ES' }

export default function Library() {
  const [q, setQ] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [lang, setLang] = useState('')
  const [reader, setReader] = useState<{ url: string; title: string } | null>(null)
  const { data: books, isLoading } = useQuery({ queryKey: ['books'], queryFn: () => api<Book[]>('/api/library/books') })
  const { data: hits, isFetching } = useQuery({
    queryKey: ['lib-search', submitted, lang],
    queryFn: () => api<Hit[]>(`/api/library/search?q=${encodeURIComponent(submitted)}${lang ? `&lang=${lang}` : ''}`),
    enabled: !!submitted,
  })

  const grouped = useMemo(() => {
    const g = new Map<string, Book[]>()
    for (const b of books ?? []) {
      const k = CAT_LABEL[b.category] ?? (b.name.includes('stackexchange') ? 'Perguntas & respostas' : b.name.startsWith('devdocs') ? 'Programação' : 'Referência')
      g.set(k, [...(g.get(k) ?? []), b])
    }
    return [...g.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [books])

  if (reader)
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-line px-4 py-2">
          <Button size="sm" variant="ghost" onClick={() => setReader(null)}>
            <ArrowLeft /> Biblioteca
          </Button>
          <span className="truncate text-sm font-semibold">{reader.title}</span>
          <a href={reader.url} target="_blank" rel="noreferrer" className="ml-auto text-fg-3 hover:text-gold" title="Abrir em nova aba">
            <ArrowSquareOut className="size-5" />
          </a>
        </div>
        <iframe src={reader.url} className="min-h-0 flex-1 bg-white" title={reader.title} />
      </div>
    )

  return (
    <div>
      <PageHeader
        icon={<Books weight="duotone" className="size-6" />}
        eyebrow="Conhecimento"
        title="Biblioteca offline"
        subtitle={books ? `${books.length} enciclopédias · ${fmtNum(books.reduce((s, b) => s + b.articleCount, 0))} artigos · ${fmtBytes(books.reduce((s, b) => s + b.size, 0))}` : 'Carregando acervo…'}
      />
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-6 md:px-8">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setSubmitted(q.trim())
          }}
          className="flex flex-wrap gap-2"
        >
          <div className="relative min-w-[240px] flex-1">
            <MagnifyingGlass className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar em todas as enciclopédias (ex: tetanus, cólera, solar panel)…" className="h-11 pl-9" />
          </div>
          <Select value={lang} onChange={(e) => setLang(e.target.value)} className="h-11 w-36">
            <option value="">Todos idiomas</option>
            <option value="por">Português</option>
            <option value="eng">Inglês</option>
          </Select>
          <Button variant="primary" className="h-11" loading={isFetching}>
            Buscar
          </Button>
        </form>

        {submitted && (
          <Card className="divide-y divide-line">
            <div className="flex items-center justify-between px-5 py-3 text-sm">
              <span className="font-semibold">
                Resultados para “{submitted}” {hits && <span className="text-fg-3">({hits.length})</span>}
              </span>
              <button onClick={() => setSubmitted('')} className="text-fg-3 hover:text-fg">
                limpar
              </button>
            </div>
            {isFetching && (
              <div className="p-5">
                <Spinner />
              </div>
            )}
            {hits?.length === 0 && <div className="p-5 text-sm text-fg-2">Nada encontrado. Muitas fontes médicas estão em inglês — tente o termo em inglês.</div>}
            {hits?.map((h, i) => (
              <button key={i} onClick={() => setReader({ url: `/kiwix/content/${h.book}/${h.path}`, title: h.title })} className="block w-full px-5 py-3 text-left hover:bg-elevated">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-fg">{h.title}</span>
                  <Badge tone="neutral">{LANG[h.lang] ?? h.lang}</Badge>
                  <span className="truncate text-xs text-fg-3">{h.bookTitle}</span>
                </div>
                <div className="mt-1 line-clamp-2 text-[13px] text-fg-2">{h.snippet}</div>
              </button>
            ))}
          </Card>
        )}

        {isLoading && <Spinner />}
        {books?.length === 0 && (
          <Empty icon={<Books className="size-6" />} title="Nenhum ZIM encontrado">
            Rode <code>./scripts/download-content.sh</code> para baixar o acervo.
          </Empty>
        )}
        {grouped.map(([cat, list]) => (
          <section key={cat}>
            <h2 className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-fg-3 uppercase">{cat}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((b) => (
                <button key={b.id} onClick={() => setReader({ url: `/kiwix/content/${b.path}/`, title: b.title })} className="text-left">
                  <Card className="flex h-full gap-3 p-4 transition hover:border-line-3 hover:bg-elevated">
                    <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line-2 bg-white/95">
                      {b.icon ? <img src={b.icon} alt="" className="size-8 object-contain" /> : <Books className="size-6 text-black/60" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold">{b.title}</span>
                        <Badge tone={b.language.includes('por') ? 'gold' : 'neutral'} className={cn('shrink-0')}>
                          {LANG[b.language] ?? b.language.slice(0, 3).toUpperCase()}
                        </Badge>
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-xs text-fg-2">{b.description}</div>
                      <div className="mt-1.5 text-[11px] text-fg-3">
                        {fmtNum(b.articleCount)} artigos · {fmtBytes(b.size)}
                      </div>
                    </div>
                  </Card>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
