import { ArrowLeft, CaretDown, CaretUp, ClosedCaptioning, Crosshair, LinkSimple, MagnifyingGlass, Robot, SubtitlesSlash, X } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge, Button, cn, Empty, Spinner } from '../components/ui'
import { api, fmtNum } from '../lib/api'
import { fmtTime, fmtVideoDate, foldMap, foldQuery, segAt, type Seg, type VideoDetail } from '../lib/video'

type Range = [number, number, number] // início, fim (no texto original da fala), índice da ocorrência

/** Acha o termo na transcrição inteira (inclusive quando a frase cruza duas falas). */
function useTranscriptFind(segs: Seg[], term: string) {
  const index = useMemo(() => {
    const parts = segs.map((s) => foldMap(s[2]))
    const off: number[] = []
    let len = 0
    for (const p of parts) {
      off.push(len)
      len += p.folded.length + 1
    }
    return { parts, off, text: parts.map((p) => p.folded).join(' ') }
  }, [segs])
  return useMemo(() => {
    const needle = foldQuery(term)
    const ranges = new Map<number, Range[]>()
    const matches: number[] = [] // fala onde cada ocorrência começa
    if (needle.length < 2) return { ranges, matches }
    const { parts, off, text } = index
    const segOf = (pos: number) => {
      let lo = 0
      let hi = off.length - 1
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (off[mid] <= pos) lo = mid
        else hi = mid - 1
      }
      return lo
    }
    for (let p = text.indexOf(needle); p >= 0 && matches.length < 2000; p = text.indexOf(needle, p + needle.length)) {
      const a = segOf(p)
      const b = segOf(p + needle.length - 1)
      const m = matches.length
      matches.push(a)
      for (let k = a; k <= b; k++) {
        const fs = Math.max(p, off[k]) - off[k]
        const fe = Math.min(p + needle.length, off[k] + parts[k].folded.length) - off[k]
        if (fe <= fs) continue
        const map = parts[k].map
        const r: Range = [map[fs], map[fe - 1] + 1, m]
        ranges.set(k, [...(ranges.get(k) ?? []), r])
      }
    }
    return { ranges, matches }
  }, [index, term])
}

const Line = memo(function Line({ seg, i, active, ranges, current, onSeek }: { seg: Seg; i: number; active: boolean; ranges?: Range[]; current: number; onSeek: (t: number) => void }) {
  const text = seg[2]
  let body: React.ReactNode = text
  if (ranges?.length) {
    const out: React.ReactNode[] = []
    let last = 0
    for (const [a, b, m] of ranges) {
      if (a < last) continue
      out.push(text.slice(last, a))
      out.push(
        <mark key={`${a}-${m}`} className={cn('find-mark', m === current && 'find-current')}>
          {text.slice(a, b)}
        </mark>
      )
      last = b
    }
    out.push(text.slice(last))
    body = out
  }
  return (
    <button
      data-seg={i}
      onClick={() => onSeek(seg[0])}
      className={cn(
        'group flex w-full gap-3 rounded-lg px-2.5 py-1.5 text-left text-[13.5px] leading-relaxed transition',
        active ? 'bg-gold/10 text-fg ring-1 ring-gold/25' : 'text-fg-2 hover:bg-elevated hover:text-fg'
      )}
    >
      <span className={cn('w-12 shrink-0 pt-px text-right font-mono text-[11.5px] tabular-nums', active ? 'text-gold' : 'text-fg-3 group-hover:text-gold')}>{fmtTime(seg[0])}</span>
      <span className="min-w-0">{body}</span>
    </button>
  )
})

