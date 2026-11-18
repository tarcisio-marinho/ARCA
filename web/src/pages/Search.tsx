import { ArrowLeft, ArrowSquareOut, Books, FilePdf, FirstAidKit, MagnifyingGlass, NotePencil, FileText } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Badge, Button, Card, cn, Empty, Input, PageHeader, Spinner, Tabs } from '../components/ui'
import { api, fmtNum } from '../lib/api'

type Snippet = { text: string; hl: [number, number][]; page?: number; heading?: string }
type Hit = { kind: 'guide' | 'pdf' | 'upload' | 'note'; id: number; title: string; category: string; sourceRef?: string; count: number; titleMatch: boolean; snippets: Snippet[] }
type FindResult = { query: string; mode: 'phrase' | 'words'; total: number; docs: number; hits: Hit[]; ms: number }
type WikiHit = { book: string; bookTitle: string; title: string; path: string; snippet: string; lang: string }
type Tab = 'all' | 'guide' | 'pdf' | 'note' | 'wiki'

const KIND = {
  guide: { label: 'Guia', tone: 'gold' as const, icon: FirstAidKit },
  pdf: { label: 'PDF', tone: 'info' as const, icon: FilePdf },
  upload: { label: 'Enviado', tone: 'neutral' as const, icon: FileText },
  note: { label: 'Nota', tone: 'neutral' as const, icon: NotePencil },
}

function Highlighted({ s }: { s: Snippet }) {
  const parts: React.ReactNode[] = []
  let last = 0
  s.hl.forEach(([a, b], i) => {
    if (a < last) return
    parts.push(s.text.slice(last, a))
    parts.push(
      <mark key={i} className="find-mark">
        {s.text.slice(a, b)}
      </mark>
    )
    last = b
  })
  parts.push(s.text.slice(last))
  return <>{parts}</>
}

function linkFor(h: Hit, q: string, s?: Snippet) {
  const qs = `q=${encodeURIComponent(q)}`
  if (h.kind === 'guide') return `/guias/${h.sourceRef!.split('/').pop()!.replace(/\.md$/, '')}?${qs}`
  if (h.kind === 'note') return `/notas?id=${h.id}`
  return `/docs/${h.id}?${qs}${s?.page ? `&page=${s.page}` : ''}`
}

