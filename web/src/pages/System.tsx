import { Books, Brain, CheckCircle, Cpu, Database, HardDrives, MapTrifold, WifiHigh, WifiSlash, XCircle } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Badge, Card, PageHeader, Stat } from '../components/ui'
import { api, fmtBytes, fmtNum } from '../lib/api'

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