export default function VideoPlayer() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const tParam = params.get('t')
  const qParam = params.get('q') ?? ''
  const { data: v, isLoading, error } = useQuery({ queryKey: ['video', id], queryFn: () => api<VideoDetail>(`/api/videos/${encodeURIComponent(id)}`), staleTime: 5 * 60_000 })
  const segs = v?.segments ?? []

  const videoRef = useRef<HTMLVideoElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const findRef = useRef<HTMLInputElement>(null)
  const [active, setActive] = useState(-1)
  const [follow, setFollow] = useState(true)
  const [cc, setCc] = useState(() => localStorage.getItem('arca.videos.cc') === '1')
  const [term, setTerm] = useState(qParam)
  const [cur, setCur] = useState(0)
  const [descOpen, setDescOpen] = useState(false)
  const manualScroll = useRef(0)

  useEffect(() => setTerm(qParam), [qParam])
  const { ranges, matches } = useTranscriptFind(segs, term)

  // ?t=… → abre já no ponto (e quando um link novo do mesmo vídeo muda o t)
  useEffect(() => {
    const el = videoRef.current
    if (!el || !v) return
    const t = tParam ? Number(tParam) : NaN
    const go = () => {
      if (Number.isFinite(t) && t > 0) el.currentTime = Math.min(t, (el.duration || t + 1) - 0.5)
      el.play().catch(() => {}) // autoplay pode ser bloqueado; aí é só dar play
    }
    if (el.readyState >= 1) go()
    else {
      el.addEventListener('loadedmetadata', go, { once: true })
      return () => el.removeEventListener('loadedmetadata', go)
    }
  }, [v, tParam])

  // ocorrência inicial: a primeira a partir do t da URL
  useEffect(() => {
    if (!matches.length) return setCur(0)
    const t = tParam ? Number(tParam) : 0
    const k = matches.findIndex((s) => segs[s][0] >= t - 2)
    setCur(k >= 0 ? k : 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches])

  // legenda sobre o vídeo
  useEffect(() => {
    localStorage.setItem('arca.videos.cc', cc ? '1' : '0')
    const tr = videoRef.current?.textTracks?.[0]
    if (tr) tr.mode = cc ? 'showing' : 'hidden'
  }, [cc, v])

  const onTime = useCallback(() => {
    const el = videoRef.current
    if (el) setActive(segAt(segs, el.currentTime + 0.15))
  }, [segs])

  const scrollTo = useCallback((i: number, smooth = true) => {
    const box = listRef.current
    const row = box?.querySelector<HTMLElement>(`[data-seg="${i}"]`)
    if (!box || !row) return
    box.scrollTo({ top: row.offsetTop - box.clientHeight / 2 + row.clientHeight / 2, behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  // transcrição já posicionada no ?t= (antes mesmo do vídeo carregar/tocar)
  useEffect(() => {
    if (!segs.length) return
    const k = segAt(segs, tParam ? Number(tParam) + 0.15 : 0)
    if (k < 0) return
    setActive(k)
    requestAnimationFrame(() => scrollTo(k, false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segs, tParam])

  // a transcrição acompanha o vídeo, a não ser que o usuário tenha rolado na mão há pouco
  useEffect(() => {
    if (active < 0 || !follow || Date.now() - manualScroll.current < 6000) return
    scrollTo(active)
  }, [active, follow, scrollTo])

  const seek = useCallback((t: number, play = true) => {
    const el = videoRef.current
    if (!el) return
    el.currentTime = t
    if (play) el.play().catch(() => {})
    manualScroll.current = 0
    setFollow(true)
  }, [])

  const jumped = useRef(false)
  useEffect(() => {
    jumped.current = false
  }, [term])
  const goMatch = (k: number) => {
    if (!matches.length) return
    const n = (k + matches.length) % matches.length
    jumped.current = true
    setCur(n)
    scrollTo(matches[n])
    seek(segs[matches[n]][0])
  }

  // ⌘F / Ctrl+F nesta tela procura na transcrição (apertar de novo com a caixa já focada abre o do navegador)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f' && document.activeElement !== findRef.current && segs.length) {
        e.preventDefault()
        findRef.current?.focus()
        findRef.current?.select()
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [segs.length])

  const copyLink = async () => {
    const t = Math.floor(videoRef.current?.currentTime ?? 0)
    const url = `${location.origin}/videos/${encodeURIComponent(id)}${t ? `?t=${t}` : ''}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success(`Link copiado (abre em ${fmtTime(t)})`)
    } catch {
      toast(url)
    }
  }

  if (isLoading)
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    )
  if (error || !v)
    return (
      <Empty icon={<SubtitlesSlash className="size-6" />} title="Vídeo não encontrado">
        <Link to="/videos" className="text-gold underline">
          Voltar para os vídeos
        </Link>
      </Empty>
    )

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2">
        <Button size="sm" variant="ghost" onClick={() => (history.length > 1 ? nav(-1) : nav('/videos'))}>
          <ArrowLeft /> Voltar
        </Button>
        <Link to="/videos" className="text-[13px] text-fg-3 hover:text-gold">
          Vídeos
        </Link>
        <span className="text-fg-3">/</span>
        <span className="min-w-0 truncate text-[13px] font-semibold">{v.title}</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        {/* vídeo + informações */}
        <div className="min-w-0 flex-1 lg:overflow-y-auto">
          <div className="mx-auto max-w-[1100px] p-4 md:p-6">
            <div className="overflow-hidden rounded-2xl border border-line bg-black">
              <video
                key={v.id}
                ref={videoRef}
                src={v.src}
                poster={v.thumb ?? undefined}
                controls
                preload="metadata"
                playsInline
                onTimeUpdate={onTime}
                onSeeked={onTime}
                className="aspect-video w-full bg-black"
              >
                {segs.length > 0 && <track kind="subtitles" srcLang="pt" label="Português (automática)" src={`/api/videos/${encodeURIComponent(v.id)}/captions.vtt`} default={cc} />}
              </video>
            </div>
            <h1 className="mt-4 font-display text-[22px] leading-tight font-bold tracking-[-0.02em]">{v.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-fg-2">
              <span className="font-semibold text-fg">{v.channelTitle}</span>
              <span className="text-fg-3">·</span>
              <span>{fmtVideoDate(v.date)}</span>
              {v.duration != null && (
                <>
                  <span className="text-fg-3">·</span>
                  <span>{fmtTime(v.duration)}</span>
                </>
              )}
              {!segs.length && (
                <Badge tone="neutral">
                  <SubtitlesSlash /> sem transcrição
                </Badge>
              )}
              <div className="ml-auto flex flex-wrap gap-2">
                {segs.length > 0 && (
                  <Button size="sm" variant={cc ? 'secondary' : 'dark'} onClick={() => setCc(!cc)} title="Legenda sobre o vídeo">
                    <ClosedCaptioning weight={cc ? 'fill' : 'regular'} /> Legenda {cc ? 'ligada' : 'desligada'}
                  </Button>
                )}
                <Button size="sm" onClick={copyLink} title="Copia um link que abre o vídeo no ponto atual">
                  <LinkSimple /> Link neste momento
                </Button>
                {segs.length > 0 && (
                  <Button size="sm" variant="secondary" onClick={() => nav(`/ia?q=${encodeURIComponent(`Sobre o vídeo "${v.title}": `)}`)}>
                    <Robot /> Perguntar à IA
                  </Button>
                )}
              </div>
            </div>
            {v.description && (
              <div className="mt-4 rounded-2xl border border-line bg-surface p-4 text-[13.5px] leading-relaxed text-fg-2">
                <div className={cn('break-words whitespace-pre-wrap', !descOpen && 'line-clamp-3')}>{v.description}</div>
                <button onClick={() => setDescOpen(!descOpen)} className="mt-2 text-xs font-semibold text-fg-3 hover:text-gold">
                  {descOpen ? 'Mostrar menos' : 'Mostrar mais'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* transcrição */}
        <aside className="flex h-[70vh] shrink-0 flex-col border-t border-line bg-[#0c0c0c] lg:h-auto lg:w-[430px] lg:border-t-0 lg:border-l">
          <div className="space-y-2 border-b border-line p-3">
            <div className="flex items-center justify-between">
              <span className="font-display font-bold">Transcrição</span>
              <span className="text-[11px] text-fg-3">{segs.length ? `${fmtNum(v.words)} palavras · legenda automática` : ''}</span>
            </div>
            {segs.length > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <MagnifyingGlass className="absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" />
                  <input
                    ref={findRef}
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        // 1º Enter vai para a ocorrência atual; os seguintes avançam (Shift volta)
                        goMatch(jumped.current ? cur + (e.shiftKey ? -1 : 1) : cur)
                      }
                      if (e.key === 'Escape') {
                        setTerm('')
                        findRef.current?.blur()
                      }
                    }}
                    placeholder="Achar nas falas (⌘F)…"
                    className="h-9 w-full rounded-[10px] border border-line-2 bg-base pr-2 pl-8 text-[13px] outline-none placeholder:text-fg-3 focus:border-gold/50 focus:ring-2 focus:ring-gold/15"
                  />
                </div>
                <span className="w-16 text-center text-[11.5px] text-fg-3 tabular-nums">{term.trim().length >= 2 ? (matches.length ? `${cur + 1} de ${matches.length}` : 'nada') : ''}</span>
                <button disabled={!matches.length} onClick={() => goMatch(cur - 1)} className="rounded p-1.5 text-fg-2 hover:bg-overlay hover:text-fg disabled:opacity-30" title="Anterior (Shift+Enter)">
                  <CaretUp />
                </button>
                <button disabled={!matches.length} onClick={() => goMatch(cur + 1)} className="rounded p-1.5 text-fg-2 hover:bg-overlay hover:text-fg disabled:opacity-30" title="Próxima (Enter)">
                  <CaretDown />
                </button>
                {term && (
                  <button onClick={() => setTerm('')} className="rounded p-1.5 text-fg-3 hover:bg-overlay hover:text-fg" title="Limpar (Esc)">
                    <X />
                  </button>
                )}
              </div>
            )}
          </div>
          <div
            ref={listRef}
            onWheel={() => (manualScroll.current = Date.now())}
            onTouchMove={() => (manualScroll.current = Date.now())}
            className="relative min-h-0 flex-1 overflow-y-auto p-2"
          >
            {segs.length ? (
              segs.map((s, i) => <Line key={i} seg={s} i={i} active={i === active} ranges={ranges.get(i)} current={cur} onSeek={seek} />)
            ) : (
              <Empty icon={<SubtitlesSlash className="size-6" />} title="Sem transcrição">
                O YouTube não tinha legenda em português para este vídeo. Ele toca normalmente, mas não aparece na busca nas falas nem nas respostas da IA.
              </Empty>
            )}
          </div>
          {segs.length > 0 && active >= 0 && (
            <div className="border-t border-line p-2">
              <Button
                size="sm"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  manualScroll.current = 0
                  setFollow(true)
                  scrollTo(active)
                }}
              >
                <Crosshair /> Ir para a fala atual ({fmtTime(segs[active][0])})
              </Button>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
