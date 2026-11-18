import {
  ArrowRight,
  Backpack,
  Books,
  Drop,
  FirstAidKit,
  ForkKnife,
  Lightning,
  MagnifyingGlass,
  MapTrifold,
  Pill,
  Radio,
  Robot,
  Sparkle,
  Virus,
  type Icon,
} from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge, Card, cn } from '../components/ui'
import { api, fmtBytes, fmtNum } from '../lib/api'

const PROTOCOLS: { slug: string; title: string; desc: string; icon: Icon; tone: string }[] = [
  { slug: 'primeiros-socorros', title: 'Primeiros socorros', desc: 'RCP, hemorragia, queimadura, engasgo', icon: FirstAidKit, tone: 'text-err' },
  { slug: 'tratamento-de-agua', title: 'Água potável', desc: 'Ferver, clorar, filtrar, SODIS', icon: Drop, tone: 'text-info' },
  { slug: 'remedios-essenciais', title: 'Remédios', desc: 'Doses, máximo diário, validade', icon: Pill, tone: 'text-ok' },
  { slug: 'doencas-e-tratamento', title: 'Doenças', desc: 'Diarreia, dengue, infecções', icon: Virus, tone: 'text-warn' },
  { slug: 'alimentacao-e-racionamento', title: 'Comida', desc: 'Racionamento e estoque 30 dias', icon: ForkKnife, tone: 'text-gold' },
  { slug: 'energia-e-iluminacao', title: 'Energia', desc: 'Bateria, inversor, solar', icon: Lightning, tone: 'text-gold-light' },
  { slug: 'comunicacao-de-emergencia', title: 'Comunicação', desc: 'Rádio, PX canal 9, Morse', icon: Radio, tone: 'text-info' },
  { slug: 'plano-30-dias', title: 'Plano 30 dias', desc: 'O que fazer, dia a dia', icon: Backpack, tone: 'text-fg-2' },
]