export default function Search() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const [input, setInput] = useState(q)
  const [tab, setTab] = useState<Tab>('all')
  const [reader, setReader] = useState<{ url: string; title: string } | null>(null)
  useEffect(() => {
    setInput(q)
    setReader(null)
  }, [q])

  const { data, isFetching } = useQuery({
    queryKey: ['find', q],
    queryFn: () => api<FindResult>(`/api/find?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
  })
  const { data: wiki, isFetching: wikiLoading } = useQuery({
    queryKey: ['find-wiki', q],
    queryFn: () => api<WikiHit[]>(`/api/library/search?q=${encodeURIComponent(q)}&limit=40`),
    enabled: q.trim().length >= 2,
  })

  const counts = useMemo(() => {
    const c = { guide: 0, pdf: 0, note: 0 }
    for (const h of data?.hits ?? []) c[h.kind === 'upload' ? 'pdf' : h.kind]++
    return c
  }, [data])
  const visible = (data?.hits ?? []).filter((h) => tab === 'all' || (tab === 'pdf' ? h.kind === 'pdf' || h.kind === 'upload' : h.kind === tab))

  if (reader)
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-line px-4 py-2">
          <Button size="sm" variant="ghost" onClick={() => setReader(null)}>
            <ArrowLeft /> Resultados
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
        icon={<MagnifyingGlass weight="duotone" className="size-6" />}
        eyebrow="Busca"
        title="Buscar em tudo"
        subtitle="Procura o termo exato em todos os guias, PDFs, documentos enviados, notas e enciclopédias — sem ligar para acentos ou maiúsculas."
      />
      <div className="mx-auto max-w-5xl space-y-5 px-6 py-6 md:px-8">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (input.trim()) setParams({ q: input.trim() })
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <MagnifyingGlass className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
            <Input autoFocus value={input} onChange={(e) => setInput(e.target.value)} placeholder='Ex.: hipoclorito, "soro caseiro", torniquete…' className="h-11 pl-9" />
          </div>
          <Button variant="primary" className="h-11" loading={isFetching}>
            Buscar
          </Button>
        </form>

        {!q && (
          <Empty icon={<MagnifyingGlass className="size-6" />} title="Digite um termo">
            Funciona como o Ctrl+F, só que em toda a Arca de uma vez. Dica: use <b>⌘K</b> ou <b>/</b> em qualquer tela para buscar.
          </Empty>
        )}

        {q && data && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Tabs
                value={tab}
                onChange={setTab}
                items={[
                  { value: 'all', label: `Tudo · ${data.docs}` },
                  { value: 'guide', label: `Guias · ${counts.guide}` },
                  { value: 'pdf', label: `PDFs & docs · ${counts.pdf}` },
                  { value: 'note', label: `Notas · ${counts.note}` },
                  { value: 'wiki', label: `Enciclopédias · ${wikiLoading ? '…' : (wiki?.length ?? 0)}` },
                ]}
              />
              <span className="text-xs text-fg-3">
                {fmtNum(data.total)} ocorrência(s) em {data.docs} documento(s) · {data.ms} ms
              </span>
            </div>
            {data.mode === 'words' && (
              <Card className="border-gold/20 p-3 text-[13px] text-fg-2">
                A frase exata “{q}” não aparece em nenhum lugar — mostrando documentos que têm <b>todas as palavras</b>, mesmo separadas.
              </Card>
            )}
          </>
        )}

        {q && tab === 'all' && data && !visible.length && <div className="text-sm text-fg-3">Nenhum guia, PDF ou nota contém esse termo.</div>}
        {q && tab !== 'wiki' && tab !== 'all' && data && !visible.length && (
          <Empty icon={<MagnifyingGlass className="size-6" />} title="Nada encontrado aqui">
            Tente outra grafia, um sinônimo, o termo em inglês (muitos PDFs são em inglês) ou pergunte à IA.
          </Empty>
        )}

        {tab !== 'wiki' && (
          <div className="space-y-3">
            {visible.map((h) => {
              const K = KIND[h.kind]
              return (
                <Card key={`${h.kind}-${h.id}`} className="overflow-hidden">
                  <Link to={linkFor(h, q)} className="flex items-center gap-3 border-b border-line px-5 py-3 hover:bg-elevated">
                    <K.icon weight="duotone" className={cn('size-5 shrink-0', h.kind === 'guide' ? 'text-gold' : h.kind === 'pdf' ? 'text-err' : 'text-fg-2')} />
                    <span className="min-w-0 flex-1 truncate font-semibold">{h.title}</span>
                    <Badge tone={K.tone}>{K.label}</Badge>
                    <span className="shrink-0 text-xs text-fg-3 tabular-nums">{h.count}×</span>
                  </Link>
                  <div className="divide-y divide-line/60">
                    {h.snippets.map((s, i) => (
                      <Link key={i} to={linkFor(h, q, s)} className="block px-5 py-2.5 text-[13px] leading-relaxed text-fg-2 hover:bg-elevated">
                        {(s.page || s.heading) && <span className="mr-2 text-[11px] font-semibold text-fg-3">{s.page ? `p. ${s.page}` : s.heading}</span>}
                        <Highlighted s={s} />
                      </Link>
                    ))}
                    {h.count > h.snippets.length && (
                      <Link to={linkFor(h, q)} className="block px-5 py-2 text-xs text-fg-3 hover:text-gold">
                        + {h.count - h.snippets.length} outra(s) ocorrência(s) neste documento
                      </Link>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        )}

        {q && (tab === 'wiki' || tab === 'all') && (
          <div className="space-y-2">
            {tab === 'all' && (
              <div className="flex items-center gap-2 pt-3 text-[11px] font-semibold tracking-[0.14em] text-fg-3 uppercase">
                <Books className="size-4" /> Enciclopédias offline {wikiLoading && <Spinner className="size-3.5" />}
              </div>
            )}
            {wiki && !wiki.length && !wikiLoading && <div className="text-sm text-fg-3">Nenhum artigo nas enciclopédias com índice de busca.</div>}
            <Card className="divide-y divide-line">
              {(tab === 'all' ? wiki?.slice(0, 8) : wiki)?.map((w, i) => (
                <button key={i} onClick={() => setReader({ url: `/kiwix/content/${w.book}/${w.path}`, title: w.title })} className="block w-full px-5 py-3 text-left hover:bg-elevated">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    {w.title} <span className="text-xs font-normal text-fg-3">· {w.bookTitle}</span>
                  </div>
                  <div className="mt-1 line-clamp-2 text-[13px] text-fg-2">{w.snippet}</div>
                </button>
              ))}
              {tab === 'all' && (wiki?.length ?? 0) > 8 && (
                <button onClick={() => setTab('wiki')} className="block w-full px-5 py-2 text-left text-xs text-fg-3 hover:text-gold">
                  Ver todos os {wiki!.length} artigos →
                </button>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
