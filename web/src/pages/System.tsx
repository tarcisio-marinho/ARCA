import { Books, Brain, CheckCircle, Cpu, Database, HardDrives, MapTrifold, MonitorPlay, Pause, Play, WifiHigh, WifiSlash, XCircle } from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, PageHeader, Stat } from '../components/ui'
import { api, fmtBytes, fmtNum, put } from '../lib/api'

type VideoIndex = {
  videos: number
  transcribed: number
  hours: number
  chunks: number
  embedded: number
  pending: number
  running: boolean
  paused: boolean
  waitingLlm: boolean
  rate: number
  etaSeconds: number
  lastError: string | null
  scan: { running: boolean; done: number; total: number; lastScanAt: string | null }
  dbBytes: number
}

const fmtDur = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : s >= 60 ? `${Math.round(s / 60)} min` : `${s} s`)

function VideoIndexCard() {
  const qc = useQueryClient()
  const { data: v } = useQuery({ queryKey: ['videos-index'], queryFn: () => api<VideoIndex>('/api/videos/index'), refetchInterval: 5_000 })
  if (!v) return null
  const pct = v.chunks ? (v.embedded / v.chunks) * 100 : 0
  const state = v.scan.running
    ? { tone: 'info' as const, label: `lendo legendas ${v.scan.done}/${v.scan.total}` }
    : v.paused
      ? { tone: 'warn' as const, label: 'pausado' }
      : v.lastError
        ? { tone: 'err' as const, label: 'com erro' }
        : v.waitingLlm
          ? { tone: 'neutral' as const, label: 'esperando a IA terminar' }
          : v.pending
            ? { tone: 'gold' as const, label: 'indexando' }
            : { tone: 'ok' as const, label: 'em dia' }
  const toggle = async () => {
    await put('/api/videos/index', { paused: !v.paused })
    qc.invalidateQueries({ queryKey: ['videos-index'] })
  }
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-3">
        <MonitorPlay weight="duotone" className="size-5 text-gold" />
        <span className="font-semibold">Vídeos → IA (falas indexadas para o RAG)</span>
        <Badge tone={state.tone} dot>
          {state.label}
        </Badge>
        {(v.pending > 0 || v.paused) && (
          <Button size="sm" variant={v.paused ? 'primary' : 'dark'} className="ml-auto" onClick={toggle}>
            {v.paused ? <Play weight="fill" /> : <Pause weight="fill" />} {v.paused ? 'Retomar' : 'Pausar'}
          </Button>
        )}
      </div>
      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-base ring-1 ring-line-2">
        <div className="h-full rounded-full bg-gold-grad transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-[13px] text-fg-2">
        <span>
          <b className="text-fg">{fmtNum(v.embedded)}</b> de {fmtNum(v.chunks)} trechos com embedding ({fmtNum(pct, 1)}%)
        </span>
        <span>
          {v.pending > 0 && v.rate > 0 && !v.paused ? `${fmtNum(v.rate, 1)} trechos/s · faltam ~${fmtDur(v.etaSeconds)} com a máquina livre` : v.pending ? `${fmtNum(v.pending)} na fila` : 'busca semântica completa'}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[12.5px] text-fg-2 sm:grid-cols-4">
        <div>
          <div className="text-fg-3">Vídeos</div>
          <div className="font-semibold text-fg">{fmtNum(v.videos)}</div>
        </div>
        <div>
          <div className="text-fg-3">Com transcrição</div>
          <div className="font-semibold text-fg">
            {fmtNum(v.transcribed)} <span className="font-normal text-fg-3">({fmtNum(v.videos - v.transcribed)} sem)</span>
          </div>
        </div>
        <div>
          <div className="text-fg-3">Duração total</div>
          <div className="font-semibold text-fg">{fmtNum(v.hours)} h</div>
        </div>
        <div>
          <div className="text-fg-3">Banco (tudo)</div>
          <div className="font-semibold text-fg">{fmtBytes(v.dbBytes)}</div>
        </div>
      </div>
      {v.lastError && <div className="mt-3 rounded-lg border border-err/25 bg-err/10 px-3 py-2 text-[13px] text-err">{v.lastError}</div>}
      <p className="mt-3 text-xs text-fg-3">
        Roda em segundo plano, retoma de onde parou e pausa sozinho enquanto a IA está respondendo. A busca nas falas (Ctrl+F) e o full-text já funcionam antes de terminar; os embeddings melhoram as respostas da IA.
      </p>
    </Card>
  )
}

