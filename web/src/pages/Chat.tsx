import {
  ArrowUp,
  Brain,
  CaretDown,
  CheckCircle,
  Code,
  FileText,
  Globe,
  MagnifyingGlass,
  MonitorPlay,
  PencilSimple,
  Plus,
  Robot,
  Sparkle,
  Stop,
  Terminal,
  Trash,
  WarningCircle,
  Wrench,
  XCircle,
  type Icon,
} from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Markdown } from '../components/Markdown'
import { Badge, Button, cn, Modal, Select } from '../components/ui'
import { api, del, post, put, sse, timeAgo } from '../lib/api'

type Source = { ref: string; kind: 'doc' | 'wiki' | 'video'; title: string; subtitle?: string; url: string; t?: number }
type ToolRun = { id: string; name: string; args: any; result?: string; ok?: boolean }
type Msg = { id: number | string; role: 'user' | 'assistant'; content: string; meta?: { sources?: Source[]; tools?: { name: string; args: any; result: string }[]; think?: string }; live?: boolean; tools?: ToolRun[]; think?: string; error?: string }
type Mode = 'assistant' | 'agent'

const TOOL_META: Record<string, { label: string; icon: Icon }> = {
  search_knowledge: { label: 'Buscando no acervo', icon: MagnifyingGlass },
  read_article: { label: 'Lendo artigo', icon: Globe },
  read_document: { label: 'Lendo documento', icon: FileText },
  toolkit: { label: 'Ferramenta', icon: Wrench },
  bitcoin_inspect: { label: 'Bitcoin', icon: Code },
  list_files: { label: 'Listando arquivos', icon: FileText },
  read_file: { label: 'Lendo arquivo', icon: FileText },
  write_file: { label: 'Escrevendo arquivo', icon: PencilSimple },
  edit_file: { label: 'Editando arquivo', icon: PencilSimple },
  search_files: { label: 'Procurando no código', icon: MagnifyingGlass },
  run_command: { label: 'Executando', icon: Terminal },
}

function argSummary(name: string, a: any) {
  if (!a) return ''
  if (name === 'search_knowledge') return [a.query, a.query_en].filter(Boolean).join(' · ')
  if (name === 'run_command') return a.command
  if (name === 'toolkit') return `${a.op}${a.input ? ` — ${String(a.input).slice(0, 60)}` : ''}`
  return a.path ?? a.ref ?? a.action ?? ''
}

function ToolCard({ t }: { t: ToolRun }) {
  const [open, setOpen] = useState(false)
  const m = TOOL_META[t.name] ?? { label: t.name, icon: Wrench }
  const running = t.result === undefined
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-base">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-[#121212]">
        <m.icon weight="duotone" className={cn('size-4 shrink-0', running ? 'animate-pulse text-gold' : t.ok === false ? 'text-err' : 'text-fg-3')} />
        <span className="font-semibold text-fg-2">{m.label}</span>
        <span className={cn('min-w-0 flex-1 truncate text-fg-3', t.name === 'run_command' && 'font-mono text-[12px]')}>{argSummary(t.name, t.args)}</span>
        {running ? <span className="text-[11px] text-gold">rodando…</span> : t.ok === false ? <XCircle className="text-err" /> : <CheckCircle className="text-ok" />}
        <CaretDown className={cn('shrink-0 text-fg-3 transition', open && 'rotate-180')} />
      </button>
      {open && t.result !== undefined && (
        <pre className="max-h-80 overflow-auto border-t border-line bg-[#0b0b0b] px-3 py-2.5 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-fg-2">{t.result}</pre>
      )}
    </div>
  )
}

function Think({ text, live }: { text: string; live?: boolean }) {
  const [open, setOpen] = useState(false)
  if (!text.trim()) return null
  return (
    <div className="rounded-xl border border-line bg-base/60">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-fg-3 hover:text-fg-2">
        <Brain weight="duotone" className={cn('size-4', live && 'animate-pulse text-gold')} />
        {live ? 'Raciocinando…' : 'Raciocínio'}
        <CaretDown className={cn('ml-auto transition', open && 'rotate-180')} />
      </button>
      {open && <div className="max-h-72 overflow-auto border-t border-line px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap text-fg-3">{text}</div>}
    </div>
  )
}

