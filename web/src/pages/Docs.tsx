import { ArrowLeft, BookOpenText, CloudArrowUp, FilePdf, FileText, MagnifyingGlass, Robot, Trash } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { FindBar } from '../components/FindBar'
import { toast } from 'sonner'
import { Markdown } from '../components/Markdown'
import { Badge, Button, Card, Empty, Input, PageHeader, Spinner } from '../components/ui'
import { api, del, fmtNum, post } from '../lib/api'

type Doc = { id: number; title: string; category: string; sourceType: string; sourceRef: string; pages: number | null; chars: number; chunks: number; pending: number }

function DocView({ id }: { id: string }) {
  const nav = useNavigate()
  const { data: d } = useQuery({ queryKey: ['doc', Number(id)], queryFn: () => api(`/api/docs/${id}`) })
  const [params, setParams] = useSearchParams()
  const findTerm = params.get('q') ?? ''
  const page = params.get('page')
  const bodyRef = useRef<HTMLDivElement>(null)
  const closeFind = useCallback(() => setParams({}, { replace: true }), [setParams])
  if (!d)
    return (
      <div className="p-8">
        <Spinner />
      </div>
    )
  const isPdf = d.sourceRef.toLowerCase().endsWith('.pdf')
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
        <Button size="sm" variant="ghost" onClick={() => nav(-1)}>
          <ArrowLeft /> Voltar
        </Button>
        <span className="truncate font-semibold">{d.title}</span>
        <Badge tone="neutral">{d.category}</Badge>
        <Button size="sm" variant="secondary" className="ml-auto" onClick={() => nav(`/ia?q=${encodeURIComponent(`Sobre o documento "${d.title}": `)}`)}>
          <Robot /> Perguntar à IA
        </Button>
      </div>
      {isPdf ? (
        <>
          {findTerm && (
            <div className="flex items-center gap-2 border-b border-line bg-gold-subtle px-4 py-1.5 text-[12.5px] text-fg-2">
              Buscando “<b className="text-fg">{findTerm}</b>”{page && <> — aberto na <b className="text-fg">página {page}</b></>}. Use <kbd className="rounded border border-line-2 px-1 font-mono text-[11px]">⌘F</kbd> dentro do PDF para pular entre as ocorrências.
            </div>
          )}
          <iframe
            key={`${page}-${findTerm}`}
            src={`/api/docs/${id}/file#${page ? `page=${page}&` : ''}search=${encodeURIComponent(findTerm)}`}
            className="min-h-0 flex-1 bg-[#1a1a1a]"
            title={d.title}
          />
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-6 py-8">
            <FindBar target={bodyRef} term={findTerm} ready={d} onClose={closeFind} />
            <div ref={bodyRef}>
              <Markdown>{d.content}</Markdown>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Docs() {
  const { id } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<any[] | null>(null)
  const [searching, setSearching] = useState(false)
  const { data: docs, isLoading } = useQuery({ queryKey: ['docs', 'all'], queryFn: () => api<Doc[]>('/api/docs'), refetchInterval: 15_000 })

  if (id) return <DocView id={id} />

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    const fd = new FormData()
    for (const f of files) fd.append('file', f)
    try {
      const r = await fetch('/api/docs/upload', { method: 'POST', body: fd }).then((r) => r.json())
      const ok = r.filter((x: any) => x.ok).length
      toast.success(`${ok} arquivo(s) indexado(s). Os embeddings são gerados em segundo plano.`)
      r.filter((x: any) => !x.ok).forEach((x: any) => toast.error(`${x.file}: ${x.error}`))
      qc.invalidateQueries({ queryKey: ['docs'] })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const pending = docs?.reduce((s, d) => s + d.pending, 0) ?? 0

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        upload(e.dataTransfer.files)
      }}
    >
      <PageHeader
        icon={<BookOpenText weight="duotone" className="size-6" />}
        eyebrow="Conhecimento"
        title="Documentos & PDFs"
        subtitle="Tudo aqui é lido pela IA. Arraste PDFs, Markdown, TXT ou código para indexar."
        actions={
          <>
            <input ref={fileRef} type="file" multiple hidden accept=".pdf,.md,.txt,.markdown,.json,.js,.ts,.py,.cs,.go,.rs,.java,.sh,.sql,.yml,.yaml,.html,.css" onChange={(e) => upload(e.target.files)} />
            <Button variant="primary" loading={uploading} onClick={() => fileRef.current?.click()}>
              <CloudArrowUp weight="bold" /> Enviar arquivos
            </Button>
          </>
        }
      />
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-6 md:px-8">
        {pending > 0 && (
          <Card className="flex items-center gap-3 border-gold/20 p-4 text-sm">
            <Spinner className="size-4" />
            Gerando embeddings para busca semântica: <b>{fmtNum(pending)}</b> trechos na fila (a busca por palavra-chave já funciona).
          </Card>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!q.trim()) return setResults(null)
            setSearching(true)
            try {
              setResults(await post('/api/docs/search', { q, limit: 12 }))
            } finally {
              setSearching(false)
            }
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <MagnifyingGlass className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca semântica nos guias e documentos…" className="h-11 pl-9" />
          </div>
          <Button variant="dark" className="h-11" loading={searching}>
            Buscar
          </Button>
        </form>
        {results && (
          <Card className="divide-y divide-line">
            {results.length === 0 && <div className="p-5 text-sm text-fg-2">Nada encontrado.</div>}
            {results.map((r) => (
              <button key={r.chunkId} onClick={() => nav(`/docs/${r.docId}`)} className="block w-full px-5 py-3 text-left hover:bg-elevated">
                <div className="text-sm font-semibold">
                  {r.title} {r.heading && <span className="font-normal text-fg-3">› {r.heading}</span>}
                </div>
                <div className="mt-1 line-clamp-2 text-[13px] text-fg-2">{r.text}</div>
              </button>
            ))}
          </Card>
        )}

        {isLoading && <Spinner />}
        {docs?.length === 0 && (
          <Empty icon={<FileText className="size-6" />} title="Nenhum documento">
            Envie PDFs (manuais, livros, bulas) — ou coloque arquivos em <code>data/pdfs</code>.
          </Empty>
        )}
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] tracking-wider text-fg-3 uppercase">
                <th className="px-5 py-3 font-semibold">Documento</th>
                <th className="px-3 py-3 font-semibold">Categoria</th>
                <th className="px-3 py-3 font-semibold">Origem</th>
                <th className="px-3 py-3 text-right font-semibold">Trechos</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {docs?.map((d) => (
                <tr key={d.id} className="group border-b border-line/60 hover:bg-elevated">
                  <td className="cursor-pointer px-5 py-3" onClick={() => nav(d.sourceType === 'guide' ? `/guias/${d.sourceRef.split('/').pop()!.replace('.md', '')}` : `/docs/${d.id}`)}>
                    <div className="flex items-center gap-2.5">
                      {d.sourceRef.toLowerCase().endsWith('.pdf') ? <FilePdf weight="duotone" className="size-5 shrink-0 text-err" /> : <FileText weight="duotone" className="size-5 shrink-0 text-gold" />}
                      <span className="font-medium">{d.title}</span>
                      {d.pages && <span className="text-xs text-fg-3">{d.pages} pág.</span>}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-fg-2">{d.category}</td>
                  <td className="px-3 py-3">
                    <Badge tone={d.sourceType === 'guide' ? 'gold' : d.sourceType === 'pdf' ? 'info' : 'neutral'}>{d.sourceType === 'guide' ? 'guia' : d.sourceType === 'pdf' ? 'referência' : 'enviado'}</Badge>
                  </td>
                  <td className="px-3 py-3 text-right text-fg-2 tabular-nums">
                    {d.chunks}
                    {d.pending > 0 && <span className="ml-1 text-xs text-gold">({d.pending} na fila)</span>}
                  </td>
                  <td className="px-2">
                    {d.sourceType === 'upload' && (
                      <button
                        onClick={async () => {
                          if (!confirm(`Remover "${d.title}"?`)) return
                          await del(`/api/docs/${d.id}`)
                          qc.invalidateQueries({ queryKey: ['docs'] })
                        }}
                        className="hidden rounded p-1 text-fg-3 group-hover:block hover:text-err"
                      >
                        <Trash />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  )
}