function Row({ ok, label, detail }: { ok: boolean | undefined; label: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-line/60 px-5 py-3 last:border-0">
      {ok ? <CheckCircle weight="fill" className="size-5 text-ok" /> : <XCircle weight="fill" className="size-5 text-err" />}
      <span className="font-medium">{label}</span>
      <span className="ml-auto text-right text-sm text-fg-2">{detail}</span>
    </div>
  )
}

export default function System() {
  const { data: s } = useQuery({ queryKey: ['status'], queryFn: () => api('/api/status'), refetchInterval: 15_000 })
  const st = s?.storage ?? {}
  return (
    <div>
      <PageHeader icon={<HardDrives weight="duotone" className="size-6" />} eyebrow="Tecnologia" title="Sistema" subtitle="Saúde dos serviços e uso de disco." />
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-6 md:px-8">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Enciclopédias" icon={<Books className="size-5" />} value={fmtBytes(st.zim ?? 0)} hint={s && `${s.kiwix.books} arquivos ZIM`} />
          <Stat label="Mapas" icon={<MapTrifold className="size-5" />} value={fmtBytes(st.maps ?? 0)} />
          <Stat label="PDFs + envios" icon={<Database className="size-5" />} value={fmtBytes((st.pdfs ?? 0) + (st.uploads ?? 0))} hint={s && `${fmtNum(s.kb.chunks)} trechos`} />
          <Stat label="Internet" icon={s?.internet ? <WifiHigh className="size-5" /> : <WifiSlash className="size-5" />} tone={s?.internet ? 'ok' : 'warn'} value={s ? (s.internet ? 'Online' : 'Offline') : '…'} hint="Só usada para Bitcoin" />
        </div>
        <Card>
          <Row ok={s?.llm?.ok} label="IA (llama.cpp)" detail={s?.llm?.ok ? `modelo ativo: ${s.llm.current}` : 'serviço llm fora do ar'} />
          <Row ok={s?.embed?.ok} label="Embeddings (busca semântica)" detail={s?.kb?.pendingEmbeddings ? `${fmtNum(s.kb.pendingEmbeddings)} trechos na fila` : 'em dia'} />
          <Row ok={s?.kiwix?.ok} label="Kiwix (enciclopédias)" detail={s ? `${s.kiwix.books} livros · ${fmtNum(s.kiwix.articles)} artigos` : ''} />
          <Row ok={!!s} label="Banco de dados (PostgreSQL + pgvector)" detail={s ? `${s.kb.docs} documentos` : ''} />
        </Card>
        <VideoIndexCard />
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2 font-semibold">
            <Brain weight="duotone" className="size-5 text-gold" /> Modelos disponíveis
          </div>
          <div className="flex flex-wrap gap-2">
            {s?.llm?.models?.map((m: string) => (
              <Badge key={m} tone={m === s.llm.current ? 'gold' : 'neutral'}>
                {m}
                {m === s.llm.current && ' · ativo'}
              </Badge>
            ))}
          </div>
          <p className="mt-3 text-sm text-fg-2">
            Para adicionar um modelo, coloque o arquivo <code className="text-gold">.gguf</code> em <code className="text-gold">data/models/chat/</code> — ele aparece aqui e no seletor da IA sem reiniciar nada.
          </p>
        </Card>
        <Card className="p-5 text-sm text-fg-2">
          <div className="mb-2 flex items-center gap-2 font-semibold text-fg">
            <Cpu weight="duotone" className="size-5 text-gold" /> Economia de energia
          </div>
          <ul className="list-disc space-y-1 pl-5">
            <li>A IA consome mais quando está gerando texto. Desligue “Pensar mais” para respostas mais rápidas.</li>
            <li>
              Pare os serviços quando não estiver usando: <code className="text-gold">docker compose stop llm</code> (guias, mapas e biblioteca continuam funcionando).
            </li>
            <li>Brilho de tela baixo e tema escuro economizam bateria de notebook.</li>
          </ul>
        </Card>
      </div>
    </div>
  )
}