function Sources({ sources, onOpen }: { sources: Source[]; onOpen: (s: Source) => void }) {
  if (!sources?.length) return null
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {sources.map((s) => (
        <button
          key={s.ref}
          onClick={() => onOpen(s)}
          className="group flex max-w-[280px] items-center gap-1.5 rounded-lg border border-line-2 bg-base px-2 py-1 text-left text-[12px] hover:border-gold/40"
        >
          <span className="rounded bg-gold/10 px-1 text-[10.5px] font-bold text-gold">{s.ref}</span>
          {s.kind === 'video' ? <MonitorPlay className="shrink-0 text-gold" /> : s.kind === 'doc' ? <FileText className="shrink-0 text-fg-3" /> : <Globe className="shrink-0 text-fg-3" />}
          <span className="truncate text-fg-2 group-hover:text-fg">{s.title}</span>
          {s.subtitle && <span className="hidden truncate text-fg-3 sm:inline">· {s.subtitle}</span>}
        </button>
      ))}
    </div>
  )
}

export default function Chat() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem('arca.mode') as Mode) || 'assistant')
  const [think, setThink] = useState(() => localStorage.getItem('arca.think') === '1')
  const [input, setInput] = useState('')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [busy, setBusy] = useState(false)
  const [viewer, setViewer] = useState<Source | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    localStorage.setItem('arca.mode', mode)
  }, [mode])
  useEffect(() => {
    localStorage.setItem('arca.think', think ? '1' : '0')
  }, [think])

  const { data: convs } = useQuery({ queryKey: ['convs'], queryFn: () => api<any[]>('/api/chat/conversations') })
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api('/api/settings') })
  const { data: status } = useQuery({ queryKey: ['status'], queryFn: () => api('/api/status') })

  // carrega histórico ao trocar de conversa (sem sobrescrever stream em andamento)
  useEffect(() => {
    if (!id) {
      setMsgs([])
      return
    }
    if (busy) return
    api<Msg[]>(`/api/chat/conversations/${id}/messages`).then(setMsgs).catch(() => setMsgs([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [msgs])

  const send = useCallback(
    async (text: string) => {
      text = text.trim()
      if (!text || busy) return
      setBusy(true)
      setInput('')
      let convId = id
      if (!convId) {
        const c = await post('/api/chat/conversations', { mode })
        convId = c.id
        nav(`/ia/${convId}`, { replace: true })
      }
      const liveId = `live-${Date.now()}`
      setMsgs((m) => [...m, { id: `u-${Date.now()}`, role: 'user', content: text }, { id: liveId, role: 'assistant', content: '', live: true, tools: [], think: '' }])
      const patch = (fn: (m: Msg) => Msg) => setMsgs((all) => all.map((m) => (m.id === liveId ? fn(m) : m)))
      const ac = new AbortController()
      abortRef.current = ac
      let finished = false
      try {
        await sse(
          `/api/chat/conversations/${convId}/send`,
          { content: text, mode, think },
          (e) => {
            if (e.type === 'text') patch((m) => ({ ...m, content: m.content + e.text }))
            else if (e.type === 'think') patch((m) => ({ ...m, think: (m.think ?? '') + e.text }))
            else if (e.type === 'tool_start') patch((m) => ({ ...m, tools: [...(m.tools ?? []), { id: e.id, name: e.name, args: e.args }] }))
            else if (e.type === 'tool_end') patch((m) => ({ ...m, tools: (m.tools ?? []).map((t) => (t.id === e.id ? { ...t, result: e.result, ok: e.ok } : t)) }))
            else if (e.type === 'sources') patch((m) => ({ ...m, meta: { ...(m.meta ?? {}), sources: e.sources } }))
            else if (e.type === 'error') patch((m) => ({ ...m, error: e.message }))
            else if (e.type === 'done') {
              finished = true
              patch((m) => ({ ...m, live: false, id: e.messageId }))
            }
          },
          ac.signal
        )
      } catch (e) {
        if (!ac.signal.aborted) patch((m) => ({ ...m, error: (e as Error).message }))
      } finally {
        patch((m) => ({ ...m, live: false }))
        // recarrega a versão salva (citações de vídeo normalizadas para [V1 12:34] com o tempo certo)
        if (finished && convId) api<Msg[]>(`/api/chat/conversations/${convId}/messages`).then(setMsgs).catch(() => {})
        setBusy(false)
        abortRef.current = null
        qc.invalidateQueries({ queryKey: ['convs'] })
        taRef.current?.focus()
      }
    },
    [busy, id, mode, think, nav, qc]
  )

  // ?q= vindo da Home/guias: inicia conversa nova já perguntando
  useEffect(() => {
    const q = params.get('q')
    if (q && !busy) {
      setParams({}, { replace: true })
      if (q.endsWith(': ')) setInput(q)
      else send(q)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openSource = (s: Source) => {
    if (s.kind === 'doc' || s.kind === 'video') nav(s.url)
    else setViewer(s)
  }
  const openRef = (ref: string, m: Msg) => {
    const s = m.meta?.sources?.find((x) => x.ref === ref)
    if (s) openSource(s)
  }

  const models: string[] = status?.llm?.models ?? []

  return (
    <div className="flex h-full">
      {/* conversas */}
      <aside className="hidden w-[270px] shrink-0 flex-col border-r border-line bg-[#0c0c0c] lg:flex">
        <div className="p-3">
          <Button variant="primary" className="w-full" onClick={() => nav('/ia')}>
            <Plus weight="bold" /> Nova conversa
          </Button>
        </div>
        <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {convs?.map((c) => (
            <div
              key={c.id}
              onClick={() => nav(`/ia/${c.id}`)}
              className={cn('group flex cursor-pointer items-center gap-2 rounded-[10px] px-2.5 py-2', c.id === id ? 'bg-elevated ring-1 ring-line-2' : 'hover:bg-[#151515]')}
            >
              {c.mode === 'agent' ? <Terminal className="shrink-0 text-gold" /> : <Sparkle className="shrink-0 text-fg-3" />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] text-fg">{c.title}</div>
                <div className="text-[11px] text-fg-3">{timeAgo(c.updatedAt)}</div>
              </div>
              <button
                onClick={async (e) => {
                  e.stopPropagation()
                  await del(`/api/chat/conversations/${c.id}`)
                  qc.invalidateQueries({ queryKey: ['convs'] })
                  if (c.id === id) nav('/ia')
                }}
                className="hidden rounded p-1 text-fg-3 group-hover:block hover:text-err"
              >
                <Trash />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* conversa atual */}
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-line px-4 py-2.5 md:px-6">
          <Robot weight="duotone" className="size-5 text-gold" />
          <span className="font-display font-bold">IA Arca</span>
          <Badge tone={status?.llm?.ok ? 'ok' : 'err'} dot>
            {status?.llm?.ok ? 'offline · local' : 'modelo fora do ar'}
          </Badge>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="ghost" className="lg:hidden" onClick={() => nav('/ia')}>
              <Plus /> Nova
            </Button>
            {models.length > 0 && (
              <Select
                value={settings?.chatModel}
                onChange={async (e) => {
                  await put('/api/settings', { chatModel: e.target.value })
                  qc.invalidateQueries({ queryKey: ['settings'] })
                  toast.success('Modelo trocado — o primeiro uso carrega o modelo na memória')
                }}
                className="h-8 w-auto max-w-[220px] text-xs"
              >
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {msgs.length === 0 ? (
            <div className="mx-auto flex max-w-2xl flex-col items-center px-6 pt-20 text-center">
              <div className="brand-mark flex size-14 items-center justify-center rounded-2xl bg-gold-grad text-gold-ink">
                {mode === 'agent' ? <Terminal weight="bold" className="size-7" /> : <Sparkle weight="fill" className="size-7" />}
              </div>
              <h2 className="mt-5 font-display text-3xl font-extrabold tracking-[-0.03em]">{mode === 'agent' ? 'Agente dev' : 'Como posso ajudar?'}</h2>
              <p className="mt-2 text-fg-2">
                {mode === 'agent'
                  ? 'Eu leio, escrevo e executo código no workspace (data/workspace). Peça um script, um fix ou uma análise.'
                  : 'Respondo consultando os guias, PDFs e enciclopédias offline — e cito as fontes.'}
              </p>
              <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
                {(mode === 'agent'
                  ? ['Crie um script Python que calcule a autonomia de uma bateria de 60Ah com inversor', 'Liste os arquivos do workspace e explique o projeto', 'Escreva um servidor HTTP mínimo em Node e teste com curl', 'Gere um par de chaves Ed25519 e assine "teste"']
                  : ['Como tratar diarreia em criança sem farmácia?', 'Quanto de água sanitária para 20 litros?', 'Picada de escorpião: o que fazer?', 'Como conservar carne sem geladeira?']
                ).map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-xl border border-line bg-surface p-3 text-left text-[13px] text-fg-2 hover:border-gold/30 hover:text-fg">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-6">
              {msgs.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md border border-gold/15 bg-gold-subtle px-4 py-2.5 text-[15px] whitespace-pre-wrap">{m.content}</div>
                  </div>
                ) : (
                  <div key={m.id} className="flex gap-3">
                    <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-gold-grad text-gold-ink">
                      <Sparkle weight="fill" className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <Think text={m.think ?? m.meta?.think ?? ''} live={m.live && !m.content} />
                      {(m.tools ?? m.meta?.tools?.map((t, i) => ({ ...t, id: String(i), ok: !t.result?.startsWith('ERRO') })) ?? []).map((t) => (
                        <ToolCard key={t.id} t={t} />
                      ))}
                      {m.content ? (
                        <div className={cn(m.live && 'caret')}>
                          <Markdown onCite={(r) => openRef(r, m)}>{m.content}</Markdown>
                        </div>
                      ) : (
                        m.live && !(m.tools ?? []).some((t) => t.result === undefined) && <div className="caret text-sm text-fg-3">pensando</div>
                      )}
                      {m.error && (
                        <div className="flex items-start gap-2 rounded-xl border border-err/25 bg-err/10 px-3 py-2 text-sm text-err">
                          <WarningCircle className="mt-0.5 shrink-0" /> {m.error}
                        </div>
                      )}
                      {!m.live && <Sources sources={m.meta?.sources ?? []} onOpen={openSource} />}
                    </div>
                  </div>
                )
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {/* composer */}
        <div className="border-t border-line bg-[#0c0c0c] px-4 py-3 md:px-6">
          <div className="mx-auto max-w-3xl">
            <div className="rounded-2xl border border-line-2 bg-surface p-2 focus-within:border-gold/40">
              <textarea
                ref={taRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send(input)
                  }
                }}
                rows={Math.min(8, Math.max(2, input.split('\n').length))}
                placeholder={mode === 'agent' ? 'Descreva a tarefa de código…' : 'Pergunte sobre saúde, água, comida, reparos…'}
                className="w-full resize-none bg-transparent px-2 py-1.5 text-[15px] outline-none placeholder:text-fg-3"
              />
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-lg border border-line bg-base p-0.5">
                  {(
                    [
                      ['assistant', 'Assistente', Sparkle],
                      ['agent', 'Agente dev', Terminal],
                    ] as const
                  ).map(([v, l, I]) => (
                    <button
                      key={v}
                      onClick={() => {
                        setMode(v)
                        if (v === 'agent') setThink(true) // código/contas: raciocínio evita erros bobos (ex.: Ah × V)
                      }}
                      className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold', mode === v ? 'bg-elevated text-gold ring-1 ring-line-2' : 'text-fg-3 hover:text-fg-2')}
                    >
                      <I weight={mode === v ? 'fill' : 'regular'} /> {l}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setThink(!think)}
                  title="Raciocínio estendido: respostas melhores em problemas difíceis, porém mais lentas (gasta mais energia)"
                  className={cn('flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold', think ? 'border-gold/30 bg-gold/10 text-gold' : 'border-line text-fg-3 hover:text-fg-2')}
                >
                  <Brain weight={think ? 'fill' : 'regular'} /> Pensar mais
                </button>
                <div className="ml-auto">
                  {busy ? (
                    <Button size="sm" variant="danger" onClick={() => abortRef.current?.abort()}>
                      <Stop weight="fill" /> Parar
                    </Button>
                  ) : (
                    <button
                      onClick={() => send(input)}
                      disabled={!input.trim()}
                      className="flex size-9 items-center justify-center rounded-xl bg-gold-grad text-gold-ink disabled:opacity-30"
                    >
                      <ArrowUp weight="bold" className="size-5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-1.5 text-center text-[11px] text-fg-3">IA local pode errar. Em saúde, confira a fonte citada e procure atendimento quando possível.</div>
          </div>
        </div>
      </section>

      <Modal open={!!viewer} onClose={() => setViewer(null)} title={viewer?.title ?? ''} wide>
        {viewer && (
          <div className="-m-5">
            <iframe src={viewer.url} className="h-[70vh] w-full rounded-b-2xl bg-white" title={viewer.title} />
          </div>
        )}
      </Modal>
    </div>
  )
}
