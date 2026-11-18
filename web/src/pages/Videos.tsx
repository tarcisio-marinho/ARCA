import { ClosedCaptioning, MagnifyingGlass, MonitorPlay, SubtitlesSlash } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Thumb, VideoHitCard } from '../components/VideoCards'
import { Badge, Button, Card, Empty, Input, PageHeader, Select, Spinner, Tabs } from '../components/ui'
import { api, fmtNum } from '../lib/api'
import { fmtVideoDate, foldQuery, videoLink, type VideoFind, type VideoItem } from '../lib/video'

type Sort = 'new' | 'old' | 'long' | 'short'
const PAGE = 60

function Grid({ videos }: { videos: VideoItem[] }) {
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState<Sort>(() => (localStorage.getItem('arca.videos.sort') as Sort) || 'new')
  const [shown, setShown] = useState(PAGE)
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => localStorage.setItem('arca.videos.sort', sort), [sort])

  const folded = useMemo(() => new Map(videos.map((v) => [v.id, foldQuery(v.title)])), [videos])
  const list = useMemo(() => {
    const words = foldQuery(filter).split(' ').filter(Boolean)
    const out = words.length ? videos.filter((v) => words.every((w) => folded.get(v.id)!.includes(w))) : [...videos]
    const by: Record<Sort, (a: VideoItem, b: VideoItem) => number> = {
      new: (a, b) => (b.date ?? '').localeCompare(a.date ?? ''),
      old: (a, b) => (a.date ?? '9').localeCompare(b.date ?? '9'),
      long: (a, b) => (b.duration ?? 0) - (a.duration ?? 0),
      short: (a, b) => (a.duration ?? 0) - (b.duration ?? 0),
    }
    return out.sort(by[sort])
  }, [videos, folded, filter, sort])
  useEffect(() => setShown(PAGE), [filter, sort])

  // rolagem infinita: 1.300+ cards de uma vez pesariam (e carregariam thumbs à toa)
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((e) => e[0].isIntersecting && setShown((n) => n + PAGE), { rootMargin: '800px' })
    io.observe(el)
    return () => io.disconnect()
  }, [list.length])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <MagnifyingGlass className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar pelo título…" className="pl-9" />
        </div>
        <div className="w-44 shrink-0">
          <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="new">Mais novos</option>
            <option value="old">Mais antigos</option>
            <option value="long">Mais longos</option>
            <option value="short">Mais curtos</option>
          </Select>
        </div>
        <span className="text-xs text-fg-3 tabular-nums">{fmtNum(list.length)} vídeo(s)</span>
      </div>
      {!list.length && <Empty icon={<MagnifyingGlass className="size-6" />} title="Nenhum título com esse termo">Para achar o que é <b>falado</b> nos vídeos, use a aba “Buscar nas falas”.</Empty>}
      <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {list.slice(0, shown).map((v) => (
          <Link key={v.id} to={videoLink(v.id)} className="group min-w-0">
            <Thumb v={v} />
            <div className="mt-2.5 line-clamp-2 text-[14px] leading-snug font-semibold group-hover:text-gold">{v.title}</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-fg-3">
              <span>{fmtVideoDate(v.date)}</span>
              {!v.subLang && (
                <Badge tone="neutral" className="py-0 text-[10px]">
                  <SubtitlesSlash /> sem transcrição
                </Badge>
              )}
            </div>
          </Link>
        ))}
      </div>
      {shown < list.length && (
        <div ref={sentinel} className="flex justify-center py-6">
          <Spinner />
        </div>
      )}
    </div>
  )
}

function SpeechSearch() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const [input, setInput] = useState(q)
  useEffect(() => setInput(q), [q])
  const { data, isFetching } = useQuery({
    queryKey: ['videos-find', q],
    queryFn: () => api<VideoFind>(`/api/videos/find?q=${encodeURIComponent(q)}&per=5`),
    enabled: q.trim().length >= 2,
  })
  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (input.trim()) setParams({ aba: 'falas', q: input.trim() })
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <ClosedCaptioning className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
          <Input autoFocus value={input} onChange={(e) => setInput(e.target.value)} placeholder='O que foi dito? Ex.: "cão de guarda", hipoclorito, poço artesiano…' className="h-11 pl-9" />
        </div>
        <Button variant="primary" className="h-11" loading={isFetching}>
          Buscar
        </Button>
      </form>
      {!q && (
        <Empty icon={<ClosedCaptioning className="size-6" />} title="Ctrl+F em todas as falas">
          Procura o termo exato nas legendas de todos os vídeos (sem ligar para acento ou maiúscula) e abre o vídeo no segundo em que ele é dito.
        </Empty>
      )}
      {data && (
        <>
          <div className="text-xs text-fg-3">
            {fmtNum(data.total)} ocorrência(s) em {data.videos} vídeo(s) · {data.ms} ms
          </div>
          {data.mode === 'words' && (
            <Card className="border-gold/20 p-3 text-[13px] text-fg-2">
              A frase exata “{q}” não é dita em nenhum vídeo — mostrando vídeos que têm <b>todas as palavras</b>, mesmo separadas.
            </Card>
          )}
          {!data.hits.length && <Empty icon={<MagnifyingGlass className="size-6" />} title="Ninguém falou isso">Tente outra grafia ou um sinônimo. As legendas são automáticas e às vezes trocam palavras.</Empty>}
          <div className="space-y-3">
            {data.hits.map((h) => (
              <VideoHitCard key={h.id} h={h} q={q} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function Videos() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('aba') === 'falas' ? 'falas' : 'grade'
  const { data: videos, isLoading } = useQuery({ queryKey: ['videos'], queryFn: () => api<VideoItem[]>('/api/videos'), staleTime: 60_000 })
  const hours = (videos ?? []).reduce((s, v) => s + (v.duration ?? 0), 0) / 3600
  const channels = [...new Set((videos ?? []).map((v) => v.channelTitle.toLowerCase()))].map((c) => videos!.find((v) => v.channelTitle.toLowerCase() === c)!.channelTitle)
  return (
    <div>
      <PageHeader
        icon={<MonitorPlay weight="duotone" className="size-6" />}
        eyebrow="Conhecimento"
        title="Vídeos"
        subtitle={videos ? `${channels.join(', ') || 'Nenhum canal'} · ${fmtNum(videos.length)} vídeos · ${fmtNum(hours)} h — tudo offline, com transcrição pesquisável.` : 'Carregando…'}
        actions={
          <Tabs
            value={tab}
            onChange={(v) => setParams(v === 'falas' ? { aba: 'falas' } : {})}
            items={[
              { value: 'grade', label: 'Vídeos', icon: <MonitorPlay /> },
              { value: 'falas', label: 'Buscar nas falas', icon: <ClosedCaptioning /> },
            ]}
          />
        }
      />
      <div className="mx-auto max-w-[1500px] px-6 py-6 md:px-8">
        {tab === 'falas' ? (
          <div className="mx-auto max-w-4xl">
            <SpeechSearch />
          </div>
        ) : isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : videos?.length ? (
          <Grid videos={videos} />
        ) : (
          <Empty icon={<MonitorPlay className="size-6" />} title="Nenhum vídeo ainda">
            Coloque os vídeos em <code className="text-gold">data/youtube/&lt;canal&gt;/</code> (<code>&lt;id&gt;.mp4</code>, legendas <code>.vtt</code>, <code>thumbs/</code>, <code>meta/</code>). A Arca encontra sozinha em até 10 minutos.
          </Empty>
        )}
      </div>
    </div>
  )
}