function greeting() {
  const h = new Date().getHours()
  return h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

export default function Home() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const { data: st } = useQuery({ queryKey: ['status'], queryFn: () => api('/api/status'), refetchInterval: 30_000 })
  const { data: sup } = useQuery({ queryKey: ['supplies-summary'], queryFn: () => api('/api/supplies/summary') })
  const days = sup ? Math.min(sup.water.days || 0, sup.food.days || 0) : null

  return (
    <div className="pb-12">
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-line bg-[#080808]">
        <div className="hero-dots absolute inset-0" />
        <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[680px] -translate-x-1/2 rounded-full bg-gold/10 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-6 pt-12 pb-10 md:px-8">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={st?.internet ? 'ok' : 'neutral'} dot>
              {st ? (st.internet ? 'Internet disponível' : 'Modo offline') : 'verificando…'}
            </Badge>
            <Badge tone={st?.llm?.ok ? 'gold' : 'err'} dot>
              IA {st?.llm?.ok ? 'pronta' : 'indisponível'}
            </Badge>
            <span className="text-xs text-fg-3">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          </div>
          <h1 className="mt-5 font-display text-4xl leading-[1.05] font-extrabold tracking-[-0.04em] md:text-[56px]">
            {greeting()}. <span className="text-gold-grad">Estamos preparados.</span>
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] text-fg-2">
            Todo o conhecimento, mapas e ferramentas de que você precisa — rodando nesta máquina, sem energia da rua e sem internet.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (q.trim()) nav(`/ia?q=${encodeURIComponent(q.trim())}`)
            }}
            className="mt-7 flex max-w-2xl items-center gap-2 rounded-2xl border border-line-2 bg-surface/90 p-2 pl-4 shadow-2xl backdrop-blur focus-within:border-gold/50"
          >
            <Sparkle weight="fill" className="size-5 shrink-0 text-gold" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Pergunte qualquer coisa: “como tratar uma queimadura de 2º grau?”"
              className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-fg-3"
            />
            <button className="bg-gold-grad flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold text-gold-ink hover:glow-gold">
              Perguntar <ArrowRight weight="bold" />
            </button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {['Dose de paracetamol para criança de 15 kg', 'Quanto de água sanitária por litro?', 'Como fazer soro caseiro?', 'Sinais de dengue grave'].map((s) => (
              <button key={s} onClick={() => nav(`/ia?q=${encodeURIComponent(s)}`)} className="rounded-full border border-line-2 bg-base/60 px-3 py-1 text-fg-2 hover:border-gold/40 hover:text-fg">
                {s}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-8 px-6 pt-8 md:px-8">
        {/* NÚMEROS */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Link to="/suprimentos">
            <Card gold className="h-full p-5 transition hover:border-gold/40">
              <div className="text-[11px] font-semibold tracking-[0.12em] text-fg-3 uppercase">Autonomia estimada</div>
              <div className="mt-2 font-display text-[32px] leading-none font-bold">
                {days === null ? '—' : <span className="text-gold-grad">{fmtNum(days, 0)} dias</span>}
              </div>
              <div className="mt-2 text-xs text-fg-2">
                {sup ? `água ${fmtNum(sup.water.days, 0)} d · comida ${fmtNum(sup.food.days, 0)} d` : 'cadastre seus suprimentos'}
              </div>
            </Card>
          </Link>
          <Link to="/biblioteca">
            <Card className="h-full p-5 transition hover:border-line-3">
              <div className="text-[11px] font-semibold tracking-[0.12em] text-fg-3 uppercase">Enciclopédias</div>
              <div className="mt-2 font-display text-[32px] leading-none font-bold">{st ? fmtNum(st.kiwix.books) : '—'}</div>
              <div className="mt-2 text-xs text-fg-2">{st ? `${fmtNum(st.kiwix.articles)} artigos · ${fmtBytes(st.storage.zim)}` : '…'}</div>
            </Card>
          </Link>
          <Link to="/documentos">
            <Card className="h-full p-5 transition hover:border-line-3">
              <div className="text-[11px] font-semibold tracking-[0.12em] text-fg-3 uppercase">Guias & PDFs</div>
              <div className="mt-2 font-display text-[32px] leading-none font-bold">{st ? fmtNum(st.kb.docs) : '—'}</div>
              <div className="mt-2 text-xs text-fg-2">{st ? `${fmtNum(st.kb.chunks)} trechos indexados p/ IA` : '…'}</div>
            </Card>
          </Link>
          <Link to="/mapas">
            <Card className="h-full p-5 transition hover:border-line-3">
              <div className="text-[11px] font-semibold tracking-[0.12em] text-fg-3 uppercase">Mapas offline</div>
              <div className="mt-2 font-display text-[32px] leading-none font-bold">{st ? fmtBytes(st.storage.maps) : '—'}</div>
              <div className="mt-2 text-xs text-fg-2">Brasil detalhado até nível de rua</div>
            </Card>
          </Link>
        </div>

        {/* PROTOCOLOS */}
        <section>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <div className="text-[11px] font-semibold tracking-[0.14em] text-gold uppercase">Acesso rápido</div>
              <h2 className="font-display text-xl font-bold tracking-tight">Protocolos de emergência</h2>
            </div>
            <Link to="/guias" className="flex items-center gap-1 text-sm text-fg-2 hover:text-gold">
              Todos os guias <ArrowRight />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {PROTOCOLS.map((p) => (
              <Link key={p.slug} to={`/guias/${p.slug}`}>
                <Card className="group h-full p-4 transition hover:-translate-y-0.5 hover:border-line-3 hover:bg-elevated">
                  <p.icon weight="duotone" className={cn('size-7', p.tone)} />
                  <div className="mt-3 font-semibold">{p.title}</div>
                  <div className="mt-0.5 text-xs text-fg-3">{p.desc}</div>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        {/* ATALHOS */}
        <section className="grid gap-3 md:grid-cols-3">
          {[
            { to: '/ia', icon: Robot, title: 'Conversar com a IA', desc: 'Responde citando o acervo. No modo Agente, escreve e roda código.' },
            { to: '/biblioteca', icon: Books, title: 'Explorar a biblioteca', desc: 'Wikipédia, MedlinePlus, CDC, culinária, reparos e mais.' },
            { to: '/mapas', icon: MapTrifold, title: 'Abrir o mapa', desc: 'Marque fontes de água, abrigos e pontos de encontro.' },
          ].map((a) => (
            <Link key={a.to} to={a.to}>
              <Card className="group flex h-full items-start gap-4 p-5 transition hover:border-gold/30">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-gold/20 bg-gold-subtle text-gold">
                  <a.icon weight="duotone" className="size-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1 font-semibold">
                    {a.title} <ArrowRight className="text-fg-3 transition group-hover:translate-x-0.5 group-hover:text-gold" />
                  </div>
                  <div className="mt-1 text-sm text-fg-2">{a.desc}</div>
                </div>
              </Card>
            </Link>
          ))}
        </section>

        {sup?.expiringSoon?.length > 0 && (
          <Card className="border-warn/25 p-5">
            <div className="flex items-center gap-2 font-semibold text-warn">
              <MagnifyingGlass /> Vencendo nos próximos 30 dias
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {sup.expiringSoon.map((x: any) => (
                <Badge key={x.name} tone="warn">
                  {x.name} · {new Date(x.expiresAt).toLocaleDateString('pt-BR')}
                </Badge>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
